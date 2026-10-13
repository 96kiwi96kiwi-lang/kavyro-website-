import test from 'node:test';import assert from 'node:assert/strict';
import { verifyCpmmContributionDeltas } from './cpmm-contribution-delta-verifier.js';
import { KAVYRO_MINT } from './config.js';
import { RAYDIUM_CPMM_PROGRAM_ID } from './raydium-cpmm-pool-reader.js';
import { SPL_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from './solana-token-account-reader.js';
const wallet='W',poolId='P',lpMint='LP',kvroSource='KVRO_SOURCE',lpDestination='LP_DEST';
/** @param {number} accountIndex @param {string} mint @param {string} owner @param {string|number|bigint} amount */
const bal=(accountIndex,mint,owner,amount)=>({accountIndex,mint,owner,uiTokenAmount:{amount:String(amount),decimals:0,uiAmount:null,uiAmountString:String(amount)}});
const depositData='HJDJa2VrXJbNUhAavrZaXUuTxL8QP3r132EQwv4VAgUX';
const depositAccounts=[wallet,'AUTH',poolId,lpDestination,kvroSource,'QUOTE_SOURCE','V0','V1',SPL_TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,KAVYRO_MINT,'So11111111111111111111111111111111111111112',lpMint];
const tx={exists:true,finalized:true,signature:'SIG',slot:10,blockTimeSeconds:1000,transaction:{message:{accountKeys:[wallet,kvroSource,lpDestination,poolId,RAYDIUM_CPMM_PROGRAM_ID],instructions:[{programId:RAYDIUM_CPMM_PROGRAM_ID,accounts:depositAccounts,data:depositData}]}},meta:{preTokenBalances:[bal(1,KAVYRO_MINT,wallet,1000),bal(2,lpMint,wallet,5)],postTokenBalances:[bal(1,KAVYRO_MINT,wallet,700),bal(2,lpMint,wallet,25)]}};
test('derives KVRO debit and LP credit only from finalized RPC balance deltas',()=>{const r=verifyCpmmContributionDeltas(tx,{wallet,poolId,lpMint});assert.equal(r.kvroTransferredBaseUnits,300n);assert.equal(r.lpMintedBaseUnits,20n);assert.equal(r.quoteMint,'So11111111111111111111111111111111111111112');assert.equal(r.kvroSourceTokenAccount,kvroSource);assert.equal(r.lpDestinationTokenAccount,lpDestination);assert.equal(r.payoutAuthorized,false);});
test('caller contribution flags or current LP balance cannot replace historical deltas',()=>{assert.throws(()=>verifyCpmmContributionDeltas({verified:true,contributionProven:true,lpAmountBaseUnits:20n},{wallet,poolId,lpMint}),/PROVENANCE/);});
test('fails closed when wallet pool or CPMM program binding is absent',()=>{assert.throws(()=>verifyCpmmContributionDeltas({...tx,transaction:{message:{accountKeys:[wallet,RAYDIUM_CPMM_PROGRAM_ID]}}},{wallet,poolId,lpMint}),/BINDING/);assert.throws(()=>verifyCpmmContributionDeltas(tx,{wallet,poolId,lpMint,poolProgramId:'CLMM'}),/IDENTITY/);});
test('fails closed on mint change, missing KVRO debit, or missing LP credit',()=>{assert.throws(()=>verifyCpmmContributionDeltas(tx,{wallet,poolId,lpMint:'OTHER'}),/ACCOUNT_BINDING_MISMATCH/);const noDebit={...tx,meta:{...tx.meta,postTokenBalances:[bal(1,KAVYRO_MINT,wallet,1100),bal(2,lpMint,wallet,25)]}};assert.throws(()=>verifyCpmmContributionDeltas(noDebit,{wallet,poolId,lpMint}),/KVRO_DEBIT/);});
test('rejects non-finalized or malformed evidence',()=>{assert.throws(()=>verifyCpmmContributionDeltas({...tx,finalized:false},{wallet,poolId,lpMint}),/PROVENANCE/);assert.throws(()=>verifyCpmmContributionDeltas({...tx,slot:0},{wallet,poolId,lpMint}),/PROVENANCE/);});

test('missing LP credit is rejected after matching deposit identity',()=>{
 const noCredit={...tx,meta:{...tx.meta,postTokenBalances:[bal(1,KAVYRO_MINT,wallet,700),bal(2,lpMint,wallet,5)]}};
 assert.throws(()=>verifyCpmmContributionDeltas(noCredit,{wallet,poolId,lpMint}),/LP_MINT_CREDIT/);
});
test('malformed existing token amounts cannot be substituted with zero',()=>{
 for(const side of ['preTokenBalances','postTokenBalances']) {
  for(const index of [0,1]) {
   const bad=structuredClone(tx);
   const balances=side==='preTokenBalances'?bad.meta.preTokenBalances:bad.meta.postTokenBalances;
   balances[index].uiTokenAmount.amount='invalid';
   assert.throws(()=>verifyCpmmContributionDeltas(bad,{wallet,poolId,lpMint}),/TOKEN_AMOUNT_INVALID/);
  }
 }
});

test('rejects missing or relabeled canonical KVRO post-balance instead of treating it as zero',()=>{
 const missingPost={...tx,meta:{...tx.meta,postTokenBalances:[bal(1,'FAKE',wallet,700),bal(2,lpMint,wallet,25)]}};
 assert.throws(()=>verifyCpmmContributionDeltas(missingPost,{wallet,poolId,lpMint}),/KVRO_BALANCE_CONTINUITY/);
 const missingPre={...tx,meta:{...tx.meta,preTokenBalances:[bal(1,'FAKE',wallet,1000),bal(2,lpMint,wallet,5)]}};
 assert.throws(()=>verifyCpmmContributionDeltas(missingPre,{wallet,poolId,lpMint}),/KVRO_BALANCE_CONTINUITY/);
});
test('permits a newly created LP destination while keeping canonical KVRO continuity strict',()=>{
 const newLpAccount={...tx,meta:{...tx.meta,preTokenBalances:[bal(1,KAVYRO_MINT,wallet,1000)]}};
 const result=verifyCpmmContributionDeltas(newLpAccount,{wallet,poolId,lpMint});
 assert.equal(result.kvroTransferredBaseUnits,300n);
 assert.equal(result.lpMintedBaseUnits,25n);
});

test('rejects malformed token-balance account indices fail closed',()=>{
 for(const invalid of [-1,1.5,'1',null,undefined]) {
  const bad=/** @type {any} */(structuredClone(tx));
  bad.meta.preTokenBalances[0].accountIndex=invalid;
  assert.throws(()=>verifyCpmmContributionDeltas(bad,{wallet,poolId,lpMint}),/TOKEN_BALANCE_INDEX_INVALID/);
 }
 const malformedEntry=/** @type {any} */(structuredClone(tx));
 malformedEntry.meta.postTokenBalances.push(null);
 assert.throws(()=>verifyCpmmContributionDeltas(malformedEntry,{wallet,poolId,lpMint}),/TOKEN_BALANCE_ENTRY_INVALID/);
});
test('rejects duplicate account indices independently in pre and post balances',()=>{
 for(const side of ['preTokenBalances','postTokenBalances']) {
  const bad=/** @type {any} */(structuredClone(tx));
  bad.meta[side].push({...bad.meta[side][0]});
  assert.throws(()=>verifyCpmmContributionDeltas(bad,{wallet,poolId,lpMint}),/TOKEN_BALANCE_INDEX_DUPLICATE/);
 }
});

test('rejects token-balance indices that do not bind to transaction account keys',()=>{
 for(const side of ['preTokenBalances','postTokenBalances']) {
  const bad=/** @type {any} */(structuredClone(tx));
  bad.meta[side][0].accountIndex=bad.transaction.message.accountKeys.length;
  assert.throws(()=>verifyCpmmContributionDeltas(bad,{wallet,poolId,lpMint}),/TOKEN_BALANCE_ACCOUNT_BINDING_INVALID/);
 }
});

test('unrelated wallet-owned token accounts cannot substitute for instruction-bound deltas',()=>{
 const unrelatedKvro='UNRELATED_KVRO',unrelatedLp='UNRELATED_LP';
 const bad=structuredClone(tx);
 bad.transaction.message.accountKeys.push(unrelatedKvro,unrelatedLp);
 bad.meta.preTokenBalances=[
  bal(1,KAVYRO_MINT,wallet,1000),bal(2,lpMint,wallet,5),
  bal(5,KAVYRO_MINT,wallet,1000),bal(6,lpMint,wallet,5),
 ];
 bad.meta.postTokenBalances=[
  bal(1,KAVYRO_MINT,wallet,1000),bal(2,lpMint,wallet,5),
  bal(5,KAVYRO_MINT,wallet,700),bal(6,lpMint,wallet,25),
 ];
 assert.throws(()=>verifyCpmmContributionDeltas(bad,{wallet,poolId,lpMint}),/KVRO_DEBIT_REQUIRED/);
});
