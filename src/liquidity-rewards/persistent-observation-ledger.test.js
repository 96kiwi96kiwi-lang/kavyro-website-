import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistentObservationLedger } from './persistent-observation-ledger.js';

const observation = {
  wallet: 'wallet-a',
  positionId: 'position-a',
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
  observationPeriod: 7,
  contextSlot: 123456789,
  observedAtSeconds: 25200,
};

/** @param {unknown[]} [initial] */
function memoryStorage(initial = []) {
  /** @type {readonly unknown[]} */
  let persisted = initial;
  return {
    load: () => persisted,
    /** @param {readonly unknown[]} entries */
    save: (entries) => { persisted = entries; },
  };
}

test('persists trusted observation time and recovers it after restart', () => {
  const storage = memoryStorage();
  const first = createPersistentObservationLedger(storage);
  assert.equal(first.record(observation).recorded, true);
  assert.equal(first.payoutAuthorized, false);

  const restarted = createPersistentObservationLedger(storage);
  assert.equal(restarted.snapshot().length, 1);
  assert.equal(restarted.snapshot()[0].key, 'wallet-a:position-a:7');
  assert.equal(restarted.snapshot()[0].contextSlot, 123456789);
  assert.equal(restarted.snapshot()[0].observedAtSeconds, 25200);
  assert.equal(restarted.payoutAuthorized, false);
});

test('rejects entries that drop or forge trusted observation time', () => {
  assert.throws(() => createPersistentObservationLedger(memoryStorage([{ ...observation, contextSlot: undefined }])), /INVALID_LEDGER_TRUSTED_TIME/);
  assert.throws(() => createPersistentObservationLedger(memoryStorage([{ ...observation, observedAtSeconds: undefined }])), /INVALID_LEDGER_TRUSTED_TIME/);
  assert.throws(() => createPersistentObservationLedger(memoryStorage([{ ...observation, observedAtSeconds: 0 }])), /LEDGER_OBSERVATION_PERIOD_MISMATCH/);
});

test('rejects replay after restart without rewriting persistence', () => {
  let saves = 0;
  /** @type {readonly unknown[]} */
  let persisted = [];
  const storage = {
    load: () => persisted,
    /** @param {readonly unknown[]} entries */
    save: (entries) => { saves += 1; persisted = entries; },
  };
  createPersistentObservationLedger(storage).record(observation);
  const restarted = createPersistentObservationLedger(storage);
  const replay = restarted.record(observation);
  assert.equal(replay.recorded, false);
  assert.equal(replay.reason, 'DUPLICATE_LEDGER_KEY');
  assert.equal(replay.payoutAuthorized, false);
  assert.equal(saves, 1);
});

test('fails closed on corrupt persisted snapshots', () => {
  assert.throws(() => createPersistentObservationLedger({ load: () => null, save: () => {} }), /INVALID_PERSISTED_LEDGER/);
  assert.throws(() => createPersistentObservationLedger(memoryStorage([observation, observation])), /DUPLICATE_LEDGER_KEY/);
  assert.throws(() => createPersistentObservationLedger(memoryStorage([{ ...observation, key: 'forged' }])), /LEDGER_KEY_MISMATCH/);
});

test('does not expose signing, sending, or payout authorization', () => {
  const ledger = createPersistentObservationLedger(memoryStorage());
  assert.equal(ledger.payoutAuthorized, false);
  assert.equal('sign' in ledger, false);
  assert.equal('send' in ledger, false);
  assert.equal('buildTransaction' in ledger, false);
});
