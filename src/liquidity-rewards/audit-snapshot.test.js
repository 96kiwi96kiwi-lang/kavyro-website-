import test from 'node:test';
import assert from 'node:assert/strict';

import { createVerifiedAuditSnapshot } from './audit-snapshot.js';

function makeLedger(entries = []) {
  return { entries };
}

test('fails closed for malformed ledger input', () => {
  for (const input of [null, undefined, {}, { entries: null }]) {
    const snapshot = createVerifiedAuditSnapshot(input);
    assert.equal(snapshot.valid, false);
    assert.equal(snapshot.payoutAuthorized, false);
  }
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

test('returned snapshot is immutable at the top level', () => {
  const snapshot = createVerifiedAuditSnapshot(makeLedger([]));
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(snapshot.payoutAuthorized, false);
});
