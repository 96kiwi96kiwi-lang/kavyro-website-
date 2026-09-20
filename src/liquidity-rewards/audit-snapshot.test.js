import test from 'node:test';
import assert from 'node:assert/strict';

import { createVerifiedAuditSnapshot } from './audit-snapshot.js';

/** @param {unknown} entries */
function makeLedger(entries = []) {
  return {
    snapshot() {
      return entries;
    },
  };
}

test('fails closed for malformed ledger input', () => {
  for (const input of [null, undefined, {}, { entries: null }]) {
    const snapshot = createVerifiedAuditSnapshot(input);
    assert.equal(snapshot.valid, false);
    assert.equal(snapshot.payoutAuthorized, false);
  }
});

test('creates a verified immutable audit snapshot for a valid ledger', () => {
  const ledger = makeLedger([{
    key: 'wallet-1:position-1:7',
    wallet: 'wallet-1',
    positionId: 'position-1',
    poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
    observationPeriod: 7,
    status: 'RECORDED',
  }]);

  const snapshot = createVerifiedAuditSnapshot(ledger);
  assert.equal(snapshot.valid, true);
  assert.equal(snapshot.reason, 'VERIFIED_AUDIT_SNAPSHOT');
  assert.equal(snapshot.entryCount, 1);
  assert.equal(snapshot.payoutAuthorized, false);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.entries), true);
});

test('invalid ledger can never authorize payout', () => {
  const ledger = makeLedger([{
    wallet: '',
    positionId: '',
    poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
    observationPeriod: '',
    status: 'ELIGIBLE',
    payoutAuthorized: true,
    privateKey: 'MUST_NOT_PROPAGATE',
    signedTransaction: 'MUST_NOT_PROPAGATE',
  }]);

  const snapshot = createVerifiedAuditSnapshot(ledger);
  assert.equal(snapshot.valid, false);
  assert.equal(snapshot.payoutAuthorized, false);
  assert.equal('privateKey' in snapshot, false);
  assert.equal('signedTransaction' in snapshot, false);
});

test('fails closed if ledger changes between integrity check and export', () => {
  let reads = 0;
  const validEntry = {
    key: 'wallet-1:position-1:7',
    wallet: 'wallet-1',
    positionId: 'position-1',
    poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
    observationPeriod: 7,
    status: 'RECORDED',
  };
  const ledger = {
    snapshot() {
      reads += 1;
      return reads === 1 ? [validEntry] : null;
    },
  };

  const snapshot = createVerifiedAuditSnapshot(ledger);
  assert.equal(snapshot.valid, false);
  assert.equal(snapshot.reason, 'AUDIT_EXPORT_FAILED');
  assert.equal(snapshot.payoutAuthorized, false);
});

test('returned snapshot is immutable at the top level', () => {
  const snapshot = createVerifiedAuditSnapshot(makeLedger([]));
  assert.equal(snapshot.valid, true);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(snapshot.payoutAuthorized, false);
});
