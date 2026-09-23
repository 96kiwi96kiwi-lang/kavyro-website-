import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHoldingEligibility } from './holding-eligibility.js';

const base = Object.freeze({
  poolVerified: true,
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
  wallet: 'TEST_WALLET',
  positionId: 'TEST_POSITION',
});

/** @param {number} period */
function observation(period, amount = 100n) {
  return {
    ...base,
    observationPeriod: period,
    contextSlot: 1000 + period,
    observedAtSeconds: period * 3600 + 60,
    contributedKvroBaseUnits: amount,
  };
}

test('requires sustained consecutive observations and uses minimum held contribution', () => {
  const result = evaluateHoldingEligibility({
    observations: [observation(10, 120n), observation(11, 100n), observation(12, 110n)],
    minimumPeriods: 3,
  });
  assert.equal(result.eligible, true);
  assert.equal(result.consecutivePeriods, 3);
  assert.equal(result.minimumContributionKvroBaseUnits, 100n);
  assert.equal(result.reason, 'SUSTAINED_HOLDING_VERIFIED');
  assert.equal(result.payoutAuthorized, false);
});

test('short-lived LP is ineligible', () => {
  const result = evaluateHoldingEligibility({ observations: [observation(20), observation(21)], minimumPeriods: 3 });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'INSUFFICIENT_HOLDING_PERIOD');
});

test('fails closed on a missing observation period', () => {
  assert.throws(
    () => evaluateHoldingEligibility({ observations: [observation(30), observation(32)], minimumPeriods: 2 }),
    /OBSERVATION_PERIOD_GAP/,
  );
});

test('fails closed on duplicate periods or changed identity', () => {
  assert.throws(
    () => evaluateHoldingEligibility({ observations: [observation(40), observation(40)], minimumPeriods: 2 }),
    /DUPLICATE_OBSERVATION_PERIOD/,
  );
  assert.throws(
    () => evaluateHoldingEligibility({ observations: [observation(40), { ...observation(41), wallet: 'OTHER' }], minimumPeriods: 2 }),
    /OBSERVATION_IDENTITY_CHANGED/,
  );
});

test('fails closed on unverified pool and invalid LP amount', () => {
  assert.throws(
    () => evaluateHoldingEligibility({ observations: [{ ...observation(1), poolVerified: false }, observation(2)], minimumPeriods: 2 }),
    /POOL_NOT_VERIFIED/,
  );
  assert.throws(
    () => evaluateHoldingEligibility({ observations: [observation(1, 0n), observation(2)], minimumPeriods: 2 }),
    /INVALID_LP_AMOUNT/,
  );
});

test('fails closed when trusted RPC time is missing or does not match its period', () => {
  const missingTime = { ...observation(50), observedAtSeconds: /** @type {any} */ (undefined) };
  assert.throws(
    () => evaluateHoldingEligibility({ observations: [missingTime, observation(51)], minimumPeriods: 2 }),
    /OBSERVATION_TRUSTED_TIME_REQUIRED/,
  );
  assert.throws(
    () => evaluateHoldingEligibility({
      observations: [{ ...observation(50), observedAtSeconds: 51 * 3600 + 60 }, observation(51)],
      minimumPeriods: 2,
    }),
    /OBSERVATION_TRUSTED_TIME_PERIOD_MISMATCH/,
  );
});

test('fails closed on replayed or non-monotonic trusted RPC slot/time', () => {
  assert.throws(
    () => evaluateHoldingEligibility({
      observations: [observation(60), { ...observation(61), contextSlot: observation(60).contextSlot }],
      minimumPeriods: 2,
    }),
    /OBSERVATION_REPLAY_DETECTED/,
  );
  assert.throws(
    () => evaluateHoldingEligibility({
      observations: [observation(60), { ...observation(61), observedAtSeconds: observation(60).observedAtSeconds }],
      minimumPeriods: 2,
    }),
    /OBSERVATION_TRUSTED_TIME_PERIOD_MISMATCH|OBSERVATION_REPLAY_DETECTED/,
  );
});
