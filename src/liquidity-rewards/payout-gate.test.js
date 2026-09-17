'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluatePayoutGate } = require('./payout-gate');

const verifiedConfig = Object.freeze({
  enabled: true,
  poolStatus: 'POOL_VERIFIED',
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
});

const validEntitlement = Object.freeze({
  payoutAuthorized: false,
  rewardBaseUnits: 1n,
});

test('remains fail-closed even when all prerequisites are satisfied', () => {
  const result = evaluatePayoutGate({ config: verifiedConfig, entitlement: validEntitlement });

  assert.equal(result.authorized, false);
  assert.equal(result.canBuildTransaction, false);
  assert.equal(result.canSignTransaction, false);
  assert.equal(result.canSendTransaction, false);
  assert.deepEqual(result.reasons, ['PAYOUT_IMPLEMENTATION_NOT_AVAILABLE']);
});

test('rejects disabled rewards', () => {
  const result = evaluatePayoutGate({
    config: { ...verifiedConfig, enabled: false },
    entitlement: validEntitlement,
  });

  assert.ok(result.reasons.includes('REWARDS_DISABLED'));
  assert.equal(result.authorized, false);
});

test('rejects unverified pool and missing pool id', () => {
  const result = evaluatePayoutGate({
    config: { enabled: true, poolStatus: 'POOL_UNVERIFIED', poolId: null },
    entitlement: validEntitlement,
  });

  assert.ok(result.reasons.includes('POOL_UNVERIFIED'));
  assert.ok(result.reasons.includes('POOL_ID_MISSING'));
  assert.equal(result.authorized, false);
});

test('rejects entitlement that attempts to pre-authorize payout', () => {
  const result = evaluatePayoutGate({
    config: verifiedConfig,
    entitlement: { payoutAuthorized: true, rewardBaseUnits: 1n },
  });

  assert.ok(result.reasons.includes('INVALID_ENTITLEMENT_STATE'));
  assert.equal(result.authorized, false);
});

test('rejects zero, negative and non-bigint reward amounts', () => {
  for (const rewardBaseUnits of [0n, -1n, 1, '1', null]) {
    const result = evaluatePayoutGate({
      config: verifiedConfig,
      entitlement: { payoutAuthorized: false, rewardBaseUnits },
    });

    assert.ok(result.reasons.includes('INVALID_REWARD_AMOUNT'));
    assert.equal(result.authorized, false);
  }
});

test('fails closed when inputs are absent', () => {
  const result = evaluatePayoutGate();

  assert.equal(result.authorized, false);
  assert.equal(result.canBuildTransaction, false);
  assert.equal(result.canSignTransaction, false);
  assert.equal(result.canSendTransaction, false);
  assert.ok(result.reasons.includes('REWARDS_DISABLED'));
  assert.ok(result.reasons.includes('POOL_UNVERIFIED'));
  assert.ok(result.reasons.includes('POOL_ID_MISSING'));
  assert.ok(result.reasons.includes('INVALID_ENTITLEMENT_STATE'));
  assert.ok(result.reasons.includes('INVALID_REWARD_AMOUNT'));
  assert.ok(result.reasons.includes('PAYOUT_IMPLEMENTATION_NOT_AVAILABLE'));
});

test('returns immutable result and reasons', () => {
  const result = evaluatePayoutGate({ config: verifiedConfig, entitlement: validEntitlement });

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.reasons), true);
});
