// KAVYRO Liquidity Rewards — read-only integration boundary
// This module deliberately cannot build, sign, or send transactions.

import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';

const EXPECTED_MINTS = Object.freeze([KAVYRO_MINT, WRAPPED_SOL_MINT]);

export function createReadOnlyPoolCandidate(input = {}) {
  const poolId = typeof input.poolId === 'string' && input.poolId.trim() ? input.poolId.trim() : null;
  const mintA = typeof input.mintA === 'string' ? input.mintA : null;
  const mintB = typeof input.mintB === 'string' ? input.mintB : null;
  const onChainExists = input.onChainExists === true;
  const observedMints = Object.freeze([mintA, mintB]);
  const expectedPair = EXPECTED_MINTS.every((mint) => observedMints.includes(mint));

  const reasons = [];
  if (!poolId) reasons.push('POOL_ID_MISSING');
  if (!onChainExists) reasons.push('POOL_NOT_CONFIRMED_ON_CHAIN');
  if (!expectedPair) reasons.push('UNEXPECTED_POOL_MINTS');

  return Object.freeze({
    poolId,
    mintA,
    mintB,
    onChainExists,
    expectedPair,
    candidateVerified: reasons.length === 0,
    readOnly: true,
    payoutAuthorized: false,
    canBuildTransaction: false,
    canSignTransaction: false,
    canSendTransaction: false,
    reasons: Object.freeze(reasons),
  });
}
