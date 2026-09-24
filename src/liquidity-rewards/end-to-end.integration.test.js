import test from 'node:test';
import assert from 'node:assert/strict';

import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';
import { createReadOnlyPoolProvider } from './read-only-provider.js';
import { collectSafeObservations } from './safe-observation-pipeline.js';
import { requireVerifiedContributionEvidence } from './contribution-evidence.js';
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

test('composes verified read-only pool evidence through persistence and audit, then stops at untrusted LP contribution', async () => {
  const observationResult = await collectSafeObservations(providerFor({ poolId: TEST_POOL }), verifierFor());
  assert.equal(observationResult.ok, true);
  assert.equal(observationResult.observations.length, 1);
  assert.equal(observationResult.payoutAuthorized, false);

  const observations = Array.from({ length: 24 }, (_, observationPeriod) => ({
    poolVerified: true,
    poolId: TEST_POOL,
    wallet: TEST_WALLET,
    positionId: TEST_POSITION,
    observationPeriod,
    contextSlot: 123456789 + observationPeriod,
    observedAtSeconds: observationPeriod * 3600,
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

  const restartedLedger = createPersistentObservationLedger(storage);
  assert.equal(restartedLedger.snapshot().length, 24);
  const restored = restartedLedger.snapshot()[23];
  assert.equal(restored.contextSlot, 123456812);
  assert.equal(restored.observedAtSeconds, 82800);
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

  assert.throws(() => requireVerifiedContributionEvidence({
    poolVerified: true,
    ownershipVerified: true,
    contributionVerified: true,
    poolId: TEST_POOL,
    wallet: TEST_WALLET,
    positionId: TEST_POSITION,
    contributedKvroBaseUnits: 1000n,
    ownershipEvidenceId: 'TEST_OWNERSHIP_EVIDENCE',
    contributionEvidenceId: 'TEST_CONTRIBUTION_EVIDENCE',
  }), /TRUSTED_CONTRIBUTION_EVIDENCE_REQUIRED/);
});

test('caller-supplied LP proof cannot reach replay or review-candidate stages after restart', () => {
  assert.throws(() => requireVerifiedContributionEvidence({
    poolVerified: true,
    ownershipVerified: true,
    contributionVerified: true,
    poolId: TEST_POOL,
    wallet: TEST_WALLET,
    positionId: TEST_POSITION,
    contributedKvroBaseUnits: 1000n,
    ownershipEvidenceId: 'TEST_OWNERSHIP_EVIDENCE',
    contributionEvidenceId: 'TEST_CONTRIBUTION_EVIDENCE',
  }), /TRUSTED_CONTRIBUTION_EVIDENCE_REQUIRED/);
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

  const persisted = { wallet: TEST_WALLET, positionId: TEST_POSITION, poolId: TEST_POOL, observationPeriod: 1, contextSlot: 2, observedAtSeconds: 3600 };
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
  }), /TRUSTED_CONTRIBUTION_EVIDENCE_REQUIRED/);
});
