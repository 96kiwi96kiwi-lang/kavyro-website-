import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReward, REWARD_POLICY_VERSION } from './reward-policy.js';

const observation = Object.freeze({
  poolVerified: true,
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
  eligible: true,
  wallet: 'TEST_WALLET',
  positionId: 'TEST_POSITION',
  observationPeriod: 'TEST_PERIOD',
});

test('calculates a 1:1 KVRO entitlement in bigint base units', () => {
  const reward = calculateReward({ verifiedObservation: observation, contributedKvroBaseUnits: 123456789n });
  assert.equal(reward.policyVersion, REWARD_POLICY_VERSION);
  assert.equal(reward.contributedKvroBaseUnits, 123456789n);
  assert.equal(reward.rewardKvroBaseUnits, 123456789n);
  assert.equal(reward.payoutAuthorized, false);
  assert.ok(Object.isFrozen(reward));
});

test('rejects missing or unverified observations', () => {
  assert.throws(() => calculateReward({ contributedKvroBaseUnits: 1n }), /VERIFIED_OBSERVATION_REQUIRED/);
  assert.throws(() => calculateReward({ verifiedObservation: { ...observation, poolVerified: false }, contributedKvroBaseUnits: 1n }), /POOL_NOT_VERIFIED/);
  assert.throws(() => calculateReward({ verifiedObservation: { ...observation, poolId: '' }, contributedKvroBaseUnits: 1n }), /POOL_NOT_VERIFIED/);
});

test('rejects ineligible positions', () => {
  assert.throws(() => calculateReward({ verifiedObservation: { ...observation, eligible: false }, contributedKvroBaseUnits: 1n }), /POSITION_NOT_ELIGIBLE/);
});

test('rejects zero, negative, number and string contribution amounts', () => {
  for (const amount of [0n, -1n, 1, '1']) {
    assert.throws(() => calculateReward({ verifiedObservation: observation, contributedKvroBaseUnits: amount }), /INVALID_CONTRIBUTION_AMOUNT/);
  }
});

test('does not expose any payout authorization path', () => {
  const reward = calculateReward({ verifiedObservation: observation, contributedKvroBaseUnits: 10n });
  assert.equal(reward.payoutAuthorized, false);
  assert.equal('signature' in reward, false);
  assert.equal('transaction' in reward, false);
});
