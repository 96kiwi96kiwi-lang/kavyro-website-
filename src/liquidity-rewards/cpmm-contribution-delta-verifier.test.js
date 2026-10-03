import test from 'node:test';import assert from 'node:assert/strict';
import { verifyCpmmContributionDeltas } from './cpmm-contribution-delta-verifier.js';
import { KAVYRO_MINT } from './config.js';
import { RAYDIUM_CPMM_PROGRAM_ID } from './raydium-cpmm-pool-reader.js';
const wallet='W',poolId='P',lpMint='LP';
/** @param {number} accountIndex @param {string} mint @param {string} owner @param {string|number|bigint} amount */
const bal=(accountIndex,mint,owner,amount)=>({accountIndex,mint,owner,uiTokenAmount:{amount:String(amount),decimals:0,uiAmount:null,uiAmountString:String(amount)}});
const depositData='HJDJa2VrXJbNUhAavrZaXUuTxL8QP3r132EQwv4VAgUX';
const depositAccounts=[wallet,'AUTH',poolId,'OWNERLP','U0','U1','V0','V1',KAVYRO_MINT,'So11111111111111111111111111111111111111112',lpMint];
const tx={exists:true,finalized:true,signature:'SIG',slot:10,blockTimeSeconds:1000,transaction:{message:{accountKeys:[wallet,poolId,RAYDIUM_CPMM_PROGRAM_ID],instructions:[{programId:RAYDIUM_CPMM_PROGRAM_ID,accounts:depositAccounts,data:depositData}]}},meta:{preTokenBalances:[bal(1,KAVYRO_MINT,wallet,1000),bal(2,lpMint,wallet,5)],postTokenBalances:[bal(1,KAVYRO_MINT,wallet,700),bal(2,lpMint,wallet,25)]}};
test('derives KVRO debit and LP credit only from finalized RPC balance deltas',()=>{const r=verifyCpmmContributionDeltas(tx,{wallet,poolId,lpMint});assert.equal(r.kvroTransferredBaseUnits,300n);assert.equal(r.lpMintedBaseUnits,20n);assert.equal(r.payoutAuthorized,false);});
test('caller contribution flags or current LP balance cannot replace historical deltas',()=>{assert.throws(()=>verifyCpmmContributionDeltas({verified:true,contributionProven:true,lpAmountBaseUnits:20n},{wallet,poolId,lpMint}),/PROVENANCE/);});
test('fails closed when wallet pool or CPMM program binding is absent',()=>{assert.throws(()=>verifyCpmmContributionDeltas({...tx,transaction:{message:{accountKeys:[wallet,RAYDIUM_CPMM_PROGRAM_ID]}}},{wallet,poolId,lpMint}),/BINDING/);assert.throws(()=>verifyCpmmContributionDeltas(tx,{wallet,poolId,lpMint,poolProgramId:'CLMM'}),/IDENTITY/);});
test('fails closed on mint change, missing KVRO debit, or missing LP credit',()=>{assert.throws(()=>verifyCpmmContributionDeltas(tx,{wallet,poolId,lpMint:'OTHER'}),/LP_MINT_CREDIT/);const noDebit={...tx,meta:{...tx.meta,postTokenBalances:[bal(1,KAVYRO_MINT,wallet,1100),bal(2,lpMint,wallet,25)]}};assert.throws(()=>verifyCpmmContributionDeltas(noDebit,{wallet,poolId,lpMint}),/KVRO_DEBIT/);});
test('rejects non-finalized or malformed evidence',()=>{assert.throws(()=>verifyCpmmContributionDeltas({...tx,finalized:false},{wallet,poolId,lpMint}),/PROVENANCE/);assert.throws(()=>verifyCpmmContributionDeltas({...tx,slot:0},{wallet,poolId,lpMint}),/PROVENANCE/);});
