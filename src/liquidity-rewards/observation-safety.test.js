import test from 'node:test';
import assert from 'node:assert/strict';

import { enforceObservationSafety } from './observation-safety.js';
import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';

const FIXTURE = {
  source: 'TEST_FIXTURE_NOT_PRODUCTION',
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
  mintA: KAVYRO_MINT,
  mintB: WRAPPED_SOL_MINT,
  onChainExists: true,
  contextSlot: 123456,
  observedAtSeconds: 1700000000,
};

test('accepts a structurally verified expected-pair read-only observation without authorizing payout', () => {
  const result = enforceObservationSafety(FIXTURE);
  assert.equal(result.ok, true);
  assert.equal(result.observation?.contextSlot, 123456);
  assert.equal(result.observation?.observedAtSeconds, 1700000000);
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

test('fails closed when observed mints are not the KAVYRO/wSOL pair', () => {
  const result = enforceObservationSafety({ ...FIXTURE, mintB: 'TEST_WRONG_MINT_NOT_PRODUCTION' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['OBSERVATION_UNEXPECTED_MINTS']);
  assert.equal(result.observation, null);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canSendTransaction, false);
});

test('fails closed when trusted RPC time or slot is missing', () => {
  const missingTime = enforceObservationSafety({ ...FIXTURE, observedAtSeconds: undefined });
  assert.equal(missingTime.ok, false);
  assert.deepEqual(missingTime.reasons, ['OBSERVATION_TRUSTED_TIME_REQUIRED']);

  const missingSlot = enforceObservationSafety({ ...FIXTURE, contextSlot: undefined });
  assert.equal(missingSlot.ok, false);
  assert.deepEqual(missingSlot.reasons, ['OBSERVATION_TRUSTED_TIME_REQUIRED']);
});

test('fails closed for missing observation', () => {
  const result = enforceObservationSafety(null);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['OBSERVATION_INVALID']);
});
