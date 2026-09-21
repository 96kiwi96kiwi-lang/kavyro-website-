import test from 'node:test';
import assert from 'node:assert/strict';
import { appendReplayRecord, createReplayRecord } from './replay-ledger.js';

const entitlement = Object.freeze({
  entitlementEligible: true,
  wallet: 'TEST_WALLET',
  positionId: 'TEST_POSITION',
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
  entitledKvroBaseUnits: 100n,
  ownershipEvidenceId: 'OWNERSHIP_EVIDENCE',
  contributionEvidenceId: 'CONTRIBUTION_EVIDENCE',
  firstObservationPeriod: 10,
  lastObservationPeriod: 12,
  consecutivePeriods: 3,
  entitlementAuthorized: false,
  payoutAuthorized: false,
});

test('records an unauthorized entitlement without transaction capability', () => {
  const record = createReplayRecord(entitlement);
  assert.equal(record.payoutAuthorized, false);
  assert.equal('sign' in record, false);
  assert.equal('send' in record, false);
  assert.equal('buildTransaction' in record, false);
  assert.equal('authorizePayout' in record, false);
  const ledger = appendReplayRecord([], record);
  assert.equal(ledger.length, 1);
  assert.equal(Object.isFrozen(ledger), true);
});

test('rejects exact entitlement replay', () => {
  const record = createReplayRecord(entitlement);
  const ledger = appendReplayRecord([], record);
  assert.throws(() => appendReplayRecord(ledger, record), /ENTITLEMENT_REPLAY_DETECTED/);
});

test('rejects reused evidence even when entitlement identity changes', () => {
  const first = createReplayRecord(entitlement);
  const second = createReplayRecord({ ...entitlement, wallet: 'OTHER_TEST_WALLET' });
  const ledger = appendReplayRecord([], first);
  assert.throws(() => appendReplayRecord(ledger, second), /EVIDENCE_REUSE_DETECTED/);
});

test('rejects authorized or malformed input fail closed', () => {
  assert.throws(() => createReplayRecord({ ...entitlement, payoutAuthorized: true }), /VERIFIED_UNAUTHORIZED_ENTITLEMENT_REQUIRED/);
  assert.throws(() => createReplayRecord({ ...entitlement, entitlementAuthorized: true }), /VERIFIED_UNAUTHORIZED_ENTITLEMENT_REQUIRED/);
  assert.throws(() => createReplayRecord({ ...entitlement, contributionEvidenceId: '' }), /ENTITLEMENT_IDENTITY_REQUIRED/);
  assert.throws(() => createReplayRecord({ ...entitlement, entitledKvroBaseUnits: 0n }), /INVALID_ENTITLEMENT_AMOUNT/);
  assert.throws(() => appendReplayRecord([/** @type {any} */ (null)], createReplayRecord(entitlement)), /MALFORMED_REPLAY_LEDGER/);
});
