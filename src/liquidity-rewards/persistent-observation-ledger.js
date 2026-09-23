// KAVYRO Liquidity Rewards — persistence boundary for read-only observations.
// No transaction, signing, secret, or payout capability is present here.

import { observationPeriodForTimestamp } from './observation-period.js';

/** @param {unknown} value @returns {string} */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} value @returns {number | null} */
function safeNonNegativeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** @param {unknown} entry */
function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') throw new Error('INVALID_LEDGER_ENTRY');
  /** @type {Record<string, unknown>} */
  const record = /** @type {Record<string, unknown>} */ (entry);
  const wallet = text(record.wallet);
  const positionId = text(record.positionId);
  const poolId = text(record.poolId);
  const observationPeriod = safeNonNegativeInteger(record.observationPeriod);
  const contextSlot = safeNonNegativeInteger(record.contextSlot);
  const observedAtSeconds = safeNonNegativeInteger(record.observedAtSeconds);
  if (!wallet || !positionId || !poolId || observationPeriod === null) {
    throw new Error('INVALID_LEDGER_ENTRY');
  }
  if (contextSlot === null || observedAtSeconds === null) {
    throw new Error('INVALID_LEDGER_TRUSTED_TIME');
  }
  if (observationPeriodForTimestamp(observedAtSeconds) !== observationPeriod) {
    throw new Error('LEDGER_OBSERVATION_PERIOD_MISMATCH');
  }
  const key = `${wallet}:${positionId}:${observationPeriod}`;
  if ('key' in record && record.key !== key) throw new Error('LEDGER_KEY_MISMATCH');
  if ('status' in record && record.status !== 'RECORDED') throw new Error('INVALID_LEDGER_STATUS');
  return Object.freeze({ key, wallet, positionId, poolId, observationPeriod, contextSlot, observedAtSeconds, status: 'RECORDED' });
}

/**
 * Adapter contract is deliberately tiny: persistence only, never network transactions.
 * Trusted RPC time is persisted with each observation so restart/reconciliation
 * cannot silently downgrade timed evidence to caller-supplied period indexes.
 * @param {unknown} storage
 */
export function createPersistentObservationLedger(storage) {
  if (!storage || typeof storage !== 'object' || !('load' in storage) || !('save' in storage) || typeof storage.load !== 'function' || typeof storage.save !== 'function') {
    throw new Error('INVALID_LEDGER_STORAGE');
  }
  const adapter = /** @type {{ load: () => unknown, save: (entries: readonly unknown[]) => void }} */ (storage);

  const loaded = adapter.load();
  if (!Array.isArray(loaded)) throw new Error('INVALID_PERSISTED_LEDGER');
  const entries = loaded.map(normalizeEntry);
  const keys = new Set();
  for (const entry of entries) {
    if (keys.has(entry.key)) throw new Error('DUPLICATE_LEDGER_KEY');
    keys.add(entry.key);
  }

  return Object.freeze({
    payoutAuthorized: false,
    snapshot() {
      return Object.freeze(entries.slice());
    },
    /** @param {unknown} candidate */
    record(candidate) {
      const entry = normalizeEntry(candidate);
      if (keys.has(entry.key)) {
        return Object.freeze({ recorded: false, reason: 'DUPLICATE_LEDGER_KEY', key: entry.key, payoutAuthorized: false });
      }
      const next = Object.freeze([...entries, entry]);
      adapter.save(next);
      entries.push(entry);
      keys.add(entry.key);
      return Object.freeze({ recorded: true, reason: 'RECORDED', key: entry.key, payoutAuthorized: false });
    },
  });
}
