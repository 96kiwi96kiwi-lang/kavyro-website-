// Read-only verifier for independently observed token-balance deltas in a finalized CPMM transaction.
// It does not trust caller booleans and cannot authorize payout.

import { KAVYRO_MINT } from './config.js';
import { RAYDIUM_CPMM_PROGRAM_ID } from './raydium-cpmm-pool-reader.js';
import { verifyRaydiumCpmmDepositInstruction } from './raydium-cpmm-deposit-verifier.js';

/** @typedef {{index:number,mint:string,owner:string,amount:bigint}} NormalizedBalance */
/** @param {unknown} v */
const str = (v) => typeof v === 'string' ? v.trim() : '';

/** @param {unknown} v */
const canonicalIdentity = (v) => typeof v === 'string' && v.length > 0 && v === str(v) &&
  ![...v].some(character => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });

/** @param {unknown} v @param {PropertyKey} key */
function ownDataValue(v,key) {
  if (!v || typeof v !== 'object') return null;
  try {
    const descriptor=Object.getOwnPropertyDescriptor(v,key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

/** @param {unknown} v */
function amount(v) {
  const raw=ownDataValue(v,'amount');
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  return BigInt(raw);
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
  const exists=e.exists, finalized=e.finalized, signature=e.signature,
    slot=e.slot, blockTimeSeconds=e.blockTimeSeconds;
  if (exists !== true || finalized !== true || typeof signature !== 'string' ||
      signature !== str(signature) || !signature ||
      !Number.isSafeInteger(slot) || /** @type {number} */(slot) <= 0 ||
      !Number.isSafeInteger(blockTimeSeconds) || /** @type {number} */(blockTimeSeconds) < 0) {
    throw new Error('CPMM_CONTRIBUTION_PROVENANCE_INVALID');
  }
  const walletValue=expected.wallet, poolValue=expected.poolId, lpMintValue=expected.lpMint;
  const wallet=str(walletValue), poolId=str(poolValue), lpMint=str(lpMintValue);
  const programValue=expected.poolProgramId ?? RAYDIUM_CPMM_PROGRAM_ID;
  const program=str(programValue);
  if (!canonicalIdentity(walletValue) || !canonicalIdentity(poolValue) ||
      !canonicalIdentity(lpMintValue) || !canonicalIdentity(programValue) ||
      program !== RAYDIUM_CPMM_PROGRAM_ID) {
    throw new Error('CPMM_CONTRIBUTION_IDENTITY_INVALID');
  }
  const transactionValue=ownDataValue(e,'transaction');
  const metaValue=ownDataValue(e,'meta');
  if (!transactionValue || typeof transactionValue !== 'object' || !metaValue || typeof metaValue !== 'object') throw new Error('CPMM_CONTRIBUTION_TRANSACTION_INVALID');
  const tx=/** @type {Record<string,unknown>} */(transactionValue), meta=/** @type {Record<string,unknown>} */(metaValue);
  const stableEvidence=Object.freeze({exists,finalized,signature,slot,blockTimeSeconds,transaction:tx,meta});
  const message=ownDataValue(tx,'message');
  if (!message || typeof message !== 'object') throw new Error('CPMM_CONTRIBUTION_MESSAGE_INVALID');
  const m=/** @type {Record<string,unknown>} */(message);
  const accountKeysValue=ownDataValue(m,'accountKeys');
  if (!Array.isArray(accountKeysValue)) throw new Error('CPMM_CONTRIBUTION_ACCOUNT_KEYS_INVALID');
  const keys=accountKeysValue;
  const keyStrings=keys.map(k => {
    const value=typeof k === 'string' ? k : (k && typeof k === 'object' && 'pubkey' in k ? k.pubkey : undefined);
    if (!canonicalIdentity(value)) throw new Error('CPMM_CONTRIBUTION_ACCOUNT_KEY_INVALID');
    return value;
  });
  if (!keyStrings.includes(wallet) || !keyStrings.includes(poolId) || !keyStrings.includes(program)) throw new Error('CPMM_CONTRIBUTION_ACCOUNT_BINDING_MISMATCH');

  const preValue=ownDataValue(meta,'preTokenBalances');
  const postValue=ownDataValue(meta,'postTokenBalances');
  if (!Array.isArray(preValue) || !Array.isArray(postValue)) {
    throw new Error('CPMM_CONTRIBUTION_TOKEN_BALANCES_INVALID');
  }
  const pre=preValue, post=postValue;
  /** @param {unknown} b @returns {NormalizedBalance} */
  const norm=(b)=>{
    if(!b||typeof b!=='object') throw new Error('CPMM_CONTRIBUTION_TOKEN_BALANCE_ENTRY_INVALID');
    const x=/** @type {Record<string,unknown>} */(b);
    const accountIndex=ownDataValue(x,'accountIndex');
    if(!Number.isSafeInteger(accountIndex) || /** @type {number} */(accountIndex)<0) {
      throw new Error('CPMM_CONTRIBUTION_TOKEN_BALANCE_INDEX_INVALID');
    }
    const index=/** @type {number} */(accountIndex);
    if(index>=keyStrings.length || !keyStrings[index]) {
      throw new Error('CPMM_CONTRIBUTION_TOKEN_BALANCE_ACCOUNT_BINDING_INVALID');
    }
    const mintValue=ownDataValue(x,'mint'), ownerValue=ownDataValue(x,'owner');
    const uiTokenAmount=ownDataValue(x,'uiTokenAmount');
    const mint=str(mintValue), owner=str(ownerValue), tokenAmount=amount(uiTokenAmount);
    if(!canonicalIdentity(mintValue)||!canonicalIdentity(ownerValue)) throw new Error('CPMM_CONTRIBUTION_TOKEN_BALANCE_IDENTITY_INVALID');
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
  const deposit=verifyRaydiumCpmmDepositInstruction(stableEvidence,{wallet,poolId,lpMint});
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
    finalized:true,signature,wallet,poolId,poolType:'RAYDIUM_CPMM',lpMint,
    kvroMint:KAVYRO_MINT,quoteMint:deposit.quoteMint,kvroSourceOwner:wallet,kvroSourceTokenAccount:deposit.kvroSourceAccount,
    lpDestinationTokenAccount:deposit.lpDestinationAccount,kvroTransferredBaseUnits:-kvroDelta,
    lpMintedBaseUnits:lpDelta,slot,blockTimeSeconds,payoutAuthorized:false,
  });
}
