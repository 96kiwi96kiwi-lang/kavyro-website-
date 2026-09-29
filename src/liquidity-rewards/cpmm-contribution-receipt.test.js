import test from 'node:test';
import assert from 'node:assert/strict';
import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';
import { verifyCpmmContributionReceipt, cpmmContributionReceiptCapabilities } from './cpmm-contribution-receipt.js';

const base = Object.freeze({
  finalized: true,
  signature: 'TEST_SIGNATURE_NOT_PRODUCTION',
  wallet: 'TEST_WALLET',
  poolId: 'TEST_POOL',
  poolType: 'RAYDIUM_CPMM',
  lpMint: 'TEST_LP_MINT',
  kvroMint: KAVYRO_MINT,
  quoteMint: WRAPPED_SOL_MINT,
  kvroSourceOwner: 'TEST_WALLET',
  kvroTransferredBaseUnits: 1000n,
  lpMintedBaseUnits: 50n,
  slot: 123,
  blockTimeSeconds: 1000,
  observedAtSeconds: 1010,
  maxAgeSeconds: 60,
});

test('verifies independently decoded finalized CPMM contribution receipt facts', () => {
  const result = verifyCpmmContributionReceipt(base);
  assert.equal(result.verified, true);
  assert.equal(result.contributedKvroBaseUnits, 1000n);
  assert.equal(result.contributionAmountVerified, true);
  assert.equal(result.payoutAuthorized, false);
});

test('current balance or caller verified boolean cannot substitute for historical receipt', () => {
  assert.throws(() => verifyCpmmContributionReceipt({ verified: true, lpAmountBaseUnits: 50n }), /NOT_FINALIZED|REQUIRED/);
});

test('fails closed on wallet, mint, pool type and amount mismatch', () => {
  assert.throws(() => verifyCpmmContributionReceipt({ ...base, kvroSourceOwner: 'OTHER' }), /WALLET_MISMATCH/);
  assert.throws(() => verifyCpmmContributionReceipt({ ...base, kvroMint: 'OTHER' }), /MINT_MISMATCH/);
  assert.throws(() => verifyCpmmContributionReceipt({ ...base, poolType: 'RAYDIUM_CLMM' }), /UNSUPPORTED_POOL_TYPE/);
  assert.throws(() => verifyCpmmContributionReceipt({ ...base, kvroTransferredBaseUnits: 0n }), /KVRO_TRANSFER_REQUIRED/);
});

test('fails closed on non-finalized, future or stale receipt evidence', () => {
  assert.throws(() => verifyCpmmContributionReceipt({ ...base, finalized: false }), /NOT_FINALIZED/);
  assert.throws(() => verifyCpmmContributionReceipt({ ...base, observedAtSeconds: 999 }), /TRUSTED_TIME_INVALID/);
  assert.throws(() => verifyCpmmContributionReceipt({ ...base, observedAtSeconds: 1061 }), /STALE/);
});

test('has no transaction capabilities', () => {
  assert.deepEqual(cpmmContributionReceiptCapabilities, { read: true, buildTransaction: false, signTransaction: false, sendTransaction: false });
});
