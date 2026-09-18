import test from 'node:test';
import assert from 'node:assert/strict';

import { enforceObservationSafety } from './observation-safety.js';

const FIXTURE = {
  source: 'TEST_FIXTURE_NOT_PRODUCTION',
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
  mintA: 'TEST_MINT_A_NOT_PRODUCTION',
  mintB: 'TEST_MINT_B_NOT_PRODUCTION',
  onChainExists: true,
};

test('accepts a structurally verified read-only observation without authorizing payout', () => {
  const result = enforceObservationSafety(FIXTURE);
  assert.equal(result.ok, true);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canBuildTransaction, false);
  assert.equal(result.canSignTransaction, false);
  assert.equal(result.canSendTransaction, false);
});

test('fails closed when on-chain existence is not explicitly verified', () => {
  const result = enforceObservationSafety({ ...FIXTURE, onChainExists: false });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['OBSERVATION_UNVERIFIED']);
  assert.equal(result.observation, null);
});

test('fails closed when provenance is missing', () => {
  const result = enforceObservationSafety({ ...FIXTURE, source: '' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['OBSERVATION_UNVERIFIED']);
});

test('fails closed for missing observation', () => {
  const result = enforceObservationSafety(null);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['OBSERVATION_INVALID']);
});
