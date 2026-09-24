import test from 'node:test';
import assert from 'node:assert/strict';
import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';
import { createCpmmOwnershipVerifier } from './cpmm-ownership-verifier.js';

const LP_MINT = 'lp-mint';
const WALLET = 'wallet-owner';
const pool = (overrides = {}) => ({ exists: true, address: 'pool', poolType: 'RAYDIUM_CPMM', lpMint: LP_MINT, mintA: KAVYRO_MINT, mintB: WRAPPED_SOL_MINT, contextSlot: 100, ...overrides });
const account = (overrides = {}) => ({ exists: true, address: 'lp-account', mint: LP_MINT, walletOwner: WALLET, amountBaseUnits: 42n, contextSlot: 101, ...overrides });
const verifier = (poolValue = pool(), accountValue = account()) => createCpmmOwnershipVerifier({
  poolReader: { readPoolAccount: async () => poolValue },
  tokenAccountReader: { readTokenAccount: async () => accountValue },
});
const request = { poolId: 'pool', tokenAccount: 'lp-account', wallet: WALLET };

test('binds current CPMM LP ownership without claiming contribution or payout authorization', async () => {
  const result = await verifier().verifyCurrentOwnership(request);
  assert.equal(result.verified, true);
  assert.equal(result.evidenceKind, 'CURRENT_CPMM_LP_OWNERSHIP');
  assert.equal(result.lpAmountBaseUnits, 42n);
  assert.equal(result.poolContextSlot, 100);
  assert.equal(result.tokenAccountContextSlot, 101);
  assert.equal(result.contributionAmountVerified, false);
  assert.equal(result.payoutAuthorized, false);
});

test('accepts canonical mint pair in reverse pool order', async () => {
  const result = await verifier(pool({ mintA: WRAPPED_SOL_MINT, mintB: KAVYRO_MINT })).verifyCurrentOwnership(request);
  assert.equal(result.verified, true);
});

test('fails closed when pool does not contain canonical KVRO/WSOL pair', async () => {
  await assert.rejects(() => verifier(pool({ mintA: 'other' })).verifyCurrentOwnership(request), /canonical KVRO\/WSOL/);
});

test('fails closed when token account mint is not the verified pool LP mint', async () => {
  await assert.rejects(() => verifier(pool(), account({ mint: 'different-lp' })).verifyCurrentOwnership(request), /LP mint/);
});

test('fails closed when decoded token owner differs from requested wallet', async () => {
  await assert.rejects(() => verifier(pool(), account({ walletOwner: 'different-wallet' })).verifyCurrentOwnership(request), /owner does not match/);
});

test('fails closed on zero LP balance', async () => {
  await assert.rejects(() => verifier(pool(), account({ amountBaseUnits: 0n })).verifyCurrentOwnership(request), /positive/);
});

test('fails closed when either independently-read account is missing', async () => {
  await assert.rejects(() => verifier(pool({ exists: false })).verifyCurrentOwnership(request), /missing/);
  await assert.rejects(() => verifier(pool(), account({ exists: false })).verifyCurrentOwnership(request), /missing/);
});

test('fails closed on unsupported CLMM-shaped pool evidence', async () => {
  await assert.rejects(() => verifier(pool({ poolType: 'RAYDIUM_CLMM' })).verifyCurrentOwnership(request), /Unsupported pool type/);
});

test('fails closed on non-positive RPC provenance slots', async () => {
  await assert.rejects(() => verifier(pool({ contextSlot: 0 })).verifyCurrentOwnership(request), /provenance slot/);
  await assert.rejects(() => verifier(pool({ contextSlot: -1 })).verifyCurrentOwnership(request), /provenance slot/);
  await assert.rejects(() => verifier(pool(), account({ contextSlot: 0 })).verifyCurrentOwnership(request), /provenance slot/);
  await assert.rejects(() => verifier(pool(), account({ contextSlot: -1 })).verifyCurrentOwnership(request), /provenance slot/);
});

test('has no transaction capabilities', () => {
  assert.deepEqual(verifier().capabilities, { read: true, buildTransaction: false, signTransaction: false, sendTransaction: false });
});
