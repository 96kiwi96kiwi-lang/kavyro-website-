// Read-only verifier for independently observed token-balance deltas in a finalized CPMM transaction.
// It does not trust caller booleans and cannot authorize payout.

import { KAVYRO_MINT } from './config.js';
import { RAYDIUM_CPMM_PROGRAM_ID } from './raydium-cpmm-pool-reader.js';
import { verifyRaydiumCpmmDepositInstruction } from './raydium-cpmm-deposit-verifier.js';

/** @typedef {{index:number,mint:string,owner:string,amount:bigint}} NormalizedBalance */
/** @param {unknown} v */
const str = (v) => typeof v === 'string' ? v.trim() : '';

/** @param {unknown} v */
function amount(v) {
  if (!v || typeof v !== 'object' || !('amount' in v) || typeof v.amount !== 'string' || !/^\d+$/.test(v.amount)) return null;
  return BigInt(v.amount);
}

/**
 * Extract a wallet KVRO debit and LP mint credit from finalized jsonParsed RPC evidence.
 * Pool/program identity and LP mint come from independently verified pool evidence.
 * @param {unknown} txEvidence
 * @param {{wallet:string,poolId:string,lpMint:string,poolProgramId?:string}} expected
 */
export function verifyCpmmContributionDeltas(txEvidence, expected) {
  if (!txEvidence || typeof txEvidence !== 'object' || !expected) throw new Error('CPMM_CONTRIBUTION_EVIDENCE_REQUIRED');
  const e = /** @type {Record<string, unknown>} */ (txEvidence);
  if (e.exists !== true || e.finalized !== true || !str(e.signature) ||
      !Number.isSafeInteger(e.slot) || /** @type {number} */(e.slot) <= 0 ||
      !Number.isSafeInteger(e.blockTimeSeconds) || /** @type {number} */(e.blockTimeSeconds) < 0) {
    throw new Error('CPMM_CONTRIBUTION_PROVENANCE_INVALID');
  }
  const wallet=str(expected.wallet), poolId=str(expected.poolId), lpMint=str(expected.lpMint);
  const program=str(expected.poolProgramId ?? RAYDIUM_CPMM_PROGRAM_ID);
  if (!wallet || !poolId || !lpMint || program !== RAYDIUM_CPMM_PROGRAM_ID) throw new Error('CPMM_CONTRIBUTION_IDENTITY_INVALID');
  if (!e.transaction || typeof e.transaction !== 'object' || !e.meta || typeof e.meta !== 'object') throw new Error('CPMM_CONTRIBUTION_TRANSACTION_INVALID');
  const tx=/** @type {Record<string,unknown>} */(e.transaction), meta=/** @type {Record<string,unknown>} */(e.meta);
  const message=tx.message;
  if (!message || typeof message !== 'object') throw new Error('CPMM_CONTRIBUTION_MESSAGE_INVALID');
  const m=/** @type {Record<string,unknown>} */(message);
  const keys=Array.isArray(m.accountKeys) ? m.accountKeys : [];
  const keyStrings=keys.map(k => typeof k === 'string' ? k : (k && typeof k === 'object' && 'pubkey' in k ? str(k.pubkey) : ''));
  if (!keyStrings.includes(wallet) || !keyStrings.includes(poolId) || !keyStrings.includes(program)) throw new Error('CPMM_CONTRIBUTION_ACCOUNT_BINDING_MISMATCH');

  const pre=Array.isArray(meta.preTokenBalances) ? meta.preTokenBalances : [];
  const post=Array.isArray(meta.postTokenBalances) ? meta.postTokenBalances : [];
  /** @param {unknown} b @returns {NormalizedBalance} */
  const norm=(b)=>{
    if(!b||typeof b!=='object') throw new Error('CPMM_CONTRIBUTION_TOKEN_BALANCE_ENTRY_INVALID');
    const x=/** @type {Record<string,unknown>} */(b);
    if(!Number.isSafeInteger(x.accountIndex) || /** @type {number} */(x.accountIndex)<0) {
      throw new Error('CPMM_CONTRIBUTION_TOKEN_BALANCE_INDEX_INVALID');
    }
    const index=/** @type {number} */(x.accountIndex);
    if(index>=keyStrings.length || !keyStrings[index]) {
      throw new Error('CPMM_CONTRIBUTION_TOKEN_BALANCE_ACCOUNT_BINDING_INVALID');
    }
    const mint=str(x.mint), owner=str(x.owner), tokenAmount=amount(x.uiTokenAmount);
    if(!mint||!owner) throw new Error('CPMM_CONTRIBUTION_TOKEN_BALANCE_IDENTITY_INVALID');
    if(tokenAmount===null) throw new Error('CPMM_CONTRIBUTION_TOKEN_AMOUNT_INVALID');
    return {index,mint,owner,amount:tokenAmount};
  };
  const before=pre.map(norm), after=post.map(norm);
  /** @param {readonly NormalizedBalance[]} balances */
  const requireUniqueIndices=(balances)=>{
    const seen=new Set();
    for(const balance of balances) {
      if(seen.has(balance.index)) throw new Error('CPMM_CONTRIBUTION_TOKEN_BALANCE_INDEX_DUPLICATE');
      seen.add(balance.index);
    }
  };
  requireUniqueIndices(before);
  requireUniqueIndices(after);
  // Balance deltas are necessary but not sufficient: bind them to the exact token accounts
  // named by the published Raydium CPMM deposit instruction.
  const deposit=verifyRaydiumCpmmDepositInstruction(txEvidence,{wallet,poolId,lpMint});
  /** @param {readonly NormalizedBalance[]} balances @param {string} mint @param {string} owner @param {string} account */
  const indicesFor=(balances,mint,owner,account)=>new Set(balances.filter(x=>x.mint===mint&&x.owner===owner&&keyStrings[x.index]===account).map(x=>x.index));
  const kvroBeforeIndices=indicesFor(before,KAVYRO_MINT,wallet,deposit.kvroSourceAccount);
  const kvroAfterIndices=indicesFor(after,KAVYRO_MINT,wallet,deposit.kvroSourceAccount);
  if (kvroBeforeIndices.size!==1 || kvroAfterIndices.size!==1 ||
      [...kvroBeforeIndices].some(index=>!kvroAfterIndices.has(index))) {
    throw new Error('CPMM_CONTRIBUTION_KVRO_BALANCE_CONTINUITY_REQUIRED');
  }
  /** @param {string} mint @param {string} owner @param {string} account */
  const delta=(mint,owner,account)=>{
    const indices=new Set([...before,...after].filter(x=>x.mint===mint&&x.owner===owner&&keyStrings[x.index]===account).map(x=>x.index));
    let d=0n;
    for(const i of indices){
      const postBalance=after.find(x=>x.index===i&&x.mint===mint&&x.owner===owner);
      const preBalance=before.find(x=>x.index===i&&x.mint===mint&&x.owner===owner);
      const a=postBalance ? postBalance.amount : 0n;
      const b=preBalance ? preBalance.amount : 0n;
      d += a-b;
    }
    return d;
  };
  const kvroDelta=delta(KAVYRO_MINT,wallet,deposit.kvroSourceAccount);
  const lpDelta=delta(lpMint,wallet,deposit.lpDestinationAccount);
  if (kvroDelta >= 0n) throw new Error('CPMM_CONTRIBUTION_KVRO_DEBIT_REQUIRED');
  if (lpDelta <= 0n) throw new Error('CPMM_CONTRIBUTION_LP_MINT_CREDIT_REQUIRED');
  return Object.freeze({
    finalized:true,signature:str(e.signature),wallet,poolId,poolType:'RAYDIUM_CPMM',lpMint,
    kvroMint:KAVYRO_MINT,kvroSourceOwner:wallet,kvroSourceTokenAccount:deposit.kvroSourceAccount,
    lpDestinationTokenAccount:deposit.lpDestinationAccount,kvroTransferredBaseUnits:-kvroDelta,
    lpMintedBaseUnits:lpDelta,slot:e.slot,blockTimeSeconds:e.blockTimeSeconds,payoutAuthorized:false,
  });
}
