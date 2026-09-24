import test from 'node:test';
import assert from 'node:assert/strict';
import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';
import { createRaydiumCpmmPoolReader, RAYDIUM_CPMM_PROGRAM_ID, RAYDIUM_CPMM_POOL_STATE_DISCRIMINATOR } from './raydium-cpmm-pool-reader.js';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
/** @param {string} value */
function base58Decode(value) {
  const bytes = [0];
  for (const char of value) {
    let carry = ALPHABET.indexOf(char);
    assert.notEqual(carry, -1);
    for (let i = 0; i < bytes.length; i += 1) { carry += bytes[i] * 58; bytes[i] = carry & 0xff; carry >>= 8; }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  let zeros = 0;
  while (zeros < value.length && value[zeros] === '1') zeros += 1;
  return Uint8Array.from([...new Array(zeros).fill(0), ...bytes.reverse()]);
}

function poolData(mint0 = KAVYRO_MINT, mint1 = WRAPPED_SOL_MINT, lpMint = WRAPPED_SOL_MINT) {
  const data = Buffer.alloc(232);
  Buffer.from(RAYDIUM_CPMM_POOL_STATE_DISCRIMINATOR).copy(data, 0);
  Buffer.from(base58Decode(lpMint)).copy(data, 136);
  Buffer.from(base58Decode(mint0)).copy(data, 168);
  Buffer.from(base58Decode(mint1)).copy(data, 200);
  return data.toString('base64');
}

const raw = (overrides = {}) => ({ exists: true, address: 'pool-candidate', owner: RAYDIUM_CPMM_PROGRAM_ID, executable: false, contextSlot: 123, dataBase64: poolData(), ...overrides });

test('decodes canonical mint pair and LP mint from finalized raw CPMM account data', async () => {
  const reader = createRaydiumCpmmPoolReader({ readRawAccount: async () => raw() });
  const result = await reader.readPoolAccount('pool-candidate');
  assert.equal(result.exists, true);
  assert.equal(result.lpMint, WRAPPED_SOL_MINT);
  assert.equal(result.mintA, KAVYRO_MINT);
  assert.equal(result.mintB, WRAPPED_SOL_MINT);
  assert.equal(result.owner, RAYDIUM_CPMM_PROGRAM_ID);
  assert.equal(result.poolType, 'RAYDIUM_CPMM');
  assert.equal(result.payoutAuthorized, false);
});

test('fails closed when RPC response address differs from requested pool', async () => {
  const reader = createRaydiumCpmmPoolReader({ readRawAccount: async () => raw({ address: 'different-pool' }) });
  await assert.rejects(() => reader.readPoolAccount('pool-candidate'), /address mismatch/);
});

test('fails closed on wrong owner', async () => {
  const reader = createRaydiumCpmmPoolReader({ readRawAccount: async () => raw({ owner: 'fake-owner' }) });
  await assert.rejects(() => reader.readPoolAccount('pool-candidate'), /owner mismatch/);
});

test('fails closed on wrong discriminator', async () => {
  const data = Buffer.from(poolData(), 'base64'); data[0] ^= 0xff;
  const reader = createRaydiumCpmmPoolReader({ readRawAccount: async () => raw({ dataBase64: data.toString('base64') }) });
  await assert.rejects(() => reader.readPoolAccount('pool-candidate'), /discriminator mismatch/);
});

test('fails closed on truncated account', async () => {
  const reader = createRaydiumCpmmPoolReader({ readRawAccount: async () => raw({ dataBase64: Buffer.alloc(64).toString('base64') }) });
  await assert.rejects(() => reader.readPoolAccount('pool-candidate'), /too short/);
});

test('preserves account-not-found without inventing mints', async () => {
  const reader = createRaydiumCpmmPoolReader({ readRawAccount: async () => ({ exists: false, address: 'missing', contextSlot: 9 }) });
  assert.deepEqual(await reader.readPoolAccount('missing'), { exists: false, address: 'missing', contextSlot: 9 });
});

test('has no transaction capabilities', () => {
  const reader = createRaydiumCpmmPoolReader({ readRawAccount: async () => raw() });
  assert.deepEqual(reader.capabilities, { read: true, buildTransaction: false, signTransaction: false, sendTransaction: false });
});
