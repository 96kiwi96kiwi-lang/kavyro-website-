import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadOnlyPoolProvider } from './read-only-provider.js';

test('exposes read capability only and preserves provenance', async () => {
  const provider = createReadOnlyPoolProvider({
    source: 'TEST_FIXTURE_NOT_PRODUCTION',
    fetchCandidates: async () => [{ poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION' }],
  });

  assert.deepEqual(provider.capabilities, {
    read: true,
    buildTransaction: false,
    signTransaction: false,
    sendTransaction: false,
  });

  const [candidate] = await provider.readPoolCandidates();
  assert.equal(candidate.poolId, 'TEST_ONLY_POOL_ID_NOT_PRODUCTION');
  assert.equal(candidate.source, 'TEST_FIXTURE_NOT_PRODUCTION');
});

test('rejects missing source', () => {
  assert.throws(
    () => createReadOnlyPoolProvider({ fetchCandidates: async () => [] }),
    /source must be a non-empty string/,
  );
});

test('rejects non-array provider responses', async () => {
  const provider = createReadOnlyPoolProvider({
    source: 'TEST_FIXTURE_NOT_PRODUCTION',
    fetchCandidates: async () => ({ poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION' }),
  });
  await assert.rejects(provider.readPoolCandidates(), /must return an array/);
});
