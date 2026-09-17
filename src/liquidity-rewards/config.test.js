import assert from 'node:assert/strict';
import test from 'node:test';

import {
  KAVYRO_MINT,
  WRAPPED_SOL_MINT,
  POOL_STATUS,
  liquidityRewardsConfig,
  assertRewardsCanRun,
} from './config.js';

test('production defaults remain fail-closed', () => {
  assert.equal(liquidityRewardsConfig.enabled, false);
  assert.equal(liquidityRewardsConfig.poolId, null);
  assert.equal(liquidityRewardsConfig.poolStatus, POOL_STATUS.UNVERIFIED);
  assert.deepEqual(liquidityRewardsConfig.expectedMints, [KAVYRO_MINT, WRAPPED_SOL_MINT]);
});

test('default configuration cannot run rewards', () => {
  assert.throws(() => assertRewardsCanRun(), /LIQUIDITY_REWARDS_DISABLED/);
});

test('enabled flag alone cannot bypass pool verification', () => {
  assert.throws(
    () => assertRewardsCanRun({ enabled: true, poolId: null, poolStatus: POOL_STATUS.UNVERIFIED }),
    /POOL_NOT_VERIFIED/,
  );
});

test('verified status without a pool id remains blocked', () => {
  assert.throws(
    () => assertRewardsCanRun({ enabled: true, poolId: null, poolStatus: POOL_STATUS.VERIFIED }),
    /POOL_NOT_VERIFIED/,
  );
});

test('configuration constants are immutable', () => {
  assert.equal(Object.isFrozen(liquidityRewardsConfig), true);
  assert.equal(Object.isFrozen(liquidityRewardsConfig.expectedMints), true);
  assert.equal(Object.isFrozen(POOL_STATUS), true);
});
