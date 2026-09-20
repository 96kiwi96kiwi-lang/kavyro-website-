import test from 'node:test';
import assert from 'node:assert/strict';

import { createReadOnlyPoolProvider } from './read-only-provider.js';
import { collectSafeObservations } from './safe-observation-pipeline.js';
import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';

const TEST_SOURCE = 'TEST_FIXTURE_NOT_PRODUCTION';
const TEST_POOL = 'TEST_ONLY_POOL_ID_NOT_PRODUCTION';

/** @param {unknown} candidates */
function providerFor(candidates) {
  return createReadOnlyPoolProvider({
    source: TEST_SOURCE,
    fetchCandidates: async () => candidates,
  });
}

test('does not promote discovery-only KAVYRO/wSOL data into a safe observation', async () => {
  const result = await collectSafeObservations(providerFor([{
    poolId: TEST_POOL,
    mintA: KAVYRO_MINT,
    mintB: WRAPPED_SOL_MINT,
    onChainExists: true,
  }]));

  assert.equal(result.ok, true);
  assert.deepEqual(result.observations, []);
  assert.equal(result.rejectedCount, 1);
  assert.deepEqual(result.reasons, ['OBSERVATION_UNVERIFIED']);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canBuildTransaction, false);
  assert.equal(result.canSignTransaction, false);
  assert.equal(result.canSendTransaction, false);
});

test('rejects an unexpected mint pair without leaking it into safe observations', async () => {
  const result = await collectSafeObservations(providerFor([{
    poolId: TEST_POOL,
    mintA: KAVYRO_MINT,
    mintB: 'TEST_WRONG_MINT_NOT_PRODUCTION',
    onChainExists: true,
  }]));

  assert.equal(result.ok, true);
  assert.deepEqual(result.observations, []);
  assert.equal(result.rejectedCount, 1);
  assert.deepEqual(result.reasons, ['OBSERVATION_UNVERIFIED']);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canSendTransaction, false);
});

test('fails closed when the provider contract is invalid', async () => {
  const result = await collectSafeObservations(null);

  assert.equal(result.ok, false);
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.reasons, ['READ_ONLY_PROVIDER_INVALID']);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canBuildTransaction, false);
  assert.equal(result.canSignTransaction, false);
  assert.equal(result.canSendTransaction, false);
});

test('rejects duplicate discovery-only candidates without creating observations', async () => {
  const candidate = {
    poolId: TEST_POOL,
    mintA: KAVYRO_MINT,
    mintB: WRAPPED_SOL_MINT,
    onChainExists: true,
  };

  const result = await collectSafeObservations(providerFor([candidate, { ...candidate }]));

  assert.equal(result.ok, true);
  assert.deepEqual(result.observations, []);
  assert.equal(result.rejectedCount, 2);
  assert.deepEqual(result.reasons, ['OBSERVATION_UNVERIFIED', 'OBSERVATION_UNVERIFIED']);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canBuildTransaction, false);
  assert.equal(result.canSignTransaction, false);
  assert.equal(result.canSendTransaction, false);
});
