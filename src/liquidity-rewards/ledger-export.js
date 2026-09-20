import { recordOf } from './input-contracts.js';

// KAVYRO Liquidity Rewards — deterministic, non-custodial ledger export.
// Produces audit data only. It cannot authorize or execute payouts.

/**
 * @typedef {object} LedgerEntry
 * @property {string} key
 * @property {string} wallet
 * @property {string} positionId
 * @property {number} observationPeriod
 * @property {string} poolId
 * @property {string} status
 */

/**
 * @typedef {object} ReadOnlyLedger
 * @property {() => unknown} snapshot
 */

/** @param {LedgerEntry} a @param {LedgerEntry} b @returns {number} */
function compareEntries(a, b) {
  return a.key.localeCompare(b.key);
}

/**
 * Export a deterministic audit-only snapshot. This boundary cannot authorize
 * or execute a payout.
 * @param {unknown} input
 */
export function exportLedgerSnapshot(input) {
  const ledger = recordOf(input);
  if (typeof ledger.snapshot !== 'function') {
    throw new Error('INVALID_LEDGER');
  }

  const snapshot = ledger.snapshot();
  if (!Array.isArray(snapshot)) {
    throw new Error('INVALID_LEDGER_SNAPSHOT');
  }

  const entries = snapshot.map((entry) => {
    if (
      !entry || typeof entry !== 'object' ||
      !('key' in entry) || typeof entry.key !== 'string' || entry.key.trim() === '' ||
      !('wallet' in entry) || typeof entry.wallet !== 'string' ||
      !('positionId' in entry) || typeof entry.positionId !== 'string' ||
      !('observationPeriod' in entry) || typeof entry.observationPeriod !== 'number' || !Number.isInteger(entry.observationPeriod) ||
      !('poolId' in entry) || typeof entry.poolId !== 'string' ||
      !('status' in entry) || typeof entry.status !== 'string'
    ) {
      throw new Error('INVALID_LEDGER_ENTRY');
    }

    return Object.freeze({
      key: entry.key,
      wallet: entry.wallet,
      positionId: entry.positionId,
      observationPeriod: entry.observationPeriod,
      poolId: entry.poolId,
      status: entry.status,
    });
  }).sort(compareEntries);

  return Object.freeze({
    schemaVersion: 1,
    payoutAuthorized: false,
    entryCount: entries.length,
    entries: Object.freeze(entries),
  });
}
