import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerifiedObservation } from './verified-observation.js';
import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';

const KVRO = KAVYRO_MINT;
const WSOL = WRAPPED_SOL_MINT;
const OBSERVED_AT_SECONDS = 3600;

const position = Object.freeze({
  wallet: 'wallet-test-1',
  positionId: 'lp-position-test-1',
  observationPeriod: 1,
  observedAtSeconds: OBSERVED_AT_SECONDS,
  eligible: true,
});

function verifiedCandidate(overrides = {}) {
  return {
    poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
    poolType: 'CPMM',
    mintA: KVRO,
    mintB: WSOL,
    onChainExists: true,
    ...overrides,
  };
}

test('builds an immutable observation only after validator approval', () => {
  const observation = buildVerifiedObservation({ candidatePool: verifiedCandidate(), position });
  assert.equal(observation.poolVerified, true);
  assert.equal(observation.eligible, true);
  assert.equal(observation.poolId, 'TEST_ONLY_POOL_ID_NOT_PRODUCTION');
  assert.equal(Object.isFrozen(observation), true);
});

test('rejects caller-supplied verified boolean when pool data is invalid', () => {
  assert.throws(() => buildVerifiedObservation({
    candidatePool: verifiedCandidate({ mintA: 'FOREIGN_MINT', poolVerified: true }),
    position,
  }), /POOL_NOT_VERIFIED/);
});

test('rejects missing on-chain existence confirmation', () => {
  assert.throws(() => buildVerifiedObservation({
    candidatePool: verifiedCandidate({ onChainExists: false }),
    position,
  }), /POOL_NOT_VERIFIED/);
});

test('rejects ineligible position even with otherwise valid pool evidence', () => {
  assert.throws(() => buildVerifiedObservation({
    candidatePool: verifiedCandidate(),
    position: { ...position, eligible: false },
  }), /POSITION_NOT_ELIGIBLE/);
});

test('rejects missing position data', () => {
  assert.throws(() => buildVerifiedObservation({
    candidatePool: verifiedCandidate(),
    position: null,
  }), /POSITION_DATA_MISSING/);
});

test('rejects a caller-forged observation period that disagrees with observed time', () => {
  assert.throws(() => buildVerifiedObservation({
    candidatePool: verifiedCandidate(),
    position: { ...position, observationPeriod: 999 },
  }), /OBSERVATION_PERIOD_MISMATCH/);
});

test('rejects observations without a timestamp binding the period to time', () => {
  const { observedAtSeconds: _ignored, ...withoutTimestamp } = position;
  assert.throws(() => buildVerifiedObservation({
    candidatePool: verifiedCandidate(),
    position: withoutTimestamp,
  }), /OBSERVATION_TIMESTAMP_INVALID/);
});
