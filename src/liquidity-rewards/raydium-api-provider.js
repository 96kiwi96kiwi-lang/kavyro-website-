// Read-only Raydium API v3 discovery for KAVYRO Liquidity Rewards.
// Discovery is keyed by the canonical mint, never by ticker/symbol.
// API data is only a discovery signal: onChainExists is deliberately false
// until an independent Solana account/program verification step confirms it.

import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';
import { createReadOnlyPoolProvider } from './read-only-provider.js';

export const RAYDIUM_API_BASE = 'https://api-v3.raydium.io';
export const RAYDIUM_DISCOVERY_SOURCE = 'RAYDIUM_API_V3_MINT_DISCOVERY';

function cleanMint(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeApiPool(pool = {}) {
  const mintA = cleanMint(pool?.mintA?.address ?? pool?.mintA);
  const mintB = cleanMint(pool?.mintB?.address ?? pool?.mintB);
  const poolId = typeof pool?.id === 'string' ? pool.id.trim() : '';

  const pair = new Set([mintA, mintB]);
  if (!poolId || pair.size !== 2 || !pair.has(KAVYRO_MINT) || !pair.has(WRAPPED_SOL_MINT)) {
    return null;
  }

  return Object.freeze({
    poolId,
    mintA,
    mintB,
    // Never trust an HTTP indexer as proof that the pool account exists/on-chain owner is correct.
    onChainExists: false,
    source: RAYDIUM_DISCOVERY_SOURCE,
    discoveryOnly: true,
  });
}

export function parseRaydiumMintResponse(payload) {
  if (payload?.success !== true) return Object.freeze([]);

  const raw = Array.isArray(payload?.data?.data)
    ? payload.data.data
    : Array.isArray(payload?.data)
      ? payload.data
      : [];

  const seen = new Set();
  const candidates = [];
  for (const pool of raw) {
    const candidate = normalizeApiPool(pool);
    if (!candidate || seen.has(candidate.poolId)) continue;
    seen.add(candidate.poolId);
    candidates.push(candidate);
  }
  return Object.freeze(candidates);
}

export function createRaydiumApiProvider({ fetchImpl = globalThis.fetch, baseUrl = RAYDIUM_API_BASE } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  const fetchCandidates = async () => {
    const url = new URL('/pools/info/mint', baseUrl);
    url.searchParams.set('mint1', KAVYRO_MINT);
    url.searchParams.set('mint2', WRAPPED_SOL_MINT);
    url.searchParams.set('poolType', 'all');
    url.searchParams.set('poolSortField', 'default');
    url.searchParams.set('sortType', 'desc');
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('page', '1');

    const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' } });
    if (!response?.ok) throw new Error(`Raydium discovery HTTP ${response?.status ?? 'UNKNOWN'}`);
    return parseRaydiumMintResponse(await response.json());
  };

  return createReadOnlyPoolProvider({ fetchCandidates, source: RAYDIUM_DISCOVERY_SOURCE });
}
