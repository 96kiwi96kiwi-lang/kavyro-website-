import test from 'node:test';
import assert from 'node:assert/strict';
import { requireVerifiedContributionEvidence } from './contribution-evidence.js';

const verified = Object.freeze({
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

test('accepts independently verified ownership and contribution without authorizing payout', () => {
  const result = requireVerifiedContributionEvidence(verified);
  assert.equal(result.verified, true);
  assert.equal(result.ownershipProven, true);
  assert.equal(result.contributionProven, true);
  assert.equal(result.contributedKvroBaseUnits, 100n);
  assert.equal(result.entitlementAuthorized, false);
  assert.equal(result.payoutAuthorized, false);
});

test('pool verification alone never proves LP ownership or contribution', () => {
  assert.throws(
    () => requireVerifiedContributionEvidence({ ...verified, ownershipVerified: false, contributionVerified: false }),
    /LP_OWNERSHIP_NOT_PROVEN/,
  );
});

test('fails closed when contribution proof is missing', () => {
  assert.throws(
    () => requireVerifiedContributionEvidence({ ...verified, contributionVerified: false }),
    /LP_CONTRIBUTION_NOT_PROVEN/,
  );
});

test('fails closed on malformed identity or non-positive contribution', () => {
  assert.throws(() => requireVerifiedContributionEvidence({ ...verified, positionId: '' }), /INVALID_CONTRIBUTION_EVIDENCE/);
  assert.throws(() => requireVerifiedContributionEvidence({ ...verified, contributedKvroBaseUnits: 0n }), /INVALID_CONTRIBUTION_AMOUNT/);
});

test('does not expose transaction execution capabilities', () => {
  const result = requireVerifiedContributionEvidence(verified);
  assert.equal('sign' in result, false);
  assert.equal('send' in result, false);
  assert.equal('buildTransaction' in result, false);
});
