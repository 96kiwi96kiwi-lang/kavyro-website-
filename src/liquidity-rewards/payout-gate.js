/**
 * @typedef {object} PayoutGateConfig
 * @property {boolean} [enabled]
 * @property {string | null} [poolId]
 * @property {string} [poolStatus]
 *
 * @typedef {object} PayoutGateEntitlement
 * @property {unknown} [payoutAuthorized]
 * @property {unknown} [rewardBaseUnits]
 *
 * @typedef {object} PayoutGateInput
 * @property {PayoutGateConfig} [config]
 * @property {PayoutGateEntitlement} [entitlement]
 */

import { POOL_STATUS } from './config.js';

/**
 * Fail-closed boundary between calculated reward entitlements and any future
 * payout implementation. This module intentionally cannot build, sign or send
 * a Solana transaction. Even a fully valid input can never authorize payout.
 *
 * @param {PayoutGateInput} [input]
 * @returns {Readonly<{
 *   authorized: false,
 *   canBuildTransaction: false,
 *   canSignTransaction: false,
 *   canSendTransaction: false,
 *   reasons: readonly string[]
 * }>}
 */
export function evaluatePayoutGate({ config, entitlement } = {}) {
  /** @type {string[]} */
  const reasons = [];

  if (!config || config.enabled !== true) reasons.push('REWARDS_DISABLED');
  if (!config || config.poolStatus !== POOL_STATUS.VERIFIED) reasons.push('POOL_UNVERIFIED');
  if (!config || typeof config.poolId !== 'string' || config.poolId.trim() === '') {
    reasons.push('POOL_ID_MISSING');
  }

  if (!entitlement || entitlement.payoutAuthorized !== false) {
    reasons.push('INVALID_ENTITLEMENT_STATE');
  }
  if (!entitlement || typeof entitlement.rewardBaseUnits !== 'bigint' || entitlement.rewardBaseUnits <= 0n) {
    reasons.push('INVALID_REWARD_AMOUNT');
  }

  // Deliberately unconditional. Configuration or a calculated entitlement can
  // never enable a transfer without a separately reviewed future implementation.
  reasons.push('PAYOUT_IMPLEMENTATION_NOT_AVAILABLE');

  return Object.freeze({
    authorized: false,
    canBuildTransaction: false,
    canSignTransaction: false,
    canSendTransaction: false,
    reasons: Object.freeze(reasons),
  });
}
