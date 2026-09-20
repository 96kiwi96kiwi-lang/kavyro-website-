import test from 'node:test';
import assert from 'node:assert/strict';
import { KAVYRO_MINT, WRAPPED_SOL_MINT, POOL_STATUS } from './config.js';
import { validateRaydiumPool } from './pool-validator.js';

const VERIFIED_TEST_POOL_ID = 'TEST_ONLY_VERIFIED_POOL_ID';

function candidate(overrides = {}) {
  return {
    onChainExists: true,
    poolId: VERIFIED_TEST_POOL_ID,
    poolType: 'CPMM',
    mintA: KAVYRO_MINT,
    mintB: WRAPPED_SOL_MINT,
    ...overrides,
  };
}

test('accepts decoded KVRO/WSOL pool data in either mint order', () => {
  for (const [mintA, mintB] of [
    [KAVYRO_MINT, WRAPPED_SOL_MINT],
    [WRAPPED_SOL_MINT, KAVYRO_MINT],
  ]) {
    const result = validateRaydiumPool(candidate({ mintA, mintB }));
    assert.equal(result.verified, true);
    assert.equal(result.status, POOL_STATUS.VERIFIED);
    assert.equal(result.poolId, VERIFIED_TEST_POOL_ID);
  }
});

test('fails closed when on-chain existence is not explicitly confirmed', () => {
  for (const onChainExists of [false, undefined, null]) {
    const result = validateRaydiumPool(candidate({ onChainExists }));
    assert.equal(result.verified, false);
    assert.equal(result.status, POOL_STATUS.UNVERIFIED);
    assert.equal(result.poolId, null);
  }
});

test('rejects missing Pool ID without inventing one', () => {
  const result = validateRaydiumPool(candidate({ poolId: '   ' }));
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'POOL_ID_MISSING');
  assert.equal(result.poolId, null);
});

test('rejects unsupported Raydium pool type', () => {
  const result = validateRaydiumPool(candidate({ poolType: 'UNKNOWN' }));
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'UNSUPPORTED_POOL_TYPE');
  assert.equal(result.poolId, null);
});

test('rejects CLMM until an independent decoder is implemented', () => {
  const result = validateRaydiumPool(candidate({ poolType: 'CLMM' }));
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'UNSUPPORTED_POOL_TYPE');
});

test('rejects a different token mint even when ticker could look identical', () => {
  const result = validateRaydiumPool(candidate({
    mintA: '11111111111111111111111111111111',
  }));
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'MINT_PAIR_MISMATCH');
  assert.equal(result.poolId, null);
});

test('rejects duplicate or incomplete mint pairs', () => {
  for (const overrides of [
    { mintB: KAVYRO_MINT },
    { mintA: '' },
    { mintB: null },
  ]) {
    const result = validateRaydiumPool(candidate(overrides));
    assert.equal(result.verified, false);
    assert.equal(result.poolId, null);
  }
});

test('supports CPMM only when all other verification inputs are valid', () => {
  const result = validateRaydiumPool(candidate({ poolType: 'CPMM' }));
  assert.equal(result.verified, true);
  assert.equal(result.poolType, 'CPMM');
});
