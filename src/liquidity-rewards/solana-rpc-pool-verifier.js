import { recordOf } from './input-contracts.js';

// Independent, read-only Solana RPC verification boundary for Raydium pool candidates.
// The RPC transport is injected; this module cannot build, sign, or send transactions.

import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';

export const SOLANA_RPC_VERIFICATION_SOURCE = 'SOLANA_RPC_ACCOUNT_VERIFICATION';

/** @param {unknown} value */
const clean = (value) => typeof value === 'string' ? value.trim() : '';

/** @param {{readPoolAccount?: (poolId: string) => Promise<unknown>, allowedProgramOwners?: readonly string[]}} [options] */
export function createSolanaRpcPoolVerifier({ readPoolAccount, allowedProgramOwners = [] } = {}) {
  if (typeof readPoolAccount !== 'function') throw new TypeError('readPoolAccount must be a function');
  const owners = new Set(allowedProgramOwners.map(clean).filter(Boolean));
  if (owners.size === 0) throw new TypeError('allowedProgramOwners must contain independently verified Raydium program owner(s)');

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

    const owner = clean(account?.owner);
    const mintA = clean(account?.mintA);
    const mintB = clean(account?.mintB);
    const pair = new Set([mintA, mintB]);

    if (account?.exists !== true) return Object.freeze({ verified: false, reason: 'POOL_ACCOUNT_NOT_FOUND' });
    if (!owners.has(owner)) return Object.freeze({ verified: false, reason: 'UNTRUSTED_PROGRAM_OWNER' });
    if (pair.size !== 2 || !pair.has(KAVYRO_MINT) || !pair.has(WRAPPED_SOL_MINT)) {
      return Object.freeze({ verified: false, reason: 'CANONICAL_MINT_PAIR_MISMATCH' });
    }

    return Object.freeze({
      verified: true,
      poolId,
      mintA,
      mintB,
      owner,
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
