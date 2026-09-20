import test from 'node:test';
import assert from 'node:assert/strict';
import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';
import { createSolanaRpcPoolVerifier } from './solana-rpc-pool-verifier.js';

const POOL = 'TEST_ONLY_POOL_ID_NOT_PRODUCTION';
const OWNER = 'TEST_ONLY_RAYDIUM_PROGRAM_OWNER';
const candidate = { poolId: POOL, mintA: KAVYRO_MINT, mintB: WRAPPED_SOL_MINT, onChainExists: false, discoveryOnly: true, source: 'TEST_DISCOVERY' };

/** @param {unknown} account */
function verifier(account) {
  return createSolanaRpcPoolVerifier({ allowedProgramOwners: [OWNER], readPoolAccount: async () => account });
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

test('requires an explicit independently verified program-owner allowlist', () => {
  assert.throws(() => createSolanaRpcPoolVerifier({ readPoolAccount: async () => ({}) }), /allowedProgramOwners/);
});
