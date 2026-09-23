// KAVYRO Liquidity Rewards — persistent replay protection boundary.
// Storage contains only immutable replay identities. This module cannot authorize or execute payout.

import { appendReplayRecord } from './replay-ledger.js';

/** @typedef {Readonly<{ entitlementKey: string, evidenceKey: string, wallet: string, positionId: string, poolId: string, payoutAuthorized: false }>} ReplayRecord */

/** @param {unknown} value @returns {ReplayRecord} */
function requireReplayRecord(value) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_REPLAY_LEDGER_ENTRY');
  const entry = /** @type {Record<string, unknown>} */ (value);
  for (const field of ['entitlementKey', 'evidenceKey', 'wallet', 'positionId', 'poolId']) {
    if (typeof entry[field] !== 'string' || entry[field].length === 0) throw new Error('INVALID_REPLAY_LEDGER_ENTRY');
  }
  if (entry.payoutAuthorized !== false) throw new Error('INVALID_REPLAY_LEDGER_ENTRY');
  return Object.freeze({
    entitlementKey: /** @type {string} */ (entry.entitlementKey),
    evidenceKey: /** @type {string} */ (entry.evidenceKey),
    wallet: /** @type {string} */ (entry.wallet),
    positionId: /** @type {string} */ (entry.positionId),
    poolId: /** @type {string} */ (entry.poolId),
    payoutAuthorized: false,
  });
}

/**
 * Persist replay identities so a process restart cannot erase consumed entitlement/evidence state.
 * Storage is injected; no network, transaction, signing, or payout capability exists here.
 * @param {Readonly<{ load: () => unknown, save: (entries: readonly ReplayRecord[]) => void }>} storage
 */
export function createPersistentReplayLedger(storage) {
  if (!storage || typeof storage.load !== 'function' || typeof storage.save !== 'function') {
    throw new Error('REPLAY_STORAGE_REQUIRED');
  }
  const loaded = storage.load();
  if (!Array.isArray(loaded)) throw new Error('INVALID_REPLAY_LEDGER');
  /** @type {readonly ReplayRecord[]} */
  let ledger = Object.freeze(loaded.map(requireReplayRecord));

  // Validate persisted state for duplicate entitlement/evidence identities before accepting it.
  /** @type {readonly ReplayRecord[]} */
  let validated = Object.freeze([]);
  try {
    for (const entry of ledger) validated = appendReplayRecord(validated, entry);
  } catch {
    throw new Error('INVALID_REPLAY_LEDGER_ENTRY');
  }
  ledger = validated;

  return Object.freeze({
    /** @param {ReplayRecord} record */
    record(record) {
      const next = appendReplayRecord(ledger, requireReplayRecord(record));
      storage.save(next);
      ledger = next;
      return Object.freeze({ recorded: true, payoutAuthorized: false });
    },
    snapshot() {
      return Object.freeze(ledger.map((entry) => Object.freeze({ ...entry })));
    },
  });
}
