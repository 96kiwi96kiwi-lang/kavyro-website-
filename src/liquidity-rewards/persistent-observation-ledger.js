// KAVYRO Liquidity Rewards — persistence boundary for read-only observations.
// No transaction, signing, secret, or payout capability is present here.

/** @param {unknown} value @returns {string} */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} entry */
function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') throw new Error('INVALID_LEDGER_ENTRY');
  const wallet = text(entry.wallet);
  const positionId = text(entry.positionId);
  const poolId = text(entry.poolId);
  const observationPeriod = entry.observationPeriod;
  if (!wallet || !positionId || !poolId || typeof observationPeriod !== 'number' || !Number.isInteger(observationPeriod) || observationPeriod < 0) {
    throw new Error('INVALID_LEDGER_ENTRY');
  }
  const key = `${wallet}:${positionId}:${observationPeriod}`;
  if ('key' in entry && entry.key !== key) throw new Error('LEDGER_KEY_MISMATCH');
  if ('status' in entry && entry.status !== 'RECORDED') throw new Error('INVALID_LEDGER_STATUS');
  return Object.freeze({ key, wallet, positionId, poolId, observationPeriod, status: 'RECORDED' });
}

/**
 * Adapter contract is deliberately tiny: persistence only, never network transactions.
 * @param {unknown} storage
 */
export function createPersistentObservationLedger(storage) {
  if (!storage || typeof storage !== 'object' || !('load' in storage) || !('save' in storage) || typeof storage.load !== 'function' || typeof storage.save !== 'function') {
    throw new Error('INVALID_LEDGER_STORAGE');
  }

  const loaded = storage.load();
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
      storage.save(next);
      entries.push(entry);
      keys.add(entry.key);
      return Object.freeze({ recorded: true, reason: 'RECORDED', key: entry.key, payoutAuthorized: false });
    },
  });
}
