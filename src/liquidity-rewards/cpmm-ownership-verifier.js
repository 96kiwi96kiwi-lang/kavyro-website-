import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';

/**
 * Read-only binding between a decoded Raydium CPMM PoolState and a decoded SPL token account.
 * This proves only current LP-token ownership/balance at independently reported RPC slots.
 * It MUST NOT be treated as proof of historical KVRO contribution.
 *
 * @param {{
 *   poolReader: {readPoolAccount: (poolId: string) => Promise<any>},
 *   tokenAccountReader: {readTokenAccount: (address: string) => Promise<any>}
 * }} options
 */
export function createCpmmOwnershipVerifier(options) {
  if (!options || typeof options.poolReader?.readPoolAccount !== 'function' ||
      typeof options.tokenAccountReader?.readTokenAccount !== 'function') {
    throw new TypeError('poolReader and tokenAccountReader are required');
  }
  const { poolReader, tokenAccountReader } = options;

  return Object.freeze({
    /**
     * @param {{poolId: string, tokenAccount: string, wallet: string}} request
     */
    verifyCurrentOwnership: async (request) => {
      if (!request || typeof request.poolId !== 'string' || !request.poolId.trim() ||
          typeof request.tokenAccount !== 'string' || !request.tokenAccount.trim() ||
          typeof request.wallet !== 'string' || !request.wallet.trim()) {
        throw new Error('Invalid CPMM ownership request');
      }

      const [pool, tokenAccount] = await Promise.all([
        poolReader.readPoolAccount(request.poolId),
        tokenAccountReader.readTokenAccount(request.tokenAccount),
      ]);
      if (!pool?.exists || !tokenAccount?.exists) throw new Error('Required on-chain account is missing');
      if (pool.poolType !== 'RAYDIUM_CPMM') throw new Error('Unsupported pool type');
      const canonicalPair = (pool.mintA === KAVYRO_MINT && pool.mintB === WRAPPED_SOL_MINT) ||
        (pool.mintB === KAVYRO_MINT && pool.mintA === WRAPPED_SOL_MINT);
      if (!canonicalPair) throw new Error('Pool mint pair does not match canonical KVRO/WSOL');
      if (tokenAccount.mint !== pool.lpMint) throw new Error('Token account mint does not match pool LP mint');
      if (tokenAccount.walletOwner !== request.wallet) throw new Error('Token account owner does not match wallet');
      if (typeof tokenAccount.amountBaseUnits !== 'bigint' || tokenAccount.amountBaseUnits <= 0n) {
        throw new Error('LP token balance must be positive');
      }
      if (!Number.isSafeInteger(pool.contextSlot) || !Number.isSafeInteger(tokenAccount.contextSlot)) {
        throw new Error('Invalid RPC provenance slot');
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
