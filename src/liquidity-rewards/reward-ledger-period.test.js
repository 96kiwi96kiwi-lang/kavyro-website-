import assert from 'node:assert/strict';
import test from 'node:test';

import { observationPeriodForTimestamp } from './observation-period.js';
import { createRewardLedger } from './reward-ledger.js';

const VERIFIED_POOL = 'TEST_ONLY_POOL_ID_NOT_PRODUCTION';

/** @param {number} timestampSeconds */
function observationAt(timestampSeconds, overrides = {}) {
  return {
    wallet: 'TEST_WALLET',
    positionId: 'TEST_POSITION',
    observationPeriod: observationPeriodForTimestamp(timestampSeconds),
    poolId: VERIFIED_POOL,
    poolVerified: true,
    eligible: true,
    ...overrides,
  };
}

test('rejects the same LP position twice inside one deterministic period', () => {
  const ledger = createRewardLedger();
  ledger.recordObservation(observationAt(3600));

  assert.throws(
    () => ledger.recordObservation(observationAt(7199)),
    /DUPLICATE_OBSERVATION/,
  );
  assert.equal(ledger.size(), 1);
});

test('allows the same LP position in the next deterministic period', () => {
  const ledger = createRewardLedger();
  const first = ledger.recordObservation(observationAt(7199));
  const second = ledger.recordObservation(observationAt(7200));

  assert.equal(first.observationPeriod, 1);
  assert.equal(second.observationPeriod, 2);
  assert.equal(ledger.size(), 2);
});

test('period identity cannot be bypassed by changing pool metadata', () => {
  const ledger = createRewardLedger();
  ledger.recordObservation(observationAt(100));

  assert.throws(
    () => ledger.recordObservation(observationAt(200, { poolId: 'OTHER_TEST_ONLY_POOL' })),
    /DUPLICATE_OBSERVATION/,
  );
  assert.equal(ledger.size(), 1);
});
