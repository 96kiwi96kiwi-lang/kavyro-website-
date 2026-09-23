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

const rejectingVerifier = Object.freeze({
  verifyCandidate: async () => Object.freeze({ verified: false, reason: 'TEST_RPC_REJECTED' }),
});

test('does not promote discovery-only KAVYRO/wSOL data into a safe observation', async () => {
  const result = await collectSafeObservations(providerFor([{
    poolId: TEST_POOL,
    mintA: KAVYRO_MINT,
    mintB: WRAPPED_SOL_MINT,
    onChainExists: true,
  }]), rejectingVerifier);

  assert.equal(result.ok, true);
  assert.deepEqual(result.observations, []);
  assert.equal(result.rejectedCount, 1);
  assert.deepEqual(result.reasons, ['TEST_RPC_REJECTED']);
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
  }]), rejectingVerifier);

  assert.equal(result.ok, true);
  assert.deepEqual(result.observations, []);
  assert.equal(result.rejectedCount, 1);
  assert.deepEqual(result.reasons, ['TEST_RPC_REJECTED']);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canSendTransaction, false);
});

test('fails closed when the provider contract is invalid', async () => {
  const result = await collectSafeObservations(null, rejectingVerifier);

  assert.equal(result.ok, false);
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.reasons, ['READ_ONLY_PROVIDER_INVALID']);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canBuildTransaction, false);
  assert.equal(result.canSignTransaction, false);
  assert.equal(result.canSendTransaction, false);
});

test('fails closed when the independent RPC verifier is missing', async () => {
  const result = await collectSafeObservations(providerFor([]), null);

  assert.equal(result.ok, false);
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.reasons, ['RPC_VERIFIER_REQUIRED']);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canSendTransaction, false);
});

test('rejects duplicate discovery-only candidates without creating observations', async () => {
  const candidate = {
    poolId: TEST_POOL,
    mintA: KAVYRO_MINT,
    mintB: WRAPPED_SOL_MINT,
    onChainExists: true,
  };

  const result = await collectSafeObservations(providerFor([candidate, { ...candidate }]), rejectingVerifier);

  assert.equal(result.ok, true);
  assert.deepEqual(result.observations, []);
  assert.equal(result.rejectedCount, 2);
  assert.deepEqual(result.reasons, ['TEST_RPC_REJECTED', 'TEST_RPC_REJECTED']);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canBuildTransaction, false);
  assert.equal(result.canSignTransaction, false);
  assert.equal(result.canSendTransaction, false);
});

test('preserves independently verified RPC time and slot in safe observations', async () => {
  const verifier = Object.freeze({
    verifyCandidate: async () => Object.freeze({
      verified: true,
      source: 'SOLANA_RPC_ACCOUNT_VERIFICATION',
      poolId: TEST_POOL,
      mintA: KAVYRO_MINT,
      mintB: WRAPPED_SOL_MINT,
      onChainExists: true,
      contextSlot: 123456,
      observedAtSeconds: 1700000000,
      payoutAuthorized: false,
      canBuildTransaction: false,
      canSignTransaction: false,
      canSendTransaction: false,
    }),
  });

  const result = await collectSafeObservations(providerFor([{
    poolId: TEST_POOL,
    mintA: KAVYRO_MINT,
    mintB: WRAPPED_SOL_MINT,
    onChainExists: true,
  }]), verifier);

  assert.equal(result.ok, true);
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].contextSlot, 123456);
  assert.equal(result.observations[0].observedAtSeconds, 1700000000);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canBuildTransaction, false);
  assert.equal(result.canSignTransaction, false);
  assert.equal(result.canSendTransaction, false);
});
