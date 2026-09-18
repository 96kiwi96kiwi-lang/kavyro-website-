import test from 'node:test';
import assert from 'node:assert/strict';
import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';
import { normalizeDiscoveredPool, normalizeDiscoveredPools } from './pool-discovery.js';

test('discovery fails closed without a provenance source', () => {
  const result = normalizeDiscoveredPool({
    poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
    mintA: KAVYRO_MINT,
    mintB: WRAPPED_SOL_MINT,
    onChainExists: true,
  });

  assert.equal(result.candidateVerified, false);
  assert.ok(result.reasons.includes('DISCOVERY_SOURCE_MISSING'));
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canSendTransaction, false);
});

test('discovery can mark a sourced KVRO/wSOL observation as a read-only candidate', () => {
  const result = normalizeDiscoveredPool({
    source: 'TEST_FIXTURE_NOT_PRODUCTION',
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

test('discovery rejects unexpected mint pairs and non-array batches safely', () => {
  const result = normalizeDiscoveredPool({
    source: 'TEST_FIXTURE_NOT_PRODUCTION',
    poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
    mintA: KAVYRO_MINT,
    mintB: 'UNEXPECTED_MINT',
    onChainExists: true,
  });

  assert.equal(result.candidateVerified, false);
  assert.ok(result.reasons.includes('UNEXPECTED_POOL_MINTS'));
  assert.deepEqual(normalizeDiscoveredPools(null), []);
});
