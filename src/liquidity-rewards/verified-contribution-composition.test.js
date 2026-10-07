import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifiedContributionComposition } from './verified-contribution-composition.js';

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
