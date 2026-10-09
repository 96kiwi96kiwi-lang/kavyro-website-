import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifiedContributionComposition } from './verified-contribution-composition.js';
import { KAVYRO_MINT } from './config.js';
import { RAYDIUM_CPMM_PROGRAM_ID } from './raydium-cpmm-pool-reader.js';

const wallet='W',poolId='P',lpMint='LP',signature='SIG',tokenAccount='TA';
const ownership={verified:true,evidenceKind:'CURRENT_CPMM_LP_OWNERSHIP',wallet,poolId,tokenAccount,lpMint,poolContextSlot:100,tokenAccountContextSlot:101};
const balance=(accountIndex,mint,amount)=>({accountIndex,mint,owner:wallet,uiTokenAmount:{amount:String(amount),decimals:0}});
const transaction={exists:true,finalized:true,signature,slot:900,blockTimeSeconds:1000,transaction:{message:{accountKeys:[wallet,poolId,RAYDIUM_CPMM_PROGRAM_ID],instructions:[{programId:RAYDIUM_CPMM_PROGRAM_ID,accounts:[wallet,'AUTH',poolId,'OWNERLP','U0','U1','V0','V1',KAVYRO_MINT,'So11111111111111111111111111111111111111112',lpMint],data:'HJDJa2VrXJbNUhAavrZaXUuTxL8QP3r132EQwv4VAgUX'}]}},meta:{preTokenBalances:[balance(1,KAVYRO_MINT,1000),balance(2,lpMint,5)],postTokenBalances:[balance(1,KAVYRO_MINT,700),balance(2,lpMint,25)]}};
const request={signature,wallet,poolId,tokenAccount};
const compose=(tx)=>createVerifiedContributionComposition({ownershipVerifier:{verifyCurrentOwnership:async()=>ownership},transactionReader:{readFinalizedTransaction:async()=>tx},nowSeconds:()=>1010,maxReceiptAgeSeconds:60});

test('same finalized signature yields stable evidence id, not two independent deposits',async()=>{
 const first=await compose(transaction).verify(request);
 const replay=await compose(transaction).verify(request);
 assert.equal(first.contributionEvidenceId,replay.contributionEvidenceId);
 assert.equal(first.contributedKvroBaseUnits,replay.contributedKvroBaseUnits);
 assert.equal(first.payoutAuthorized,false);
 assert.equal(replay.payoutAuthorized,false);
});
test('a non-finalized replay cannot enter entitlement',async()=>{
 await assert.rejects(()=>compose({...transaction,finalized:false}).verify(request));
});
test('same signature with changed historical KVRO delta must not silently retain original amount',async()=>{
 const changed={...transaction,meta:{...transaction.meta,postTokenBalances:[balance(1,KAVYRO_MINT,650),balance(2,lpMint,25)]}};
 const original=await compose(transaction).verify(request);
 const replay=await compose(changed).verify(request);
 assert.equal(original.contributionEvidenceId,replay.contributionEvidenceId);
 assert.notEqual(original.contributedKvroBaseUnits,replay.contributedKvroBaseUnits);
 // Consumers MUST key deduplication on evidence id and reject conflicting replay payloads.
});
