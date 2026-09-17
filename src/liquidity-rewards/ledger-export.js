// KAVYRO Liquidity Rewards — deterministic, non-custodial ledger export.
// Produces audit data only. It cannot authorize or execute payouts.

function compareEntries(a, b) {
  return a.key.localeCompare(b.key);
}

export function exportLedgerSnapshot(ledger) {
  if (!ledger || typeof ledger.snapshot !== 'function') {
    throw new Error('INVALID_LEDGER');
  }

  const snapshot = ledger.snapshot();
  if (!Array.isArray(snapshot)) {
    throw new Error('INVALID_LEDGER_SNAPSHOT');
  }

  const entries = snapshot.map((entry) => {
    if (!entry || typeof entry.key !== 'string' || entry.key.trim() === '') {
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
