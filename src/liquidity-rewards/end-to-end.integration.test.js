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
import { createPersistentObservationLedger } from './persistent-observation-ledger.js';
import { reconcileObservationEvidence } from './observation-reconciliation.js';
import { createObservationAuditEvidence, verifyObservationAuditEvidence } from './integrity-audit.js';

const TEST_POOL = 'TEST_ONLY_POOL_ID_NOT_PRODUCTION';
const TEST_WALLET = 'TEST_WALLET_NOT_PRODUCTION';
const TEST_POSITION = 'TEST_POSITION_NOT_PRODUCTION';

/** @param {Readonly<{ poolId: string }>} candidate */
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
      contextSlot: 123456789,
      observedAtSeconds: 3600,
    }) : Object.freeze({ verified: false, reason: 'STALE_RPC_EVIDENCE' }),
  });
}

test('composes verified read-only evidence through persistence, reconciliation, entitlement and payout denial', async () => {
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

  /** @type {unknown[]} */
  let persisted = [];
  const storage = {
    load: () => persisted,
    /** @param {readonly unknown[]} entries */
    save: (entries) => { persisted = entries.slice(); },
  };
  const ledger = createPersistentObservationLedger(storage);
  for (const observation of observations) {
    const result = ledger.record(observation);
    assert.equal(result.recorded, true);
    assert.equal(result.payoutAuthorized, false);
  }
  assert.equal(ledger.snapshot().length, 24);

  // Simulate process restart: the new ledger instance must restore the same records.
  const restartedLedger = createPersistentObservationLedger(storage);
  assert.equal(restartedLedger.snapshot().length, 24);
  const restored = restartedLedger.snapshot()[23];
  const reconciliation = reconcileObservationEvidence(restored, observations[23]);
  assert.equal(reconciliation.reconciled, true);
  assert.equal(reconciliation.ownershipProven, false);
  assert.equal(reconciliation.contributionProven, false);
  assert.equal(reconciliation.payoutAuthorized, false);

  const audit = createObservationAuditEvidence(restored);
  assert.equal(audit.valid, true);
  assert.equal(audit.payoutAuthorized, false);
  if (!audit.valid) throw new Error('AUDIT_EVIDENCE_EXPECTED');
  const auditVerification = verifyObservationAuditEvidence(audit.evidence, audit.digest);
  assert.equal(auditVerification.valid, true);
  assert.equal(auditVerification.payoutAuthorized, false);

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

test('persistence, reconciliation and audit fail closed on corruption or tampering', () => {
  assert.throws(() => createPersistentObservationLedger({ load: () => [{ wallet: TEST_WALLET, positionId: TEST_POSITION, poolId: TEST_POOL, observationPeriod: -1 }], save: () => {} }), /INVALID_LEDGER_ENTRY/);

  const persisted = { wallet: TEST_WALLET, positionId: TEST_POSITION, poolId: TEST_POOL, observationPeriod: 1 };
  const mismatched = { ...persisted, poolId: 'TEST_OTHER_POOL_NOT_PRODUCTION' };
  const reconciliation = reconcileObservationEvidence(persisted, mismatched);
  assert.equal(reconciliation.reconciled, false);
  assert.equal(reconciliation.reason, 'POOL_MISMATCH');
  assert.equal(reconciliation.payoutAuthorized, false);

  const audit = createObservationAuditEvidence(persisted);
  assert.equal(audit.valid, true);
  if (!audit.valid) throw new Error('AUDIT_EVIDENCE_EXPECTED');
  const tampered = verifyObservationAuditEvidence({ ...audit.evidence, poolId: 'TEST_OTHER_POOL_NOT_PRODUCTION' }, audit.digest);
  assert.equal(tampered.valid, false);
  assert.equal(tampered.reason, 'AUDIT_EVIDENCE_TAMPERED');
  assert.equal(tampered.payoutAuthorized, false);
});

test('pool verification alone cannot become contribution evidence', () => {
  assert.throws(() => requireVerifiedContributionEvidence({
    poolVerified: true,
    ownershipVerified: false,
    contributionVerified: false,
    poolId: TEST_POOL,
  }), /LP_OWNERSHIP_NOT_PROVEN/);
});
