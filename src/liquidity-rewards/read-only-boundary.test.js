import test from 'node:test';
import assert from 'node:assert/strict';
import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';
import { createReadOnlyPoolCandidate } from './read-only-boundary.js';

test('fails closed when no pool data is supplied', () => {
  const result = createReadOnlyPoolCandidate();
  assert.equal(result.candidateVerified, false);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canBuildTransaction, false);
  assert.equal(result.canSignTransaction, false);
  assert.equal(result.canSendTransaction, false);
  assert.ok(result.reasons.includes('POOL_ID_MISSING'));
  assert.ok(result.reasons.includes('POOL_NOT_CONFIRMED_ON_CHAIN'));
  assert.ok(result.reasons.includes('UNEXPECTED_POOL_MINTS'));
});

test('accepts only an observed KVRO/wSOL pair as a read-only candidate', () => {
  const result = createReadOnlyPoolCandidate({
    poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
    mintA: WRAPPED_SOL_MINT,
    mintB: KAVYRO_MINT,
    onChainExists: true,
  });
  assert.equal(result.candidateVerified, true);
  assert.equal(result.readOnly, true);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canBuildTransaction, false);
  assert.equal(result.canSignTransaction, false);
  assert.equal(result.canSendTransaction, false);
});

test('rejects a pool whose mint pair does not exactly contain KVRO and wSOL', () => {
  const result = createReadOnlyPoolCandidate({
    poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
    mintA: KAVYRO_MINT,
    mintB: 'UNEXPECTED_MINT',
    onChainExists: true,
  });
  assert.equal(result.candidateVerified, false);
  assert.ok(result.reasons.includes('UNEXPECTED_POOL_MINTS'));
  assert.equal(result.payoutAuthorized, false);
});
