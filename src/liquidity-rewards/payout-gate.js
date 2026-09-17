'use strict';

/**
 * Fail-closed boundary between calculated reward entitlements and any future
 * payout implementation. This module intentionally cannot build, sign or send
 * a Solana transaction.
 */
function evaluatePayoutGate({ config, entitlement } = {}) {
  const reasons = [];

  if (!config || config.enabled !== true) reasons.push('REWARDS_DISABLED');
  if (!config || config.poolStatus !== 'POOL_VERIFIED') reasons.push('POOL_UNVERIFIED');
  if (!config || typeof config.poolId !== 'string' || config.poolId.trim() === '') {
    reasons.push('POOL_ID_MISSING');
  }

  if (!entitlement || entitlement.payoutAuthorized !== false) {
    reasons.push('INVALID_ENTITLEMENT_STATE');
  }
  if (!entitlement || typeof entitlement.rewardBaseUnits !== 'bigint' || entitlement.rewardBaseUnits <= 0n) {
    reasons.push('INVALID_REWARD_AMOUNT');
  }

  // Even when every prerequisite eventually becomes valid, payouts require a
  // separate explicit implementation/review step. This prevents configuration
  // changes alone from enabling token transfers.
  reasons.push('PAYOUT_IMPLEMENTATION_NOT_AVAILABLE');

  return Object.freeze({
    authorized: false,
    canBuildTransaction: false,
    canSignTransaction: false,
    canSendTransaction: false,
    reasons: Object.freeze(reasons),
  });
}

module.exports = { evaluatePayoutGate };
