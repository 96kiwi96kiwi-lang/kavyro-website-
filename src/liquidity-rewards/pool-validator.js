import {
  KAVYRO_MINT,
  WRAPPED_SOL_MINT,
  POOL_STATUS,
} from './config.js';

const SUPPORTED_RAYDIUM_POOL_TYPES = Object.freeze(['CLMM', 'CPMM']);

function normalizeMint(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Pure, fail-closed validation of already-decoded on-chain pool data.
 * This function does NOT discover pools and must never infer a Pool ID.
 */
export function validateRaydiumPool(candidate) {
  const fail = (reason) => Object.freeze({
    verified: false,
    status: POOL_STATUS.UNVERIFIED,
    reason,
    poolId: null,
  });

  if (!candidate || typeof candidate !== 'object') return fail('POOL_DATA_MISSING');
  if (candidate.onChainExists !== true) return fail('POOL_NOT_CONFIRMED_ON_CHAIN');

  const poolId = typeof candidate.poolId === 'string' ? candidate.poolId.trim() : '';
  if (!poolId) return fail('POOL_ID_MISSING');

  if (!SUPPORTED_RAYDIUM_POOL_TYPES.includes(candidate.poolType)) {
    return fail('UNSUPPORTED_POOL_TYPE');
  }

  const mintA = normalizeMint(candidate.mintA);
  const mintB = normalizeMint(candidate.mintB);
  if (!mintA || !mintB || mintA === mintB) return fail('INVALID_POOL_MINTS');

  const expected = new Set([KAVYRO_MINT, WRAPPED_SOL_MINT]);
  if (!expected.has(mintA) || !expected.has(mintB)) return fail('MINT_PAIR_MISMATCH');

  return Object.freeze({
    verified: true,
    status: POOL_STATUS.VERIFIED,
    reason: 'POOL_VERIFIED',
    poolId,
    poolType: candidate.poolType,
    mints: Object.freeze([mintA, mintB]),
  });
}
