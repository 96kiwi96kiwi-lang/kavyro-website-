// KAVYRO Liquidity Rewards — read-only ledger integrity verification.
// This module never discovers pools, authorizes payouts, signs, or sends transactions.

/**
 * @typedef {{
 *   wallet?: unknown,
 *   positionId?: unknown,
 *   poolId?: unknown,
 *   observationPeriod?: unknown,
 *   status?: unknown,
 *   key?: unknown
 * }} LedgerEntry
 *
 * @typedef {{ snapshot: () => unknown }} Ledger
 */

/**
 * Validate the ledger boundary before inspecting any entry. Unknown snapshot
 * values fail closed instead of being trusted as ledger records.
 * @param {unknown} ledger
 * @returns {LedgerEntry[]}
 */
function requireSnapshot(ledger) {
  if (!ledger || typeof ledger !== 'object' || !('snapshot' in ledger) || typeof ledger.snapshot !== 'function') {
    throw new Error('INVALID_LEDGER');
  }
  const entries = ledger.snapshot();
  if (!Array.isArray(entries)) {
    throw new Error('INVALID_LEDGER_SNAPSHOT');
  }
  return entries;
}

/** @param {unknown} value @returns {string} */
function normalizedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Read-only integrity check. A valid result is evidence about ledger shape
 * only; it never authorizes payout.
 * @param {unknown} ledger
 * @returns {Readonly<{valid: boolean, reason: string, payoutAuthorized: false, checkedEntries?: number}>}
 */
export function verifyLedgerIntegrity(ledger) {
  const entries = requireSnapshot(ledger);
  const keys = new Set();

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      return Object.freeze({ valid: false, reason: 'INVALID_LEDGER_ENTRY', payoutAuthorized: false });
    }

    const wallet = normalizedString(entry.wallet);
    const positionId = normalizedString(entry.positionId);
    const poolId = normalizedString(entry.poolId);
    const period = entry.observationPeriod;

    if (!wallet || !positionId || !poolId || !Number.isInteger(period) || typeof period !== 'number' || period < 0) {
      return Object.freeze({ valid: false, reason: 'INVALID_LEDGER_ENTRY', payoutAuthorized: false });
    }
    if (entry.status !== 'RECORDED') {
      return Object.freeze({ valid: false, reason: 'INVALID_LEDGER_STATUS', payoutAuthorized: false });
    }

    const expectedKey = `${wallet}:${positionId}:${period}`;
    if (entry.key !== expectedKey) {
      return Object.freeze({ valid: false, reason: 'LEDGER_KEY_MISMATCH', payoutAuthorized: false });
    }
    if (keys.has(expectedKey)) {
      return Object.freeze({ valid: false, reason: 'DUPLICATE_LEDGER_KEY', payoutAuthorized: false });
    }
    keys.add(expectedKey);
  }

  return Object.freeze({
    valid: true,
    reason: 'LEDGER_INTEGRITY_OK',
    checkedEntries: entries.length,
    payoutAuthorized: false,
  });
}
