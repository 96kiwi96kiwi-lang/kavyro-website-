// Read-only semantic verifier for the concrete Raydium CPMM Anchor deposit instruction.
// Pinned to Raydium's published CPMM IDL deposit discriminator/account order.
import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';
import { RAYDIUM_CPMM_PROGRAM_ID } from './raydium-cpmm-pool-reader.js';
import { SPL_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from './solana-token-account-reader.js';

export const RAYDIUM_CPMM_DEPOSIT_DISCRIMINATOR = Object.freeze([242,35,198,137,82,225,242,182]);
const BASE58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
/** @param {unknown} s @returns {Uint8Array|null} */
function b58(s){if(typeof s!=='string'||!s)return null;let n=0n;for(const c of s){const i=BASE58.indexOf(c);if(i<0)return null;n=n*58n+BigInt(i);}const a=[];while(n){a.push(Number(n&255n));n>>=8n;}for(const c of s){if(c!=='1')break;a.push(0);}return Uint8Array.from(a.reverse());}
/** @param {unknown} value @param {PropertyKey} key @returns {unknown} */
function ownDataValue(value, key) {
  if (!value || typeof value !== 'object') return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}
/**
 * Account identities must be byte-for-byte canonical. Trimming would let a
 * padded pool, LP mint, or KVRO mint alias satisfy the deposit binding.
 * @param {unknown} value
 * @returns {string | null}
 */
function canonicalAccount(value) {
  const raw = typeof value === 'string' ? value : ownDataValue(value, 'pubkey');
  if (typeof raw !== 'string' || raw.length === 0 || raw.trim() !== raw) return null;
  for (const character of raw) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return null;
  }
  return raw;
}

/**
 * Proves that the finalized transaction actually invokes Raydium CPMM deposit,
 * with the expected signer/wallet, pool, LP mint and canonical KVRO mint in the
 * exact account positions published by Raydium's CPMM IDL.
 * @param {unknown} txEvidence
 * @param {{wallet:string,poolId:string,lpMint:string}} expected
 */
export function verifyRaydiumCpmmDepositInstruction(txEvidence,expected){
 if(!txEvidence||typeof txEvidence!=='object'||!expected)throw new Error('CPMM_DEPOSIT_EVIDENCE_REQUIRED');
 const e=/** @type {Record<string,unknown>} */(txEvidence);
 if(e.exists!==true||e.finalized!==true||!Number.isSafeInteger(e.slot)||/** @type {number} */(e.slot)<=0||!Number.isSafeInteger(e.blockTimeSeconds)||/** @type {number} */(e.blockTimeSeconds)<0)throw new Error('CPMM_DEPOSIT_PROVENANCE_INVALID');
 const wallet=canonicalAccount(expected.wallet),poolId=canonicalAccount(expected.poolId),lpMint=canonicalAccount(expected.lpMint);
 if(!wallet||!poolId||!lpMint)throw new Error('CPMM_DEPOSIT_IDENTITY_REQUIRED');
 const tx=ownDataValue(e,'transaction');if(!tx||typeof tx!=='object')throw new Error('CPMM_DEPOSIT_TRANSACTION_INVALID');
 const msg=ownDataValue(tx,'message');if(!msg||typeof msg!=='object')throw new Error('CPMM_DEPOSIT_MESSAGE_INVALID');
 const instructionValue=ownDataValue(msg,'instructions');
 const instructions=Array.isArray(instructionValue)?instructionValue:[];
 for(const raw of instructions){
  if(!raw||typeof raw!=='object')continue;
  if(canonicalAccount(ownDataValue(raw,'programId'))!==RAYDIUM_CPMM_PROGRAM_ID)continue;
  const data=b58(ownDataValue(raw,'data'));if(!data||data.length<8)continue;
  if(!RAYDIUM_CPMM_DEPOSIT_DISCRIMINATOR.every((v,i)=>data[i]===v))continue;
  const accountValue=ownDataValue(raw,'accounts');
  if(!Array.isArray(accountValue)||accountValue.length<13)throw new Error('CPMM_DEPOSIT_ACCOUNT_BINDING_MISMATCH');
  const accounts=accountValue.map(canonicalAccount);
  if(accounts.some((account)=>account===null))throw new Error('CPMM_DEPOSIT_ACCOUNT_BINDING_MISMATCH');
  if(accounts[0]!==wallet||accounts[2]!==poolId||accounts[12]!==lpMint)throw new Error('CPMM_DEPOSIT_ACCOUNT_BINDING_MISMATCH');
  if(accounts[8]!==SPL_TOKEN_PROGRAM_ID||accounts[9]!==TOKEN_2022_PROGRAM_ID)throw new Error('CPMM_DEPOSIT_TOKEN_PROGRAM_MISMATCH');
  const kvroIsToken0=accounts[10]===KAVYRO_MINT,kvroIsToken1=accounts[11]===KAVYRO_MINT;
  if(kvroIsToken0===kvroIsToken1)throw new Error('CPMM_DEPOSIT_KVRO_MINT_MISMATCH');
  const quoteMint=kvroIsToken0?accounts[11]:accounts[10];
  if(quoteMint!==WRAPPED_SOL_MINT)throw new Error('CPMM_DEPOSIT_QUOTE_MINT_MISMATCH');
  const lpDestinationAccount=accounts[3],kvroSourceAccount=kvroIsToken0?accounts[4]:accounts[5];
  if(!lpDestinationAccount||!kvroSourceAccount)throw new Error('CPMM_DEPOSIT_ACCOUNT_BINDING_MISMATCH');
  return Object.freeze({verified:true,semanticKind:'RAYDIUM_CPMM_DEPOSIT',wallet,poolId,lpMint,kvroMint:KAVYRO_MINT,quoteMint,kvroSourceAccount,lpDestinationAccount,slot:e.slot,blockTimeSeconds:e.blockTimeSeconds,payoutAuthorized:false});
 }
 throw new Error('CPMM_DEPOSIT_INSTRUCTION_REQUIRED');
}
