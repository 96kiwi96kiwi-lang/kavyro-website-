import test from 'node:test';
import assert from 'node:assert/strict';
import { requireVerifiedEntitlement } from './entitlement-boundary.js';

const contribution = Object.freeze({
  verified: true,
  poolVerified: true,
  ownershipProven: true,
  contributionProven: true,
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
  wallet: 'TEST_WALLET',
  positionId: 'TEST_POSITION',
  contributedKvroBaseUnits: 120n,
  ownershipEvidenceId: 'OWNERSHIP_EVIDENCE',
  contributionEvidenceId: 'CONTRIBUTION_EVIDENCE',
  entitlementAuthorized: false,
  payoutAuthorized: false,
});

const eligibility = Object.freeze({
  eligible: true,
  wallet: 'TEST_WALLET',
  positionId: 'TEST_POSITION',
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
  firstObservationPeriod: 10,
  lastObservationPeriod: 12,
  consecutivePeriods: 3,
  minimumContributionKvroBaseUnits: 100n,
  reason: 'SUSTAINED_HOLDING_VERIFIED',
  payoutAuthorized: false,
});

test('creates read-only entitlement evidence without authorizing payout', () => {
  const result = requireVerifiedEntitlement(contribution, eligibility);
  assert.equal(result.entitlementEligible, true);
  assert.equal(result.entitledKvroBaseUnits, 100n);
  assert.equal(result.entitlementAuthorized, false);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(Object.isFrozen(result), true);
});

test('fails closed without independently proven ownership or contribution', () => {
  assert.throws(() => requireVerifiedEntitlement({ ...contribution, ownershipProven: false }, eligibility), /VERIFIED_CONTRIBUTION_REQUIRED/);
  assert.throws(() => requireVerifiedEntitlement({ ...contribution, contributionProven: false }, eligibility), /VERIFIED_CONTRIBUTION_REQUIRED/);
});

test('fails closed when sustained holding is not eligible', () => {
  assert.throws(
    () => requireVerifiedEntitlement(contribution, { ...eligibility, eligible: false, reason: 'INSUFFICIENT_HOLDING_PERIOD' }),
    /SUSTAINED_HOLDING_REQUIRED/,
  );
});

test('fails closed on identity or contribution mismatch', () => {
  assert.throws(() => requireVerifiedEntitlement(contribution, { ...eligibility, wallet: 'OTHER' }), /ENTITLEMENT_IDENTITY_MISMATCH/);
  assert.throws(
    () => requireVerifiedEntitlement(contribution, { ...eligibility, minimumContributionKvroBaseUnits: 121n }),
    /CONTRIBUTION_EVIDENCE_MISMATCH/,
  );
});

test('exposes no transaction or payout execution capability', () => {
  const result = requireVerifiedEntitlement(contribution, eligibility);
  assert.equal('sign' in result, false);
  assert.equal('send' in result, false);
  assert.equal('buildTransaction' in result, false);
  assert.equal('authorizePayout' in result, false);
});
