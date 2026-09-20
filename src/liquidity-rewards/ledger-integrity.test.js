import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLedgerIntegrity } from './ledger-integrity.js';

/** @param {unknown} entries */
function ledgerWith(entries) {
  return { snapshot: () => entries };
}

function entry(overrides = {}) {
  return {
    key: 'wallet-1:position-1:0',
    wallet: 'wallet-1',
    positionId: 'position-1',
    poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
    observationPeriod: 0,
    status: 'RECORDED',
    ...overrides,
  };
}

test('accepts an empty ledger without authorizing payout', () => {
  assert.deepEqual(verifyLedgerIntegrity(ledgerWith([])), {
    valid: true,
    reason: 'LEDGER_INTEGRITY_OK',
    checkedEntries: 0,
    payoutAuthorized: false,
  });
});

test('accepts valid unique recorded entries', () => {
  const result = verifyLedgerIntegrity(ledgerWith([
    entry(),
    entry({ key: 'wallet-1:position-1:1', observationPeriod: 1 }),
  ]));
  assert.equal(result.valid, true);
  assert.equal(result.checkedEntries, 2);
  assert.equal(result.payoutAuthorized, false);
});

for (const [label, overrides, reason] of [
  ['missing wallet', { wallet: '' }, 'INVALID_LEDGER_ENTRY'],
  ['missing position', { positionId: '' }, 'INVALID_LEDGER_ENTRY'],
  ['missing pool', { poolId: '' }, 'INVALID_LEDGER_ENTRY'],
  ['negative period', { observationPeriod: -1 }, 'INVALID_LEDGER_ENTRY'],
  ['fractional period', { observationPeriod: 0.5 }, 'INVALID_LEDGER_ENTRY'],
  ['invalid status', { status: 'PAID' }, 'INVALID_LEDGER_STATUS'],
  ['mismatched key', { key: 'tampered-key' }, 'LEDGER_KEY_MISMATCH'],
]) {
  test(`fails closed for ${label}`, () => {
    assert.deepEqual(verifyLedgerIntegrity(ledgerWith([entry(overrides)])), {
      valid: false,
      reason,
      payoutAuthorized: false,
    });
  });
}

test('detects duplicate ledger identity keys', () => {
  const duplicate = entry({ poolId: 'ANOTHER_TEST_ONLY_POOL_ID_NOT_PRODUCTION' });
  assert.deepEqual(verifyLedgerIntegrity(ledgerWith([entry(), duplicate])), {
    valid: false,
    reason: 'DUPLICATE_LEDGER_KEY',
    payoutAuthorized: false,
  });
});

test('rejects invalid ledger interfaces', () => {
  assert.throws(() => verifyLedgerIntegrity(null), /INVALID_LEDGER/);
  assert.throws(() => verifyLedgerIntegrity({ snapshot: () => ({}) }), /INVALID_LEDGER_SNAPSHOT/);
});

test('never trusts injected payout or signing fields', () => {
  const result = verifyLedgerIntegrity(ledgerWith([
    entry({ payoutAuthorized: true, privateKey: 'do-not-trust', signedTransaction: 'do-not-trust' }),
  ]));
  assert.equal(result.valid, true);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(Object.hasOwn(result, 'privateKey'), false);
  assert.equal(Object.hasOwn(result, 'signedTransaction'), false);
});
