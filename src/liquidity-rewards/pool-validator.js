import {
  KAVYRO_MINT,
  WRAPPED_SOL_MINT,
  POOL_STATUS,
} from './config.js';

// Only CPMM has an on-chain decoder in this repository today. Do not claim
// CLMM support until an independent CLMM account decoder/verifier exists.
const SUPPORTED_RAYDIUM_POOL_TYPES = Object.freeze(['CPMM']);

/** @param {unknown} value @returns {string} */
function normalizeMint(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @typedef {{
 *   onChainExists?: unknown,
 *   poolId?: unknown,
 *   poolType?: unknown,
 *   mintA?: unknown,
 *   mintB?: unknown
 * }} RaydiumPoolCandidate
 */

/**
 * Pure, fail-closed validation of already-decoded on-chain pool data.
 * This function does NOT discover pools and must never infer a Pool ID.
 * A verified pool proves only the decoded pool account/mint pair; it does not
 * prove wallet LP ownership, contribution amount, eligibility, or payout.
 *
 * @param {unknown} candidate
 * @returns {Readonly<{
 *   verified: false,
 *   status: typeof POOL_STATUS.UNVERIFIED,
 *   reason: string,
 *   poolId: null
 * }> | Readonly<{
 *   verified: true,
 *   status: typeof POOL_STATUS.VERIFIED,
 *   reason: 'POOL_VERIFIED',
 *   poolId: string,
 *   poolType: 'CPMM',
 *   mints: readonly string[]
 * }>}
 */
export function validateRaydiumPool(candidate) {
  /** @param {string} reason */
  const fail = (reason) => Object.freeze({
    verified: /** @type {const} */ (false),
    status: POOL_STATUS.UNVERIFIED,
    reason,
    poolId: null,
  });

  if (!candidate || typeof candidate !== 'object') return fail('POOL_DATA_MISSING');
  const value = /** @type {RaydiumPoolCandidate} */ (candidate);
  if (value.onChainExists !== true) return fail('POOL_NOT_CONFIRMED_ON_CHAIN');

  const poolId = typeof value.poolId === 'string' ? value.poolId.trim() : '';
  if (!poolId) return fail('POOL_ID_MISSING');

  if (value.poolType !== 'CPMM' || !SUPPORTED_RAYDIUM_POOL_TYPES.includes(value.poolType)) {
    return fail('UNSUPPORTED_POOL_TYPE');
  }

  const mintA = normalizeMint(value.mintA);
  const mintB = normalizeMint(value.mintB);
  if (!mintA || !mintB || mintA === mintB) return fail('INVALID_POOL_MINTS');

  const expected = new Set([KAVYRO_MINT, WRAPPED_SOL_MINT]);
  if (!expected.has(mintA) || !expected.has(mintB)) return fail('MINT_PAIR_MISMATCH');

  return Object.freeze({
    verified: /** @type {const} */ (true),
    status: POOL_STATUS.VERIFIED,
    reason: /** @type {const} */ ('POOL_VERIFIED'),
    poolId,
    poolType: /** @type {const} */ ('CPMM'),
    mints: Object.freeze([mintA, mintB]),
  });
}
