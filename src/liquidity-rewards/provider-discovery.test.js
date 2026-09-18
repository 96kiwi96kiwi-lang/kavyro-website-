import test from 'node:test';
import assert from 'node:assert/strict';

import { createReadOnlyPoolProvider } from './read-only-provider.js';
import { discoverFromReadOnlyProvider } from './provider-discovery.js';

const TEST_POOL = 'TEST_ONLY_POOL_ID_NOT_PRODUCTION';

test('composes constrained provider into read-only discovery', async () => {
  const provider = createReadOnlyPoolProvider({
    source: 'TEST_FIXTURE_NOT_PRODUCTION',
    fetchCandidates: async () => [{ poolId: TEST_POOL }],
  });

  const result = await discoverFromReadOnlyProvider(provider);
  assert.equal(result.ok, true);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canBuildTransaction, false);
  assert.equal(result.canSignTransaction, false);
  assert.equal(result.canSendTransaction, false);
});

test('fails closed for a provider that exposes transaction capability', async () => {
  const unsafeProvider = {
    source: 'TEST_FIXTURE_NOT_PRODUCTION',
    readPoolCandidates: async () => [],
    capabilities: {
      read: true,
      buildTransaction: true,
      signTransaction: false,
      sendTransaction: false,
    },
  };

  const result = await discoverFromReadOnlyProvider(unsafeProvider);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['READ_ONLY_PROVIDER_INVALID']);
  assert.equal(result.canBuildTransaction, false);
  assert.equal(result.canSignTransaction, false);
  assert.equal(result.canSendTransaction, false);
});

test('fails closed when provider contract is missing', async () => {
  const result = await discoverFromReadOnlyProvider(null);
  assert.equal(result.ok, false);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.reasons, ['READ_ONLY_PROVIDER_INVALID']);
  assert.equal(result.payoutAuthorized, false);
});
