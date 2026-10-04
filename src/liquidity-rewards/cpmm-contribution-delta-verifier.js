// Read-only verifier for independently observed token-balance deltas in a finalized CPMM transaction.
// It does not trust caller booleans and cannot authorize payout.

import { KAVYRO_MINT } from './config.js';
import { RAYDIUM_CPMM_PROGRAM_ID } from './raydium-cpmm-pool-reader.js';
import { verifyRaydiumCpmmDepositInstruction } from './raydium-cpmm-deposit-verifier.js';

/** @typedef {{index:unknown,mint:string,owner:string,amount:bigint|null}} NormalizedBalance */
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
  /** @param {unknown} b @returns {NormalizedBalance|null} */
  const norm=(b)=>{
    if(!b||typeof b!=='object') return null;
    const x=/** @type {Record<string,unknown>} */(b);
    return {index:x.accountIndex,mint:str(x.mint),owner:str(x.owner),amount:amount(x.uiTokenAmount)};
  };
  /** @param {NormalizedBalance|null} x @returns {x is NormalizedBalance} */
  const present=(x)=>x!==null;
  const before=pre.map(norm).filter(present), after=post.map(norm).filter(present);
  /** @param {string} mint @param {string} owner */
  const delta=(mint,owner)=>{
    const indices=new Set([...before,...after].filter(x=>x.mint===mint&&x.owner===owner).map(x=>x.index));
    let d=0n;
    for(const i of indices){
      const postBalance=after.find(x=>x.index===i&&x.mint===mint&&x.owner===owner);
      const preBalance=before.find(x=>x.index===i&&x.mint===mint&&x.owner===owner);
      const a=postBalance ? postBalance.amount : 0n;
      const b=preBalance ? preBalance.amount : 0n;
      if(a===null||b===null) throw new Error('CPMM_CONTRIBUTION_TOKEN_AMOUNT_INVALID');
      d += a-b;
    }
    return d;
  };
  // Balance deltas are necessary but not sufficient: require the concrete Raydium CPMM deposit instruction too.
  verifyRaydiumCpmmDepositInstruction(txEvidence,{wallet,poolId,lpMint});
  const kvroDelta=delta(KAVYRO_MINT,wallet);
  const lpDelta=delta(lpMint,wallet);
  if (kvroDelta >= 0n) throw new Error('CPMM_CONTRIBUTION_KVRO_DEBIT_REQUIRED');
  if (lpDelta <= 0n) throw new Error('CPMM_CONTRIBUTION_LP_MINT_CREDIT_REQUIRED');
  return Object.freeze({
    finalized:true,signature:str(e.signature),wallet,poolId,poolType:'RAYDIUM_CPMM',lpMint,
    kvroMint:KAVYRO_MINT,kvroSourceOwner:wallet,kvroTransferredBaseUnits:-kvroDelta,
    lpMintedBaseUnits:lpDelta,slot:e.slot,blockTimeSeconds:e.blockTimeSeconds,payoutAuthorized:false,
  });
}
