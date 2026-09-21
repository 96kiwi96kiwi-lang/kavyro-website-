import test from 'node:test';
import assert from 'node:assert/strict';

import { KAVYRO_MINT, WRAPPED_SOL_MINT, POOL_STATUS } from './config.js';
import { createReadOnlyPoolProvider } from './read-only-provider.js';
import { collectSafeObservations } from './safe-observation-pipeline.js';
import { requireVerifiedContributionEvidence } from './contribution-evidence.js';
import { evaluateHoldingEligibility } from './holding-eligibility.js';
import { requireVerifiedEntitlement } from './entitlement-boundary.js';
import { createReplayRecord, appendReplayRecord } from './replay-ledger.js';
import { evaluatePayoutGate } from './payout-gate.js';

const TEST_POOL = 'TEST_ONLY_POOL_ID_NOT_PRODUCTION';
const TEST_WALLET = 'TEST_WALLET_NOT_PRODUCTION';
const TEST_POSITION = 'TEST_POSITION_NOT_PRODUCTION';

function providerFor(candidate) {
  return createReadOnlyPoolProvider({
    source: 'TEST_FIXTURE_NOT_PRODUCTION',
    fetchCandidates: async () => [candidate],
  });
}

function verifierFor({ verified = true, mintB = WRAPPED_SOL_MINT } = {}) {
  return Object.freeze({
    verifyCandidate: async () => verified ? Object.freeze({
      verified: true,
      source: 'TEST_RPC_FIXTURE_NOT_PRODUCTION',
      poolId: TEST_POOL,
      mintA: KAVYRO_MINT,
      mintB,
      onChainExists: true,
    }) : Object.freeze({ verified: false, reason: 'STALE_RPC_EVIDENCE' }),
  });
}

test('composes verified read-only evidence through entitlement while payout remains impossible', async () => {
  const observationResult = await collectSafeObservations(providerFor({ poolId: TEST_POOL }), verifierFor());
  assert.equal(observationResult.ok, true);
  assert.equal(observationResult.observations.length, 1);
  assert.equal(observationResult.payoutAuthorized, false);

  const contribution = requireVerifiedContributionEvidence({
    poolVerified: true,
    ownershipVerified: true,
    contributionVerified: true,
    poolId: TEST_POOL,
    wallet: TEST_WALLET,
    positionId: TEST_POSITION,
    contributedKvroBaseUnits: 1000n,
    ownershipEvidenceId: 'TEST_OWNERSHIP_EVIDENCE',
    contributionEvidenceId: 'TEST_CONTRIBUTION_EVIDENCE',
  });

  const observations = Array.from({ length: 24 }, (_, observationPeriod) => ({
    poolVerified: true,
    poolId: TEST_POOL,
    wallet: TEST_WALLET,
    positionId: TEST_POSITION,
    observationPeriod,
    contributedKvroBaseUnits: 1000n,
  }));
  const eligibility = evaluateHoldingEligibility({ observations });
  const entitlement = requireVerifiedEntitlement(contribution, eligibility);
  const replayRecord = createReplayRecord(entitlement);
  const replayLedger = appendReplayRecord([], replayRecord);

  assert.equal(entitlement.entitlementAuthorized, false);
  assert.equal(entitlement.payoutAuthorized, false);
  assert.equal(replayLedger.length, 1);
  assert.throws(() => appendReplayRecord(replayLedger, replayRecord), /ENTITLEMENT_REPLAY_DETECTED/);

  const payout = evaluatePayoutGate({
    config: { enabled: false, poolStatus: POOL_STATUS.VERIFIED, poolId: TEST_POOL },
    entitlement: { payoutAuthorized: entitlement.payoutAuthorized, rewardBaseUnits: entitlement.entitledKvroBaseUnits },
  });
  assert.equal(payout.authorized, false);
  assert.equal(payout.canBuildTransaction, false);
  assert.equal(payout.canSignTransaction, false);
  assert.equal(payout.canSendTransaction, false);
  assert.ok(payout.reasons.includes('REWARDS_DISABLED'));
  assert.ok(payout.reasons.includes('PAYOUT_IMPLEMENTATION_NOT_AVAILABLE'));
});

test('fails closed before entitlement when RPC evidence is stale or canonical mint pair is wrong', async () => {
  const stale = await collectSafeObservations(providerFor({ poolId: TEST_POOL }), verifierFor({ verified: false }));
  assert.deepEqual(stale.observations, []);
  assert.deepEqual(stale.reasons, ['STALE_RPC_EVIDENCE']);
  assert.equal(stale.payoutAuthorized, false);

  const wrongMint = await collectSafeObservations(providerFor({ poolId: TEST_POOL }), verifierFor({ mintB: 'TEST_WRONG_MINT_NOT_PRODUCTION' }));
  assert.deepEqual(wrongMint.observations, []);
  assert.deepEqual(wrongMint.reasons, ['OBSERVATION_UNEXPECTED_MINTS']);
  assert.equal(wrongMint.payoutAuthorized, false);
});

test('pool verification alone cannot become contribution evidence', () => {
  assert.throws(() => requireVerifiedContributionEvidence({
    poolVerified: true,
    ownershipVerified: false,
    contributionVerified: false,
    poolId: TEST_POOL,
  }), /LP_OWNERSHIP_NOT_PROVEN/);
});
