// KAVYRO Liquidity Rewards — independently verifiable CPMM contribution receipt boundary.
// Pure/read-only. It accepts only already-decoded finalized transaction facts from a
// verifier-owned reader. Current LP balance is deliberately insufficient.

import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';

/**
 * @param {unknown} value
 * @param {PropertyKey} key
 * @returns {unknown}
 */
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
 * Identity text must already be canonical. Trimming or control characters would
 * bind a different trust scope to the finalized signature.
 * @param {unknown} value
 * @returns {value is string}
 */
function isCanonicalIdentity(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value &&
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
    });
}

/**
 * Verify that one finalized historical CPMM liquidity-add receipt binds the
 * wallet, pool, LP mint and canonical KVRO mint and contains a positive KVRO
 * transfer plus positive LP minting. This establishes receipt facts only; it
 * does not establish current ownership, sustained eligibility or payout.
 *
 * @param {unknown} input
 */
export function verifyCpmmContributionReceipt(input) {
  if (!input || typeof input !== 'object') throw new Error('CONTRIBUTION_RECEIPT_REQUIRED');
  const r = input;
  if (ownDataValue(r, 'finalized') !== true) throw new Error('CONTRIBUTION_RECEIPT_NOT_FINALIZED');

  const signature = ownDataValue(r, 'signature');
  const wallet = ownDataValue(r, 'wallet');
  const poolId = ownDataValue(r, 'poolId');
  const poolType = ownDataValue(r, 'poolType');
  const lpMint = ownDataValue(r, 'lpMint');
  const kvroMint = ownDataValue(r, 'kvroMint');
  const quoteMint = ownDataValue(r, 'quoteMint');
  const kvroSourceOwner = ownDataValue(r, 'kvroSourceOwner');
  const rpcProviders = ownDataValue(r, 'rpcProviders');
  if (!rpcProviders || typeof rpcProviders !== 'object') {
    throw new Error('CONTRIBUTION_RECEIPT_RPC_PROVENANCE_REQUIRED');
  }
  const transactionOperator = ownDataValue(rpcProviders, 'transactionOperator');
  const statusOperator = ownDataValue(rpcProviders, 'statusOperator');
  const canonicalOperator = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
  if (typeof transactionOperator !== 'string' || typeof statusOperator !== 'string' ||
      !canonicalOperator.test(transactionOperator) ||
      !canonicalOperator.test(statusOperator) ||
      transactionOperator === statusOperator) {
    throw new Error('CONTRIBUTION_RECEIPT_INDEPENDENT_RPC_PROVENANCE_REQUIRED');
  }
  if ([signature, wallet, poolId, lpMint].some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new Error('CONTRIBUTION_RECEIPT_IDENTITY_REQUIRED');
  }
  if (!isCanonicalIdentity(signature) || !isCanonicalIdentity(wallet) ||
      !isCanonicalIdentity(poolId) || !isCanonicalIdentity(lpMint) ||
      !isCanonicalIdentity(kvroSourceOwner)) {
    throw new Error('CONTRIBUTION_RECEIPT_IDENTITY_INVALID');
  }
  if (poolType !== 'RAYDIUM_CPMM') throw new Error('CONTRIBUTION_RECEIPT_UNSUPPORTED_POOL_TYPE');
  if (!isCanonicalIdentity(kvroMint) || !isCanonicalIdentity(quoteMint) ||
      kvroMint !== KAVYRO_MINT || quoteMint !== WRAPPED_SOL_MINT) {
    throw new Error('CONTRIBUTION_RECEIPT_MINT_MISMATCH');
  }
  if (kvroSourceOwner !== wallet) throw new Error('CONTRIBUTION_RECEIPT_WALLET_MISMATCH');

  const slot = ownDataValue(r, 'slot');
  const blockTimeSeconds = ownDataValue(r, 'blockTimeSeconds');
  const observedAtSeconds = ownDataValue(r, 'observedAtSeconds');
  if (!Number.isSafeInteger(slot) || /** @type {number} */ (slot) <= 0 ||
      !Number.isSafeInteger(blockTimeSeconds) || /** @type {number} */ (blockTimeSeconds) < 0 ||
      !Number.isSafeInteger(observedAtSeconds) || /** @type {number} */ (observedAtSeconds) < /** @type {number} */ (blockTimeSeconds)) {
    throw new Error('CONTRIBUTION_RECEIPT_TRUSTED_TIME_INVALID');
  }
  const maxAgeSeconds = ownDataValue(r, 'maxAgeSeconds');
  if (!Number.isSafeInteger(maxAgeSeconds) || /** @type {number} */ (maxAgeSeconds) < 0 ||
      /** @type {number} */ (observedAtSeconds) - /** @type {number} */ (blockTimeSeconds) > /** @type {number} */ (maxAgeSeconds)) {
    throw new Error('CONTRIBUTION_RECEIPT_STALE');
  }

  const kvroTransferredBaseUnits = ownDataValue(r, 'kvroTransferredBaseUnits');
  const lpMintedBaseUnits = ownDataValue(r, 'lpMintedBaseUnits');
  if (typeof kvroTransferredBaseUnits !== 'bigint' || kvroTransferredBaseUnits <= 0n) {
    throw new Error('CONTRIBUTION_RECEIPT_KVRO_TRANSFER_REQUIRED');
  }
  if (typeof lpMintedBaseUnits !== 'bigint' || lpMintedBaseUnits <= 0n) {
    throw new Error('CONTRIBUTION_RECEIPT_LP_MINT_REQUIRED');
  }

  return Object.freeze({
    verified: true,
    evidenceKind: 'HISTORICAL_CPMM_CONTRIBUTION_RECEIPT',
    signature,
    wallet,
    poolId,
    poolType: 'RAYDIUM_CPMM',
    lpMint,
    kvroMint,
    quoteMint,
    contributedKvroBaseUnits: kvroTransferredBaseUnits,
    lpMintedBaseUnits,
    contextSlot: slot,
    observedAtSeconds: blockTimeSeconds,
    contributionEvidenceId: `${signature}:${poolId}:${wallet}`,
    rpcProviders: Object.freeze({ transactionOperator, statusOperator }),
    contributionAmountVerified: true,
    payoutAuthorized: false,
  });
}

export const cpmmContributionReceiptCapabilities = Object.freeze({
  read: true,
  buildTransaction: false,
  signTransaction: false,
  sendTransaction: false,
});
