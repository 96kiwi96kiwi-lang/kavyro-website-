// KAVYRO Liquidity Rewards — independently verifiable CPMM contribution receipt boundary.
// Pure/read-only. It accepts only already-decoded finalized transaction facts from a
// verifier-owned reader. Current LP balance is deliberately insufficient.

import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';

/** @param {unknown} value @returns {string} */
const text = (value) => typeof value === 'string' ? value.trim() : '';

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
  const r = /** @type {Record<string, unknown>} */ (input);
  if (r.finalized !== true) throw new Error('CONTRIBUTION_RECEIPT_NOT_FINALIZED');

  const signature = text(r.signature);
  const wallet = text(r.wallet);
  const poolId = text(r.poolId);
  const poolType = text(r.poolType);
  const lpMint = text(r.lpMint);
  const kvroMint = text(r.kvroMint);
  const quoteMint = text(r.quoteMint);
  const kvroSourceOwner = text(r.kvroSourceOwner);
  if (!signature || !wallet || !poolId || !lpMint) throw new Error('CONTRIBUTION_RECEIPT_IDENTITY_REQUIRED');
  if (poolType !== 'RAYDIUM_CPMM') throw new Error('CONTRIBUTION_RECEIPT_UNSUPPORTED_POOL_TYPE');
  if (kvroMint !== KAVYRO_MINT || quoteMint !== WRAPPED_SOL_MINT) throw new Error('CONTRIBUTION_RECEIPT_MINT_MISMATCH');
  if (kvroSourceOwner !== wallet) throw new Error('CONTRIBUTION_RECEIPT_WALLET_MISMATCH');

  const slot = r.slot;
  const blockTimeSeconds = r.blockTimeSeconds;
  const observedAtSeconds = r.observedAtSeconds;
  if (!Number.isSafeInteger(slot) || /** @type {number} */ (slot) <= 0 ||
      !Number.isSafeInteger(blockTimeSeconds) || /** @type {number} */ (blockTimeSeconds) < 0 ||
      !Number.isSafeInteger(observedAtSeconds) || /** @type {number} */ (observedAtSeconds) < /** @type {number} */ (blockTimeSeconds)) {
    throw new Error('CONTRIBUTION_RECEIPT_TRUSTED_TIME_INVALID');
  }
  const maxAgeSeconds = r.maxAgeSeconds;
  if (!Number.isSafeInteger(maxAgeSeconds) || /** @type {number} */ (maxAgeSeconds) < 0 ||
      /** @type {number} */ (observedAtSeconds) - /** @type {number} */ (blockTimeSeconds) > /** @type {number} */ (maxAgeSeconds)) {
    throw new Error('CONTRIBUTION_RECEIPT_STALE');
  }

  if (typeof r.kvroTransferredBaseUnits !== 'bigint' || r.kvroTransferredBaseUnits <= 0n) {
    throw new Error('CONTRIBUTION_RECEIPT_KVRO_TRANSFER_REQUIRED');
  }
  if (typeof r.lpMintedBaseUnits !== 'bigint' || r.lpMintedBaseUnits <= 0n) {
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
    contributedKvroBaseUnits: r.kvroTransferredBaseUnits,
    lpMintedBaseUnits: r.lpMintedBaseUnits,
    contextSlot: slot,
    observedAtSeconds: blockTimeSeconds,
    contributionEvidenceId: `${signature}:${poolId}:${wallet}`,
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
