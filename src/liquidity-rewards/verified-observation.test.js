import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerifiedObservation } from './verified-observation.js';
import { KAVYRO_LIQUIDITY_REWARDS } from './config.js';

const KVRO = KAVYRO_LIQUIDITY_REWARDS.tokenMint;
const WSOL = KAVYRO_LIQUIDITY_REWARDS.quoteMint;

const position = Object.freeze({
  wallet: 'wallet-test-1',
  positionId: 'lp-position-test-1',
  observationPeriod: '2026-09-17',
  eligible: true,
});

function verifiedCandidate(overrides = {}) {
  return {
    poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
    poolType: 'CLMM',
    tokenMintA: KVRO,
    tokenMintB: WSOL,
    existsOnChain: true,
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
    candidatePool: verifiedCandidate({ tokenMintA: 'FOREIGN_MINT', poolVerified: true }),
    position,
  }), /POOL_NOT_VERIFIED/);
});

test('rejects missing on-chain existence confirmation', () => {
  assert.throws(() => buildVerifiedObservation({
    candidatePool: verifiedCandidate({ existsOnChain: false }),
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
