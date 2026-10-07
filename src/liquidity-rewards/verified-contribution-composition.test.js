import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifiedContributionComposition } from './verified-contribution-composition.js';
import { KAVYRO_MINT } from './config.js';
import { RAYDIUM_CPMM_PROGRAM_ID } from './raydium-cpmm-pool-reader.js';

const request={signature:'SIG',wallet:'W',poolId:'P',tokenAccount:'TA'};
const ownership={verified:true,evidenceKind:'CURRENT_CPMM_LP_OWNERSHIP',wallet:'W',poolId:'P',tokenAccount:'TA',lpMint:'LP',poolContextSlot:100,tokenAccountContextSlot:101};

/** @param {Record<string, unknown>} [overrides] */
function deps(overrides={}) {
  return {
    ownershipVerifier:{verifyCurrentOwnership:async()=>ownership},
    transactionReader:{readFinalizedTransaction:async()=>({})},
    nowSeconds:()=>1000,
    maxReceiptAgeSeconds:60,
    ...overrides,
  };
}

test('production composition fails closed when ownership identity is not verifier-bound',async()=>{
  for (const bad of [
    {...ownership,wallet:'OTHER'},
    {...ownership,poolId:'OTHER'},
    {...ownership,tokenAccount:'OTHER'},
    {...ownership,verified:false},
    {...ownership,evidenceKind:'CALLER_SUPPLIED'},
  ]) {
    const composition=createVerifiedContributionComposition(deps({ownershipVerifier:{verifyCurrentOwnership:async()=>bad}}));
    await assert.rejects(()=>composition.verify(request),/VERIFIER_OWNED_LP_EVIDENCE_REQUIRED/);
  }
});

test('transaction reader failure is propagated and cannot become entitlement evidence',async()=>{
  const composition=createVerifiedContributionComposition(deps({
    transactionReader:{readFinalizedTransaction:async()=>{throw new Error('FINALIZED_TRANSACTION_REQUIRED');}},
  }));
  await assert.rejects(()=>composition.verify(request),/FINALIZED_TRANSACTION_REQUIRED/);
});

test('caller cannot supply LP mint, contribution amount or proof flags through request',async()=>{
  /** @type {{wallet:string,poolId:string,tokenAccount:string}|undefined} */
  let seen;
  const composition=createVerifiedContributionComposition(deps({
    ownershipVerifier:{verifyCurrentOwnership:async(/** @type {{wallet:string,poolId:string,tokenAccount:string}} */ r)=>{seen=r; throw new Error('STOP_AFTER_OWNERSHIP_REQUEST');}},
  }));
  const spoofedRequest=/** @type {any} */({...request,lpMint:'SPOOFED',contributedKvroBaseUnits:999999n,ownershipProven:true});
  await assert.rejects(()=>composition.verify(spoofedRequest),/STOP_AFTER_OWNERSHIP_REQUEST/);
  assert.deepEqual(seen,{wallet:'W',poolId:'P',tokenAccount:'TA'});
});

test('composition exposes read-only capabilities only',()=>{
  const composition=createVerifiedContributionComposition(deps());
  assert.deepEqual(composition.capabilities,{read:true,buildTransaction:false,signTransaction:false,sendTransaction:false});
});


const depositData='HJDJa2VrXJbNUhAavrZaXUuTxL8QP3r132EQwv4VAgUX';
const depositAccounts=['W','AUTH','P','OWNERLP','U0','U1','V0','V1',KAVYRO_MINT,'So11111111111111111111111111111111111111112','LP'];
/** @param {number} accountIndex @param {string} mint @param {string} owner @param {string|number|bigint} amount */
const bal=(accountIndex,mint,owner,amount)=>({accountIndex,mint,owner,uiTokenAmount:{amount:String(amount),decimals:0,uiAmount:null,uiAmountString:String(amount)}});
const finalizedTx={exists:true,finalized:true,signature:'SIG',slot:900,blockTimeSeconds:1000,transaction:{message:{accountKeys:['W','P',RAYDIUM_CPMM_PROGRAM_ID],instructions:[{programId:RAYDIUM_CPMM_PROGRAM_ID,accounts:depositAccounts,data:depositData}]}},meta:{preTokenBalances:[bal(1,KAVYRO_MINT,'W',1000),bal(2,'LP','W',5)],postTokenBalances:[bal(1,KAVYRO_MINT,'W',700),bal(2,'LP','W',25)]}};

test('positive composition binds verifier provenance, signature, wallet, pool, LP mint, LP position and historical KVRO amount',async()=>{
 let ownershipRequest;let transactionSignature;
 const composition=createVerifiedContributionComposition({
  ownershipVerifier:{verifyCurrentOwnership:async(r)=>{ownershipRequest=r;return ownership;}},
  transactionReader:{readFinalizedTransaction:async(signature)=>{transactionSignature=signature;return finalizedTx;}},
  nowSeconds:()=>1010,maxReceiptAgeSeconds:60,
 });
 const result=await composition.verify(request);
 assert.deepEqual(ownershipRequest,{wallet:'W',poolId:'P',tokenAccount:'TA'});
 assert.equal(transactionSignature,'SIG');
 assert.equal(result.verified,true);
 assert.equal(result.wallet,'W');
 assert.equal(result.poolId,'P');
 assert.equal(result.lpMint,'LP');
 assert.equal(result.positionId,'TA');
 assert.equal(result.contributedKvroBaseUnits,300n);
 assert.equal(result.contributionEvidenceId,'SIG:P:W');
 assert.equal(result.ownershipEvidenceId,'TA:100:101');
 assert.equal(result.payoutAuthorized,false);
});


test('fails closed when finalized evidence signature differs from the requested signature',async()=>{
 const composition=createVerifiedContributionComposition({
  ownershipVerifier:{verifyCurrentOwnership:async()=>ownership},
  transactionReader:{readFinalizedTransaction:async()=>({...finalizedTx,signature:'OTHER'})},
  nowSeconds:()=>1010,maxReceiptAgeSeconds:60,
 });
 await assert.rejects(()=>composition.verify(request),/CONTRIBUTION_SIGNATURE_MISMATCH/);
});

test('fails closed when verifier-owned LP provenance slots are missing or invalid',async()=>{
 for (const bad of [
  {...ownership,poolContextSlot:undefined},
  {...ownership,poolContextSlot:0},
  {...ownership,tokenAccountContextSlot:-1},
  {...ownership,tokenAccountContextSlot:1.5},
 ]) {
  const composition=createVerifiedContributionComposition(deps({ownershipVerifier:{verifyCurrentOwnership:async()=>bad}}));
  await assert.rejects(()=>composition.verify(request),/VERIFIER_OWNED_LP_PROVENANCE_REQUIRED/);
 }
});
