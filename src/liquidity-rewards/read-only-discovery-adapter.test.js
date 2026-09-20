import test from 'node:test';
import assert from 'node:assert/strict';
import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';
import { discoverPoolsReadOnly } from './read-only-discovery-adapter.js';

test('adapter fails closed when fetcher is missing', async () => {
  const result = await discoverPoolsReadOnly({ source: 'TEST_SOURCE_NOT_PRODUCTION' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['READ_ONLY_FETCHER_MISSING']);
  assert.equal(result.canSendTransaction, false);
});

test('adapter fails closed when source provenance is missing', async () => {
  const result = await discoverPoolsReadOnly({ fetchPools: async () => [] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['DISCOVERY_SOURCE_MISSING']);
  assert.equal(result.payoutAuthorized, false);
});

test('adapter keeps injected discovery observations unverified and cannot authorize payout', async () => {
  const result = await discoverPoolsReadOnly({
    source: 'TEST_SOURCE_NOT_PRODUCTION',
    fetchPools: async () => [{
      poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
      mintA: KAVYRO_MINT,
      mintB: WRAPPED_SOL_MINT,
      onChainExists: true,
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].discoveryOnly, true);
  assert.equal(result.candidates[0].onChainExists, false);
  assert.equal(result.candidates[0].candidateVerified, false);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canBuildTransaction, false);
  assert.equal(result.canSignTransaction, false);
  assert.equal(result.canSendTransaction, false);
});

test('adapter contains fetch errors and returns no candidates', async () => {
  const result = await discoverPoolsReadOnly({
    source: 'TEST_SOURCE_NOT_PRODUCTION',
    fetchPools: async () => { throw new Error('network unavailable'); },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.reasons, ['READ_ONLY_DISCOVERY_FAILED']);
  assert.equal(result.canSendTransaction, false);
});
