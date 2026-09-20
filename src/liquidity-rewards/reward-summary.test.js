import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeRewardLedger } from './reward-summary.js';

/** @param {unknown} entries */
function ledgerWith(entries) {
  return { snapshot: () => entries };
}

test('summarizes recorded observations without authorizing payouts', () => {
  const summary = summarizeRewardLedger(ledgerWith([
    { wallet: 'wallet-a', positionId: 'position-1', observationPeriod: 10, status: 'RECORDED' },
    { wallet: 'wallet-a', positionId: 'position-1', observationPeriod: 11, status: 'RECORDED' },
    { wallet: 'wallet-b', positionId: 'position-2', observationPeriod: 11, status: 'RECORDED' },
  ]));

  assert.deepEqual(summary, {
    recordedObservations: 3,
    uniqueWallets: 2,
    uniquePositions: 2,
    observedPeriods: 2,
    payoutAuthorized: false,
  });
  assert.equal(Object.isFrozen(summary), true);
});

test('treats the same position id in different wallets as distinct positions', () => {
  const summary = summarizeRewardLedger(ledgerWith([
    { wallet: 'wallet-a', positionId: 'shared-position', observationPeriod: 1, status: 'RECORDED' },
    { wallet: 'wallet-b', positionId: 'shared-position', observationPeriod: 1, status: 'RECORDED' },
  ]));

  assert.equal(summary.uniqueWallets, 2);
  assert.equal(summary.uniquePositions, 2);
  assert.equal(summary.payoutAuthorized, false);
});

test('returns a safe empty summary for an empty ledger', () => {
  assert.deepEqual(summarizeRewardLedger(ledgerWith([])), {
    recordedObservations: 0,
    uniqueWallets: 0,
    uniquePositions: 0,
    observedPeriods: 0,
    payoutAuthorized: false,
  });
});

test('fails closed for invalid ledger or snapshot', () => {
  assert.throws(() => summarizeRewardLedger(null), /INVALID_LEDGER/);
  assert.throws(() => summarizeRewardLedger({}), /INVALID_LEDGER/);
  assert.throws(() => summarizeRewardLedger({ snapshot: () => null }), /INVALID_LEDGER_SNAPSHOT/);
});

test('rejects malformed or non-recorded entries', () => {
  const valid = { wallet: 'wallet-a', positionId: 'position-1', observationPeriod: 0, status: 'RECORDED' };
  const invalidEntries = [
    null,
    { ...valid, wallet: '' },
    { ...valid, positionId: ' ' },
    { ...valid, observationPeriod: -1 },
    { ...valid, observationPeriod: 1.5 },
    { ...valid, status: 'PENDING' },
  ];

  for (const entry of invalidEntries) {
    assert.throws(() => summarizeRewardLedger(ledgerWith([entry])), /INVALID_LEDGER_ENTRY/);
  }
});

test('ignores transaction-like extra fields and never propagates payout authorization', () => {
  const summary = summarizeRewardLedger(ledgerWith([{
    wallet: 'wallet-a',
    positionId: 'position-1',
    observationPeriod: 3,
    status: 'RECORDED',
    payoutAuthorized: true,
    privateKey: 'must-not-propagate',
    signedTransaction: 'must-not-propagate',
  }]));

  assert.equal(summary.payoutAuthorized, false);
  assert.equal('privateKey' in summary, false);
  assert.equal('signedTransaction' in summary, false);
});
