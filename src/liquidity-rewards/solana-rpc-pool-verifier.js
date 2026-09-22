import { recordOf } from './input-contracts.js';

// Independent, read-only Solana RPC verification boundary for Raydium pool candidates.
// The RPC transport is injected; this module cannot build, sign, or send transactions.

import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';

export const SOLANA_RPC_VERIFICATION_SOURCE = 'SOLANA_RPC_ACCOUNT_VERIFICATION';

/** @param {unknown} value */
const clean = (value) => typeof value === 'string' ? value.trim() : '';

/** @param {unknown} value */
const safeSlot = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
/** @param {unknown} value */
const safeTimestamp = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/**
 * @param {{
 *   readPoolAccount?: (poolId: string) => Promise<unknown>,
 *   allowedProgramOwners?: readonly string[],
 *   minimumContextSlot?: number | null,
 *   readBlockTime?: (slot: number) => Promise<unknown>,
 *   nowSeconds?: () => number,
 *   maxObservationAgeSeconds?: number | null
 * }} [options]
 */
export function createSolanaRpcPoolVerifier({
  readPoolAccount,
  allowedProgramOwners = [],
  minimumContextSlot = null,
  readBlockTime,
  nowSeconds,
  maxObservationAgeSeconds = null,
} = {}) {
  if (typeof readPoolAccount !== 'function') throw new TypeError('readPoolAccount must be a function');
  const owners = new Set(allowedProgramOwners.map(clean).filter(Boolean));
  if (owners.size === 0) throw new TypeError('allowedProgramOwners must contain independently verified Raydium program owner(s)');
  if (minimumContextSlot !== null && safeSlot(minimumContextSlot) === null) {
    throw new TypeError('minimumContextSlot must be a safe non-negative integer or null');
  }

  const trustedTimeEnabled = readBlockTime !== undefined || nowSeconds !== undefined || maxObservationAgeSeconds !== null;
  const maxAgeSeconds = safeTimestamp(maxObservationAgeSeconds);
  if (trustedTimeEnabled) {
    if (typeof readBlockTime !== 'function') throw new TypeError('readBlockTime must be a function when trusted observation time is enabled');
    if (typeof nowSeconds !== 'function') throw new TypeError('nowSeconds must be a function when trusted observation time is enabled');
    if (maxAgeSeconds === null) {
      throw new TypeError('maxObservationAgeSeconds must be a safe non-negative integer when trusted observation time is enabled');
    }
  }

  /** @param {unknown} input */
  const verifyCandidate = async (input = {}) => {
    const candidate = recordOf(input);
    const poolId = clean(candidate.poolId);
    if (!poolId || candidate.discoveryOnly !== true || candidate.onChainExists !== false) {
      return Object.freeze({ verified: false, reason: 'INVALID_DISCOVERY_CANDIDATE' });
    }

    let account;
    try {
      account = recordOf(await readPoolAccount(poolId));
    } catch {
      return Object.freeze({ verified: false, reason: 'RPC_READ_FAILED' });
    }

    const owner = clean(account.owner);
    const mintA = clean(account.mintA);
    const mintB = clean(account.mintB);
    const contextSlot = safeSlot(account.contextSlot);
    const pair = new Set([mintA, mintB]);

    if (account.exists !== true) return Object.freeze({ verified: false, reason: 'POOL_ACCOUNT_NOT_FOUND' });
    if (minimumContextSlot !== null && (contextSlot === null || contextSlot < minimumContextSlot)) {
      return Object.freeze({ verified: false, reason: 'STALE_RPC_EVIDENCE' });
    }
    if (!owners.has(owner)) return Object.freeze({ verified: false, reason: 'UNTRUSTED_PROGRAM_OWNER' });
    if (pair.size !== 2 || !pair.has(KAVYRO_MINT) || !pair.has(WRAPPED_SOL_MINT)) {
      return Object.freeze({ verified: false, reason: 'CANONICAL_MINT_PAIR_MISMATCH' });
    }

    let observedAtSeconds = null;
    if (trustedTimeEnabled) {
      if (contextSlot === null) return Object.freeze({ verified: false, reason: 'RPC_CONTEXT_SLOT_REQUIRED_FOR_TIME' });
      let rawBlockTime;
      try {
        rawBlockTime = await readBlockTime(contextSlot);
      } catch {
        return Object.freeze({ verified: false, reason: 'RPC_BLOCK_TIME_READ_FAILED' });
      }
      observedAtSeconds = safeTimestamp(rawBlockTime);
      if (observedAtSeconds === null) return Object.freeze({ verified: false, reason: 'RPC_BLOCK_TIME_INVALID' });

      const now = safeTimestamp(nowSeconds());
      if (now === null) return Object.freeze({ verified: false, reason: 'LOCAL_TIME_INVALID' });
      if (observedAtSeconds > now) return Object.freeze({ verified: false, reason: 'FUTURE_RPC_EVIDENCE' });
      if (maxAgeSeconds === null || now - observedAtSeconds > maxAgeSeconds) {
        return Object.freeze({ verified: false, reason: 'STALE_RPC_TIME_EVIDENCE' });
      }
    }

    return Object.freeze({
      verified: true,
      poolId,
      mintA,
      mintB,
      owner,
      contextSlot,
      ...(observedAtSeconds === null ? {} : { observedAtSeconds }),
      onChainExists: true,
      source: SOLANA_RPC_VERIFICATION_SOURCE,
      discoverySource: candidate.source,
      payoutAuthorized: false,
      canBuildTransaction: false,
      canSignTransaction: false,
      canSendTransaction: false,
    });
  };

  return Object.freeze({
    verifyCandidate,
    capabilities: Object.freeze({ read: true, buildTransaction: false, signTransaction: false, sendTransaction: false }),
  });
}
