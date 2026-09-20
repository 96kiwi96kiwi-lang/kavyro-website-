// KAVYRO Liquidity Rewards — read-only integration boundary
// This module deliberately cannot build, sign, or send transactions.

import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';

const EXPECTED_MINTS = Object.freeze([KAVYRO_MINT, WRAPPED_SOL_MINT]);

/**
 * Discovery/input data is untrusted. This shape is deliberately permissive;
 * runtime checks below decide whether any field can be used as evidence.
 * @typedef {{
 *   poolId?: unknown,
 *   mintA?: unknown,
 *   mintB?: unknown,
 *   onChainExists?: unknown
 * }} ReadOnlyPoolCandidateInput
 */

/**
 * Normalize an untrusted pool candidate without granting it additional trust.
 * `candidateVerified` only means that this local candidate shape contains the
 * expected mint pair and an independently supplied on-chain existence result.
 * It is not evidence of LP ownership, contribution, eligibility or payout.
 *
 * @param {unknown} [input]
 * @returns {Readonly<{
 *   poolId: string | null,
 *   mintA: string | null,
 *   mintB: string | null,
 *   onChainExists: boolean,
 *   expectedPair: boolean,
 *   candidateVerified: boolean,
 *   readOnly: true,
 *   payoutAuthorized: false,
 *   canBuildTransaction: false,
 *   canSignTransaction: false,
 *   canSendTransaction: false,
 *   reasons: readonly string[]
 * }>}
 */
export function createReadOnlyPoolCandidate(input = {}) {
  /** @type {ReadOnlyPoolCandidateInput} */
  const candidate = input && typeof input === 'object' ? input : {};
  const poolId = typeof candidate.poolId === 'string' && candidate.poolId.trim() ? candidate.poolId.trim() : null;
  const mintA = typeof candidate.mintA === 'string' ? candidate.mintA : null;
  const mintB = typeof candidate.mintB === 'string' ? candidate.mintB : null;
  const onChainExists = candidate.onChainExists === true;
  const observedMints = Object.freeze([mintA, mintB]);
  const expectedPair = EXPECTED_MINTS.every((mint) => observedMints.includes(mint));

  /** @type {string[]} */
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
