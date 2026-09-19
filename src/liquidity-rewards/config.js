// KAVYRO Liquidity Rewards — fail-closed configuration
// Rewards MUST remain disabled until a Raydium pool is independently verified on-chain.

export const KAVYRO_MINT = '8KuWwmApUWyVBVraBdhknQwRuanw2qUwXzAJorqMAHvE';
export const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';

export const POOL_STATUS = Object.freeze({
  UNVERIFIED: 'POOL_UNVERIFIED',
  VERIFIED: 'POOL_VERIFIED',
});

/**
 * @typedef {object} LiquidityRewardsConfig
 * @property {boolean} enabled
 * @property {string | null} poolId
 * @property {typeof POOL_STATUS[keyof typeof POOL_STATUS]} poolStatus
 * @property {readonly string[]} expectedMints
 */

/** @type {Readonly<LiquidityRewardsConfig>} */
export const liquidityRewardsConfig = Object.freeze({
  enabled: false,
  poolId: null,
  poolStatus: POOL_STATUS.UNVERIFIED,
  expectedMints: Object.freeze([KAVYRO_MINT, WRAPPED_SOL_MINT]),
});

/**
 * Fail closed unless rewards are explicitly enabled and the pool has already
 * crossed the independent verification boundary. This function authorizes no
 * payout and exposes no transaction capability.
 *
 * @param {LiquidityRewardsConfig} [config]
 * @returns {true}
 */
export function assertRewardsCanRun(config = liquidityRewardsConfig) {
  if (config.enabled !== true) {
    throw new Error('LIQUIDITY_REWARDS_DISABLED');
  }
  if (config.poolStatus !== POOL_STATUS.VERIFIED || !config.poolId) {
    throw new Error('POOL_NOT_VERIFIED');
  }
  return true;
}
