// Read-only Raydium API v3 discovery for KAVYRO Liquidity Rewards.
// Discovery is keyed by the canonical mint, never by ticker/symbol.
// API data is only a discovery signal: onChainExists is deliberately false
// until an independent Solana account/program verification step confirms it.

import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';
import { createReadOnlyPoolProvider } from './read-only-provider.js';

export const RAYDIUM_API_BASE = 'https://api-v3.raydium.io';
export const RAYDIUM_DISCOVERY_SOURCE = 'RAYDIUM_API_V3_MINT_DISCOVERY';

/** @param {unknown} value @returns {string} */
function cleanMint(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} value @returns {Record<string, unknown> | null} */
function asRecord(value) {
  return value !== null && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : null;
}

/** @param {unknown} value @returns {string} */
function mintAddress(value) {
  const record = asRecord(value);
  return cleanMint(record ? record.address : value);
}

/**
 * Normalize untrusted HTTP indexer data into discovery-only evidence.
 * This never proves that a pool exists on chain and never authorizes payout.
 * @param {unknown} pool
 * @returns {Readonly<{poolId: string, mintA: string, mintB: string, onChainExists: false, source: string, discoveryOnly: true}> | null}
 */
function normalizeApiPool(pool) {
  const record = asRecord(pool);
  if (!record) return null;

  const mintA = mintAddress(record.mintA);
  const mintB = mintAddress(record.mintB);
  const poolId = typeof record.id === 'string' ? record.id.trim() : '';

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

/**
 * @param {unknown} payload
 * @returns {readonly Readonly<{poolId: string, mintA: string, mintB: string, onChainExists: false, source: string, discoveryOnly: true}>[]}
 */
export function parseRaydiumMintResponse(payload) {
  const root = asRecord(payload);
  if (!root || root.success !== true) return Object.freeze([]);

  const dataRecord = asRecord(root.data);
  const nestedData = dataRecord?.data;
  const raw = Array.isArray(nestedData)
    ? nestedData
    : Array.isArray(root.data)
      ? root.data
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

/**
 * Minimal fetch contract used by this read-only adapter so tests do not need
 * to fake the entire browser Response surface.
 * @typedef {(input: URL, init?: RequestInit) => Promise<{ok: boolean, status?: number, json: () => Promise<unknown>}>} ReadOnlyFetch
 */

/**
 * @param {{fetchImpl?: ReadOnlyFetch, baseUrl?: string}} [options]
 */
export function createRaydiumApiProvider({ fetchImpl = /** @type {ReadOnlyFetch} */ (globalThis.fetch), baseUrl = RAYDIUM_API_BASE } = {}) {
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
    if (!response.ok) throw new Error(`Raydium discovery HTTP ${response.status ?? 'UNKNOWN'}`);
    return parseRaydiumMintResponse(await response.json());
  };

  return createReadOnlyPoolProvider({ fetchCandidates, source: RAYDIUM_DISCOVERY_SOURCE });
}
