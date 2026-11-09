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
test('fails closed when expected contribution identities require normalization',()=>{for(const expected of [{wallet:' W ',poolId,lpMint},{wallet,poolId:' P ',lpMint},{wallet,poolId,lpMint:' LP '}])assert.throws(()=>verifyCpmmContributionDeltas(tx,expected),/IDENTITY_INVALID/);});
test('fails closed when expected contribution identities contain control characters',()=>{for(const expected of [{wallet:'W\u0000',poolId,lpMint},{wallet,poolId:'P\u001f',lpMint},{wallet,poolId,lpMint:'LP\u007f'}])assert.throws(()=>verifyCpmmContributionDeltas(tx,expected),/IDENTITY_INVALID/);});
test('fails closed when the expected CPMM program identity is noncanonical',()=>{for(const poolProgramId of [` ${RAYDIUM_CPMM_PROGRAM_ID} `,`${RAYDIUM_CPMM_PROGRAM_ID}\u0000`])assert.throws(()=>verifyCpmmContributionDeltas(tx,{wallet,poolId,lpMint,poolProgramId}),/IDENTITY_INVALID/);});
test('fails closed on accessor-backed message containers without invoking getters',()=>{const accessorMessage=structuredClone(tx);let messageReads=0;Object.defineProperty(accessorMessage.transaction,'message',{get(){messageReads+=1;throw new Error('untrusted getter');}});assert.throws(()=>verifyCpmmContributionDeltas(accessorMessage,{wallet,poolId,lpMint}),/MESSAGE_INVALID/);assert.equal(messageReads,0);const accessorKeys=structuredClone(tx);let keyReads=0;Object.defineProperty(accessorKeys.transaction.message,'accountKeys',{get(){keyReads+=1;throw new Error('untrusted getter');}});assert.throws(()=>verifyCpmmContributionDeltas(accessorKeys,{wallet,poolId,lpMint}),/ACCOUNT_KEYS_INVALID/);assert.equal(keyReads,0);});
test('fails closed when finalized transaction account keys require normalization',()=>{const paddedWallet=structuredClone(tx);paddedWallet.transaction.message.accountKeys[0]=' W ';assert.throws(()=>verifyCpmmContributionDeltas(paddedWallet,{wallet,poolId,lpMint}),/ACCOUNT_KEY_INVALID/);const paddedProgram=/** @type {any} */(structuredClone(tx));paddedProgram.transaction.message.accountKeys[4]={pubkey:`${RAYDIUM_CPMM_PROGRAM_ID}\u0000`,signer:false,writable:false};assert.throws(()=>verifyCpmmContributionDeltas(paddedProgram,{wallet,poolId,lpMint}),/ACCOUNT_KEY_INVALID/);});
test('fails closed on accessor-backed account-key pubkeys without invoking traps',()=>{const accessorKey=/** @type {any} */(structuredClone(tx));let getterReads=0;accessorKey.transaction.message.accountKeys[0]=Object.defineProperty({},'pubkey',{get(){getterReads+=1;throw new Error('untrusted getter');}});assert.throws(()=>verifyCpmmContributionDeltas(accessorKey,{wallet,poolId,lpMint}),/ACCOUNT_KEY_INVALID/);assert.equal(getterReads,0);const trappedKey=/** @type {any} */(structuredClone(tx));let descriptorReads=0,hasReads=0;trappedKey.transaction.message.accountKeys[0]=new Proxy({},{getOwnPropertyDescriptor(){descriptorReads+=1;throw new Error('untrusted descriptor');},has(){hasReads+=1;throw new Error('untrusted membership');}});assert.throws(()=>verifyCpmmContributionDeltas(trappedKey,{wallet,poolId,lpMint}),/ACCOUNT_KEY_INVALID/);assert.equal(descriptorReads,1);assert.equal(hasReads,0);});
test('fails closed when token-balance mint or owner identity requires normalization',()=>{const paddedOwner=structuredClone(tx);paddedOwner.meta.preTokenBalances[0].owner=' W ';assert.throws(()=>verifyCpmmContributionDeltas(paddedOwner,{wallet,poolId,lpMint}),/TOKEN_BALANCE_IDENTITY_INVALID/);const taintedMint=structuredClone(tx);taintedMint.meta.postTokenBalances[0].mint=`${KAVYRO_MINT}\u0000`;assert.throws(()=>verifyCpmmContributionDeltas(taintedMint,{wallet,poolId,lpMint}),/TOKEN_BALANCE_IDENTITY_INVALID/);});
test('fails closed on accessor-backed token amounts without invoking the accessor',()=>{const accessorAmount=structuredClone(tx);let reads=0;Object.defineProperty(accessorAmount.meta.preTokenBalances[0].uiTokenAmount,'amount',{get(){reads+=1;throw new Error('untrusted getter');}});assert.throws(()=>verifyCpmmContributionDeltas(accessorAmount,{wallet,poolId,lpMint}),/TOKEN_AMOUNT_INVALID/);assert.equal(reads,0);});
test('normalizes throwing token amount descriptor traps without consulting proxy membership',()=>{const trappedAmount=structuredClone(tx);let descriptorReads=0,hasReads=0;trappedAmount.meta.preTokenBalances[0].uiTokenAmount=new Proxy(trappedAmount.meta.preTokenBalances[0].uiTokenAmount,{getOwnPropertyDescriptor(){descriptorReads+=1;throw new Error('untrusted descriptor');},has(){hasReads+=1;throw new Error('untrusted membership');}});assert.throws(()=>verifyCpmmContributionDeltas(trappedAmount,{wallet,poolId,lpMint}),/TOKEN_AMOUNT_INVALID/);assert.equal(descriptorReads,1);assert.equal(hasReads,0);});
test('fails closed on accessor-backed token amount containers without invoking the accessor',()=>{const accessorContainer=structuredClone(tx);let reads=0;Object.defineProperty(accessorContainer.meta.preTokenBalances[0],'uiTokenAmount',{get(){reads+=1;throw new Error('untrusted getter');}});assert.throws(()=>verifyCpmmContributionDeltas(accessorContainer,{wallet,poolId,lpMint}),/TOKEN_AMOUNT_INVALID/);assert.equal(reads,0);});
test('fails closed on accessor-backed token balance fields without invoking getters',()=>{const cases=/** @type {Array<[PropertyKey,RegExp]>} */([['accountIndex',/TOKEN_BALANCE_INDEX_INVALID/],['mint',/TOKEN_BALANCE_IDENTITY_INVALID/],['owner',/TOKEN_BALANCE_IDENTITY_INVALID/]]);for(const [field,error] of cases){const accessorField=structuredClone(tx);let reads=0;Object.defineProperty(accessorField.meta.preTokenBalances[0],field,{get(){reads+=1;throw new Error('untrusted getter');}});assert.throws(()=>verifyCpmmContributionDeltas(accessorField,{wallet,poolId,lpMint}),error);assert.equal(reads,0);}});
test('fails closed on noncanonical top-level transaction signature provenance',()=>{assert.throws(()=>verifyCpmmContributionDeltas({...tx,signature:' SIG '},{wallet,poolId,lpMint}),/PROVENANCE_INVALID/);});
test('snapshots primitive transaction provenance before deeper evidence validation',()=>{let signatureReads=0,slotReads=0,timeReads=0;const changing={...tx,get signature(){signatureReads+=1;return signatureReads===1?'SIG':'ATTACKER';},get slot(){slotReads+=1;return slotReads===1?10:11;},get blockTimeSeconds(){timeReads+=1;return timeReads===1?1000:1001;}};const r=verifyCpmmContributionDeltas(changing,{wallet,poolId,lpMint});assert.equal(r.signature,'SIG');assert.equal(r.slot,10);assert.equal(r.blockTimeSeconds,1000);assert.equal(signatureReads,1);assert.equal(slotReads,1);assert.equal(timeReads,1);});
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

test('fails closed on accessor-backed token balance arrays without invoking getters',()=>{for(const field of ['preTokenBalances','postTokenBalances']){const accessorBalances=structuredClone(tx);let reads=0;Object.defineProperty(accessorBalances.meta,field,{get(){reads+=1;throw new Error('untrusted getter');}});assert.throws(()=>verifyCpmmContributionDeltas(accessorBalances,{wallet,poolId,lpMint}),/TOKEN_BALANCES_INVALID/);assert.equal(reads,0);}});

test('fails closed on accessor-backed transaction containers without invoking getters',()=>{for(const field of ['transaction','meta']){const accessorEvidence=structuredClone(tx);let reads=0;Object.defineProperty(accessorEvidence,field,{get(){reads+=1;throw new Error('untrusted getter');}});assert.throws(()=>verifyCpmmContributionDeltas(accessorEvidence,{wallet,poolId,lpMint}),/TRANSACTION_INVALID/);assert.equal(reads,0);}});
