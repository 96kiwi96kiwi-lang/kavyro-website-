import assert from 'node:assert/strict';
import test from 'node:test';

import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';
import {
  createRaydiumApiProvider,
  parseRaydiumMintResponse,
  RAYDIUM_DISCOVERY_SOURCE,
} from './raydium-api-provider.js';

const POOL = 'TEST_ONLY_POOL_ID_NOT_PRODUCTION';

test('parser accepts only canonical KAVYRO/wSOL pair and keeps it unverified on-chain', () => {
  const result = parseRaydiumMintResponse({
    success: true,
    data: { data: [
      { id: POOL, mintA: { address: KAVYRO_MINT }, mintB: { address: WRAPPED_SOL_MINT } },
      { id: 'WRONG_PAIR', mintA: { address: 'not-kavyro' }, mintB: { address: WRAPPED_SOL_MINT } },
    ] },
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].poolId, POOL);
  assert.equal(result[0].source, RAYDIUM_DISCOVERY_SOURCE);
  assert.equal(result[0].onChainExists, false);
  assert.equal(result[0].discoveryOnly, true);
});

test('parser deduplicates pool ids and fails closed on unsuccessful/malformed payloads', () => {
  const row = { id: POOL, mintA: KAVYRO_MINT, mintB: WRAPPED_SOL_MINT };
  assert.equal(parseRaydiumMintResponse({ success: true, data: [row, row] }).length, 1);
  assert.deepEqual(parseRaydiumMintResponse({ success: false, data: [row] }), []);
  assert.deepEqual(parseRaydiumMintResponse({ success: true, data: {} }), []);
});

test('provider queries by canonical mints and exposes no transaction capabilities', async () => {
  let requestedUrl;
  const provider = createRaydiumApiProvider({
    fetchImpl: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: [{ id: POOL, mintA: KAVYRO_MINT, mintB: WRAPPED_SOL_MINT }],
        }),
      };
    },
  });

  const candidates = await provider.readPoolCandidates();
  assert.equal(requestedUrl.searchParams.get('mint1'), KAVYRO_MINT);
  assert.equal(requestedUrl.searchParams.get('mint2'), WRAPPED_SOL_MINT);
  assert.equal(candidates.length, 1);
  assert.deepEqual(provider.capabilities, {
    read: true,
    buildTransaction: false,
    signTransaction: false,
    sendTransaction: false,
  });
});

test('provider propagates HTTP failure instead of fabricating candidates', async () => {
  const provider = createRaydiumApiProvider({
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(() => provider.readPoolCandidates(), /Raydium discovery HTTP 503/);
});
