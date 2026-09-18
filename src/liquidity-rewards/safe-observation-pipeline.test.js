import test from 'node:test';
import assert from 'node:assert/strict';

import { createReadOnlyPoolProvider } from './read-only-provider.js';
import { collectSafeObservations } from './safe-observation-pipeline.js';
import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';

const TEST_SOURCE = 'TEST_FIXTURE_NOT_PRODUCTION';
const TEST_POOL = 'TEST_ONLY_POOL_ID_NOT_PRODUCTION';

function providerFor(candidates) {
  return createReadOnlyPoolProvider({
    source: TEST_SOURCE,
    fetchCandidates: async () => candidates,
  });
}

test('collects only verified KAVYRO/wSOL observations and never authorizes transactions', async () => {
  const result = await collectSafeObservations(providerFor([{
    poolId: TEST_POOL,
    mintA: KAVYRO_MINT,
    mintB: WRAPPED_SOL_MINT,
    onChainExists: true,
  }]));

  assert.equal(result.ok, true);
  assert.equal(result.observations.length, 1);
  assert.equal(result.rejectedCount, 0);
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
  assert.deepEqual(result.reasons, ['OBSERVATION_UNEXPECTED_MINTS']);
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
