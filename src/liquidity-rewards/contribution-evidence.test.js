import test from 'node:test';
import assert from 'node:assert/strict';
import { requireVerifiedContributionEvidence } from './contribution-evidence.js';

const untrustedCallerEvidence = Object.freeze({
  poolVerified: true,
  ownershipVerified: true,
  contributionVerified: true,
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
  wallet: 'TEST_WALLET',
  positionId: 'TEST_POSITION',
  contributedKvroBaseUnits: 100n,
  ownershipEvidenceId: 'TEST_OWNERSHIP_EVIDENCE',
  contributionEvidenceId: 'TEST_CONTRIBUTION_EVIDENCE',
});

test('caller-supplied proof booleans cannot prove LP ownership or contribution', () => {
  assert.throws(
    () => requireVerifiedContributionEvidence(untrustedCallerEvidence),
    /TRUSTED_CONTRIBUTION_EVIDENCE_REQUIRED/,
  );
});

test('pool verification alone never proves LP ownership or contribution', () => {
  assert.throws(
    () => requireVerifiedContributionEvidence({ ...untrustedCallerEvidence, ownershipVerified: false, contributionVerified: false }),
    /TRUSTED_CONTRIBUTION_EVIDENCE_REQUIRED/,
  );
});

test('fails closed when contribution proof is missing', () => {
  assert.throws(
    () => requireVerifiedContributionEvidence({ ...untrustedCallerEvidence, contributionVerified: false }),
    /TRUSTED_CONTRIBUTION_EVIDENCE_REQUIRED/,
  );
});

test('fails closed on malformed identity or non-positive contribution', () => {
  assert.throws(
    () => requireVerifiedContributionEvidence({ ...untrustedCallerEvidence, positionId: '' }),
    /TRUSTED_CONTRIBUTION_EVIDENCE_REQUIRED/,
  );
  assert.throws(
    () => requireVerifiedContributionEvidence({ ...untrustedCallerEvidence, contributedKvroBaseUnits: 0n }),
    /TRUSTED_CONTRIBUTION_EVIDENCE_REQUIRED/,
  );
});

test('untrusted caller evidence exposes no transaction execution capability because it is rejected', () => {
  assert.throws(
    () => requireVerifiedContributionEvidence(untrustedCallerEvidence),
    /TRUSTED_CONTRIBUTION_EVIDENCE_REQUIRED/,
  );
});
