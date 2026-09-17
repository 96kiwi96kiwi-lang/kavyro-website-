import test from 'node:test';
import assert from 'node:assert/strict';
import { exportLedgerSnapshot } from './ledger-export.js';

const makeLedger = (snapshot) => ({ snapshot: () => snapshot });

test('exports a deterministic sorted audit-only snapshot', () => {
  const ledger = makeLedger([
    { key: 'wallet-b:position-2:period-1', wallet: 'wallet-b', positionId: 'position-2', observationPeriod: 'period-1', poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION', status: 'OBSERVED' },
    { key: 'wallet-a:position-1:period-1', wallet: 'wallet-a', positionId: 'position-1', observationPeriod: 'period-1', poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION', status: 'OBSERVED' },
  ]);

  const exported = exportLedgerSnapshot(ledger);

  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.payoutAuthorized, false);
  assert.equal(exported.entryCount, 2);
  assert.deepEqual(exported.entries.map((entry) => entry.key), [
    'wallet-a:position-1:period-1',
    'wallet-b:position-2:period-1',
  ]);
  assert.ok(Object.isFrozen(exported));
  assert.ok(Object.isFrozen(exported.entries));
  assert.ok(exported.entries.every(Object.isFrozen));
});

test('does not expose transaction or signing authorization fields', () => {
  const exported = exportLedgerSnapshot(makeLedger([
    { key: 'wallet:position:period', wallet: 'wallet', positionId: 'position', observationPeriod: 'period', poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION', status: 'OBSERVED', privateKey: 'must-not-export', signedTransaction: 'must-not-export', payoutAuthorized: true },
  ]));

  const entry = exported.entries[0];
  assert.equal(exported.payoutAuthorized, false);
  assert.equal('privateKey' in entry, false);
  assert.equal('signedTransaction' in entry, false);
  assert.equal('payoutAuthorized' in entry, false);
});

test('rejects invalid ledger interfaces and snapshots', () => {
  assert.throws(() => exportLedgerSnapshot(null), /INVALID_LEDGER/);
  assert.throws(() => exportLedgerSnapshot({}), /INVALID_LEDGER/);
  assert.throws(() => exportLedgerSnapshot(makeLedger(null)), /INVALID_LEDGER_SNAPSHOT/);
});

test('rejects entries without a non-empty deterministic key', () => {
  assert.throws(() => exportLedgerSnapshot(makeLedger([null])), /INVALID_LEDGER_ENTRY/);
  assert.throws(() => exportLedgerSnapshot(makeLedger([{}])), /INVALID_LEDGER_ENTRY/);
  assert.throws(() => exportLedgerSnapshot(makeLedger([{ key: '   ' }])), /INVALID_LEDGER_ENTRY/);
});
