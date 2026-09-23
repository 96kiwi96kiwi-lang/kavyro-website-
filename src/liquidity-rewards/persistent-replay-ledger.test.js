import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistentReplayLedger } from './persistent-replay-ledger.js';
import { createReplayRecord } from './replay-ledger.js';

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

test('rejects entitlement replay after process restart', () => {
  /** @type {unknown[]} */
  let persisted = [];
  const storage = {
    load: () => persisted,
    /** @param {readonly unknown[]} entries */
    save: (entries) => { persisted = entries.map((entry) => ({ .../** @type {Record<string, unknown>} */ (entry) })); },
  };
  const record = createReplayRecord(entitlement);
  const first = createPersistentReplayLedger(storage);
  first.record(record);
  const restarted = createPersistentReplayLedger(storage);
  assert.equal(restarted.snapshot().length, 1);
  assert.throws(() => restarted.record(record), /ENTITLEMENT_REPLAY_DETECTED/);
});

test('rejects reused evidence after restart even if entitlement identity changes', () => {
  /** @type {unknown[]} */
  let persisted = [];
  const storage = {
    load: () => persisted,
    /** @param {readonly unknown[]} entries */
    save: (entries) => { persisted = entries.map((entry) => ({ .../** @type {Record<string, unknown>} */ (entry) })); },
  };
  const first = createPersistentReplayLedger(storage);
  first.record(createReplayRecord(entitlement));
  const restarted = createPersistentReplayLedger(storage);
  const reusedEvidence = createReplayRecord({ ...entitlement, wallet: 'OTHER_TEST_WALLET' });
  assert.throws(() => restarted.record(reusedEvidence), /EVIDENCE_REUSE_DETECTED/);
});

test('fails closed on malformed persisted replay state', () => {
  assert.throws(() => createPersistentReplayLedger({
    load: () => [{ entitlementKey: '', evidenceKey: 'x', wallet: 'w', positionId: 'p', poolId: 'pool', payoutAuthorized: false }],
    save: () => {},
  }), /INVALID_REPLAY_LEDGER_ENTRY/);
  assert.throws(() => createPersistentReplayLedger({
    load: () => [{ entitlementKey: 'e', evidenceKey: 'x', wallet: 'w', positionId: 'p', poolId: 'pool', payoutAuthorized: true }],
    save: () => {},
  }), /INVALID_REPLAY_LEDGER_ENTRY/);
});
