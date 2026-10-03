// Read-only semantic verifier for the concrete Raydium CPMM Anchor deposit instruction.
// Pinned to Raydium's published CPMM IDL deposit discriminator/account order.
import { KAVYRO_MINT } from './config.js';
import { RAYDIUM_CPMM_PROGRAM_ID } from './raydium-cpmm-pool-reader.js';

export const RAYDIUM_CPMM_DEPOSIT_DISCRIMINATOR = Object.freeze([242,35,198,137,82,225,242,182]);
const BASE58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
/** @param {unknown} v */
const text=(v)=>typeof v==='string'?v.trim():'';
/** @param {unknown} s @returns {Uint8Array|null} */
function b58(s){if(typeof s!=='string'||!s)return null;let n=0n;for(const c of s){const i=BASE58.indexOf(c);if(i<0)return null;n=n*58n+BigInt(i);}const a=[];while(n){a.push(Number(n&255n));n>>=8n;}for(const c of s){if(c!=='1')break;a.push(0);}return Uint8Array.from(a.reverse());}
/** @param {unknown} v @returns {string} */
const key=(v)=>typeof v==='string'?v:(v&&typeof v==='object'&&'pubkey'in v?text(v.pubkey):'');

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
 const wallet=text(expected.wallet),poolId=text(expected.poolId),lpMint=text(expected.lpMint);
 if(!wallet||!poolId||!lpMint)throw new Error('CPMM_DEPOSIT_IDENTITY_REQUIRED');
 const tx=e.transaction;if(!tx||typeof tx!=='object')throw new Error('CPMM_DEPOSIT_TRANSACTION_INVALID');
 const msg=/** @type {Record<string,unknown>} */(tx).message;if(!msg||typeof msg!=='object')throw new Error('CPMM_DEPOSIT_MESSAGE_INVALID');
 const instructions=Array.isArray(/** @type {Record<string,unknown>} */(msg).instructions)?/** @type {Record<string,unknown>} */(msg).instructions:[];
 for(const raw of instructions){
  if(!raw||typeof raw!=='object')continue;const ix=/** @type {Record<string,unknown>} */(raw);
  if(key(ix.programId)!==RAYDIUM_CPMM_PROGRAM_ID||!Array.isArray(ix.accounts))continue;
  const accounts=ix.accounts.map(key);if(accounts.length<11)continue;
  const data=b58(ix.data);if(!data||data.length<8)continue;
  if(!RAYDIUM_CPMM_DEPOSIT_DISCRIMINATOR.every((v,i)=>data[i]===v))continue;
  if(accounts[0]!==wallet||accounts[2]!==poolId||accounts[10]!==lpMint)throw new Error('CPMM_DEPOSIT_ACCOUNT_BINDING_MISMATCH');
  if(accounts[8]!==KAVYRO_MINT&&accounts[9]!==KAVYRO_MINT)throw new Error('CPMM_DEPOSIT_KVRO_MINT_MISMATCH');
  return Object.freeze({verified:true,semanticKind:'RAYDIUM_CPMM_DEPOSIT',wallet,poolId,lpMint,kvroMint:KAVYRO_MINT,slot:e.slot,blockTimeSeconds:e.blockTimeSeconds,payoutAuthorized:false});
 }
 throw new Error('CPMM_DEPOSIT_INSTRUCTION_REQUIRED');
}
