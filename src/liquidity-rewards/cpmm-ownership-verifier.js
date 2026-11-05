import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';

/** @param {unknown} value */
function isCanonicalIdentity(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value &&
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
    });
}

/**
 * Read-only binding between a decoded Raydium CPMM PoolState and a decoded SPL token account.
 * This proves only current LP-token ownership/balance at independently reported RPC slots.
 * It MUST NOT be treated as proof of historical KVRO contribution.
 *
 * @param {{
 *   poolReader: {readPoolAccount: (poolId: string) => Promise<any>},
 *   tokenAccountReader: {readTokenAccount: (address: string) => Promise<any>},
 *   maxContextSlotSkew?: number
 * }} options
 */
export function createCpmmOwnershipVerifier(options) {
  if (!options || typeof options.poolReader?.readPoolAccount !== 'function' ||
      typeof options.tokenAccountReader?.readTokenAccount !== 'function') {
    throw new TypeError('poolReader and tokenAccountReader are required');
  }
  const { poolReader, tokenAccountReader } = options;
  // Slot proximity only; this does not prove freshness or historical contribution.
  const maxContextSlotSkew = options.maxContextSlotSkew ?? 32;
  if (!Number.isSafeInteger(maxContextSlotSkew) || maxContextSlotSkew < 0) {
    throw new TypeError('maxContextSlotSkew must be a non-negative safe integer');
  }

  return Object.freeze({
    /**
     * @param {{poolId: string, tokenAccount: string, wallet: string}} request
     */
    verifyCurrentOwnership: async (request) => {
      if (!request || !isCanonicalIdentity(request.poolId) ||
          !isCanonicalIdentity(request.tokenAccount) || !isCanonicalIdentity(request.wallet)) {
        throw new Error('Invalid CPMM ownership request');
      }

      const [pool, tokenAccount] = await Promise.all([
        poolReader.readPoolAccount(request.poolId),
        tokenAccountReader.readTokenAccount(request.tokenAccount),
      ]);
      if (!pool?.exists || !tokenAccount?.exists) throw new Error('Required on-chain account is missing');
      if (pool.address !== request.poolId || tokenAccount.address !== request.tokenAccount) {
        throw new Error('On-chain account address does not match ownership request');
      }
      if (pool.poolType !== 'RAYDIUM_CPMM') throw new Error('Unsupported pool type');
      const canonicalPair = (pool.mintA === KAVYRO_MINT && pool.mintB === WRAPPED_SOL_MINT) ||
        (pool.mintB === KAVYRO_MINT && pool.mintA === WRAPPED_SOL_MINT);
      if (!canonicalPair) throw new Error('Pool mint pair does not match canonical KVRO/WSOL');
      if (typeof pool.lpMint !== 'string' || !pool.lpMint || pool.lpMint.trim() !== pool.lpMint) {
        throw new Error('Pool LP mint identity is invalid');
      }
      if (tokenAccount.mint !== pool.lpMint) throw new Error('Token account mint does not match pool LP mint');
      if (tokenAccount.walletOwner !== request.wallet) throw new Error('Token account owner does not match wallet');
      if (typeof tokenAccount.amountBaseUnits !== 'bigint' || tokenAccount.amountBaseUnits <= 0n) {
        throw new Error('LP token balance must be positive');
      }
      if (!Number.isSafeInteger(pool.contextSlot) || pool.contextSlot <= 0 ||
          !Number.isSafeInteger(tokenAccount.contextSlot) || tokenAccount.contextSlot <= 0) {
        throw new Error('Invalid RPC provenance slot');
      }
      if (Math.abs(pool.contextSlot - tokenAccount.contextSlot) > maxContextSlotSkew) {
        throw new Error('RPC provenance slots are not temporally consistent');
      }

      return Object.freeze({
        verified: true,
        evidenceKind: 'CURRENT_CPMM_LP_OWNERSHIP',
        poolId: request.poolId,
        poolType: 'RAYDIUM_CPMM',
        wallet: request.wallet,
        tokenAccount: request.tokenAccount,
        lpMint: pool.lpMint,
        lpAmountBaseUnits: tokenAccount.amountBaseUnits,
        poolContextSlot: pool.contextSlot,
        tokenAccountContextSlot: tokenAccount.contextSlot,
        contributionAmountVerified: false,
        payoutAuthorized: false,
      });
    },
    capabilities: Object.freeze({ read: true, buildTransaction: false, signTransaction: false, sendTransaction: false }),
  });
}
