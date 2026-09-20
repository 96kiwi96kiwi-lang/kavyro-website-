import assert from 'node:assert/strict';
import test from 'node:test';

import { createRewardLedger, makeLedgerKey } from './reward-ledger.js';

const VALID = Object.freeze({
  wallet: 'wallet-A',
  positionId: 'position-1',
  observationPeriod: 1,
  poolId: 'verified-pool-placeholder',
  poolVerified: true,
  eligible: true,
});

test('creates deterministic identity key', () => {
  assert.equal(
    makeLedgerKey(VALID),
    'wallet-A:position-1:1',
  );
});

test('records one verified eligible observation', () => {
  const ledger = createRewardLedger();
  const entry = ledger.recordObservation(VALID);

  assert.equal(entry.status, 'RECORDED');
  assert.equal(ledger.size(), 1);
  assert.equal(ledger.hasObservation(VALID), true);
});

test('rejects duplicate/replay for same wallet, position and period', () => {
  const ledger = createRewardLedger();
  ledger.recordObservation(VALID);

  assert.throws(
    () => ledger.recordObservation({ ...VALID }),
    /DUPLICATE_OBSERVATION/,
  );
  assert.equal(ledger.size(), 1);
});

test('allows same position in a different observation period', () => {
  const ledger = createRewardLedger();
  ledger.recordObservation(VALID);
  ledger.recordObservation({ ...VALID, observationPeriod: 2 });
  assert.equal(ledger.size(), 2);
});

test('rejects observations that are not explicitly eligible', () => {
  const ledger = createRewardLedger();
  assert.throws(
    () => ledger.recordObservation({ ...VALID, eligible: false }),
    /POSITION_NOT_ELIGIBLE/,
  );
  assert.equal(ledger.size(), 0);
});

test('rejects observations without verified pool state', () => {
  const ledger = createRewardLedger();
  assert.throws(
    () => ledger.recordObservation({ ...VALID, poolVerified: false }),
    /POOL_NOT_VERIFIED/,
  );
  assert.equal(ledger.size(), 0);
});

test('rejects missing pool id even if flags claim verification', () => {
  const ledger = createRewardLedger();
  assert.throws(
    () => ledger.recordObservation({ ...VALID, poolId: '' }),
    /INVALID_POOL_ID/,
  );
  assert.equal(ledger.size(), 0);
});

test('rejects invalid identity and observation periods', () => {
  assert.throws(() => makeLedgerKey({ ...VALID, wallet: '' }), /INVALID_WALLET/);
  assert.throws(() => makeLedgerKey({ ...VALID, positionId: '' }), /INVALID_POSITION_ID/);
  assert.throws(() => makeLedgerKey({ ...VALID, observationPeriod: -1 }), /INVALID_OBSERVATION_PERIOD/);
  assert.throws(() => makeLedgerKey({ ...VALID, observationPeriod: 1.5 }), /INVALID_OBSERVATION_PERIOD/);
});

test('snapshot cannot mutate stored entry objects', () => {
  const ledger = createRewardLedger();
  ledger.recordObservation(VALID);
  const snapshot = ledger.snapshot();

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot[0]), true);
  assert.throws(() => Array.prototype.push.call(snapshot, {}), TypeError);
});
