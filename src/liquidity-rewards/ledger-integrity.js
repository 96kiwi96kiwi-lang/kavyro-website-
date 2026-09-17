// KAVYRO Liquidity Rewards — read-only ledger integrity verification.
// This module never discovers pools, authorizes payouts, signs, or sends transactions.

function requireSnapshot(ledger) {
  if (!ledger || typeof ledger.snapshot !== 'function') {
    throw new Error('INVALID_LEDGER');
  }
  const entries = ledger.snapshot();
  if (!Array.isArray(entries)) {
    throw new Error('INVALID_LEDGER_SNAPSHOT');
  }
  return entries;
}

function normalizedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function verifyLedgerIntegrity(ledger) {
  const entries = requireSnapshot(ledger);
  const keys = new Set();

  for (const entry of entries) {
    const wallet = normalizedString(entry?.wallet);
    const positionId = normalizedString(entry?.positionId);
    const poolId = normalizedString(entry?.poolId);
    const period = entry?.observationPeriod;

    if (!wallet || !positionId || !poolId || !Number.isInteger(period) || period < 0) {
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
