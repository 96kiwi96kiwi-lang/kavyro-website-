import test from 'node:test';
import assert from 'node:assert/strict';
import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';
import { createSolanaRpcPoolVerifier } from './solana-rpc-pool-verifier.js';

const POOL = 'TEST_ONLY_POOL_ID_NOT_PRODUCTION';
const OWNER = 'TEST_ONLY_RAYDIUM_PROGRAM_OWNER';
const candidate = { poolId: POOL, mintA: KAVYRO_MINT, mintB: WRAPPED_SOL_MINT, onChainExists: false, discoveryOnly: true, source: 'TEST_DISCOVERY' };

/** @param {unknown} account @param {number | null} [minimumContextSlot] */
function verifier(account, minimumContextSlot = null) {
  return createSolanaRpcPoolVerifier({ allowedProgramOwners: [OWNER], minimumContextSlot, readPoolAccount: async () => account });
}

test('accepts only independently read account with canonical mint pair and allowed owner', async () => {
  const result = await verifier({ exists: true, owner: OWNER, mintA: WRAPPED_SOL_MINT, mintB: KAVYRO_MINT }).verifyCandidate(candidate);
  assert.equal(result.verified, true);
  assert.equal(result.onChainExists, true);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.canBuildTransaction, false);
  assert.equal(result.canSignTransaction, false);
  assert.equal(result.canSendTransaction, false);
});

test('rejects stale or missing RPC context when a freshness floor is required', async () => {
  const stale = await verifier({ exists: true, owner: OWNER, mintA: KAVYRO_MINT, mintB: WRAPPED_SOL_MINT, contextSlot: 99 }, 100).verifyCandidate(candidate);
  assert.deepEqual(stale, { verified: false, reason: 'STALE_RPC_EVIDENCE' });
  const missing = await verifier({ exists: true, owner: OWNER, mintA: KAVYRO_MINT, mintB: WRAPPED_SOL_MINT }, 100).verifyCandidate(candidate);
  assert.deepEqual(missing, { verified: false, reason: 'STALE_RPC_EVIDENCE' });
  const fresh = await verifier({ exists: true, owner: OWNER, mintA: KAVYRO_MINT, mintB: WRAPPED_SOL_MINT, contextSlot: 100 }, 100).verifyCandidate(candidate);
  assert.equal(fresh.verified, true);
  assert.equal(fresh.contextSlot, 100);
  assert.equal(fresh.payoutAuthorized, false);
});

test('derives observation time independently from the finalized RPC context slot', async () => {
  const result = await createSolanaRpcPoolVerifier({
    allowedProgramOwners: [OWNER],
    readPoolAccount: async () => ({ exists: true, owner: OWNER, mintA: KAVYRO_MINT, mintB: WRAPPED_SOL_MINT, contextSlot: 123 }),
    readBlockTime: async (slot) => {
      assert.equal(slot, 123);
      return 3600;
    },
    nowSeconds: () => 3610,
    maxObservationAgeSeconds: 60,
  }).verifyCandidate(candidate);
  assert.equal(result.verified, true);
  assert.equal(result.observedAtSeconds, 3600);
  assert.equal(result.contextSlot, 123);
});

test('rejects missing, future, or stale RPC-derived observation time when trusted time is required', async () => {
  const base = {
    allowedProgramOwners: [OWNER],
    readPoolAccount: async () => ({ exists: true, owner: OWNER, mintA: KAVYRO_MINT, mintB: WRAPPED_SOL_MINT, contextSlot: 123 }),
    nowSeconds: () => 4000,
    maxObservationAgeSeconds: 60,
  };
  const missing = createSolanaRpcPoolVerifier({ ...base, readBlockTime: async () => null });
  assert.deepEqual(await missing.verifyCandidate(candidate), { verified: false, reason: 'RPC_BLOCK_TIME_INVALID' });
  const future = createSolanaRpcPoolVerifier({ ...base, readBlockTime: async () => 4001 });
  assert.deepEqual(await future.verifyCandidate(candidate), { verified: false, reason: 'FUTURE_RPC_EVIDENCE' });
  const stale = createSolanaRpcPoolVerifier({ ...base, readBlockTime: async () => 3900 });
  assert.deepEqual(await stale.verifyCandidate(candidate), { verified: false, reason: 'STALE_RPC_TIME_EVIDENCE' });
});

test('rejects untrusted program owner', async () => {
  const result = await verifier({ exists: true, owner: 'FAKE_OWNER', mintA: KAVYRO_MINT, mintB: WRAPPED_SOL_MINT }).verifyCandidate(candidate);
  assert.deepEqual(result, { verified: false, reason: 'UNTRUSTED_PROGRAM_OWNER' });
});

test('rejects wrong mint pair', async () => {
  const result = await verifier({ exists: true, owner: OWNER, mintA: KAVYRO_MINT, mintB: 'FAKE_MINT' }).verifyCandidate(candidate);
  assert.deepEqual(result, { verified: false, reason: 'CANONICAL_MINT_PAIR_MISMATCH' });
});

test('rejects missing account and RPC failures fail closed', async () => {
  assert.deepEqual(await verifier({ exists: false }).verifyCandidate(candidate), { verified: false, reason: 'POOL_ACCOUNT_NOT_FOUND' });
  const failing = createSolanaRpcPoolVerifier({ allowedProgramOwners: [OWNER], readPoolAccount: async () => { throw new Error('rpc'); } });
  assert.deepEqual(await failing.verifyCandidate(candidate), { verified: false, reason: 'RPC_READ_FAILED' });
});

test('refuses candidates that were not discovery-only and unverified', async () => {
  const result = await verifier({ exists: true, owner: OWNER, mintA: KAVYRO_MINT, mintB: WRAPPED_SOL_MINT }).verifyCandidate({ ...candidate, onChainExists: true });
  assert.deepEqual(result, { verified: false, reason: 'INVALID_DISCOVERY_CANDIDATE' });
});

test('requires an explicit independently verified program-owner allowlist and valid freshness floor', () => {
  assert.throws(() => createSolanaRpcPoolVerifier({ readPoolAccount: async () => ({}) }), /allowedProgramOwners/);
  assert.throws(() => createSolanaRpcPoolVerifier({ allowedProgramOwners: [OWNER], minimumContextSlot: -1, readPoolAccount: async () => ({}) }), /minimumContextSlot/);
});
