import test from 'node:test';
import assert from 'node:assert/strict';
import { exportLedgerSnapshot } from './ledger-export.js';

const makeLedger = (snapshot) => ({ snapshot: () => snapshot });

function entry({ wallet, positionId, observationPeriod }) {
  return {
    key: `${wallet}:${positionId}:${observationPeriod}`,
    wallet,
    positionId,
    observationPeriod,
    poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
    status: 'RECORDED',
  };
}

test('exports a deterministic sorted audit-only snapshot', () => {
  const ledger = makeLedger([
    entry({ wallet: 'wallet-b', positionId: 'position-2', observationPeriod: 1 }),
    entry({ wallet: 'wallet-a', positionId: 'position-1', observationPeriod: 1 }),
  ]);

  const exported = exportLedgerSnapshot(ledger);

  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.payoutAuthorized, false);
  assert.equal(exported.entryCount, 2);
  assert.deepEqual(exported.entries.map((item) => item.key), [
    'wallet-a:position-1:1',
    'wallet-b:position-2:1',
  ]);
  assert.ok(Object.isFrozen(exported));
  assert.ok(Object.isFrozen(exported.entries));
  assert.ok(exported.entries.every(Object.isFrozen));
});

test('does not expose transaction or signing authorization fields', () => {
  const exported = exportLedgerSnapshot(makeLedger([{
    ...entry({ wallet: 'wallet', positionId: 'position', observationPeriod: 1 }),
    privateKey: 'must-not-export',
    signedTransaction: 'must-not-export',
    payoutAuthorized: true,
  }]));

  const exportedEntry = exported.entries[0];
  assert.equal(exported.payoutAuthorized, false);
  assert.equal('privateKey' in exportedEntry, false);
  assert.equal('signedTransaction' in exportedEntry, false);
  assert.equal('payoutAuthorized' in exportedEntry, false);
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
