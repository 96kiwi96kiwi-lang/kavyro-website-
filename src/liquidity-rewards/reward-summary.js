// KAVYRO Liquidity Rewards — read-only deterministic ledger summary.
// This module never authorizes payouts, signs transactions, or discovers pools.

function requireLedger(ledger) {
  if (!ledger || typeof ledger.snapshot !== 'function') {
    throw new Error('INVALID_LEDGER');
  }
  return ledger;
}

export function summarizeRewardLedger(ledger) {
  const entries = requireLedger(ledger).snapshot();
  if (!Array.isArray(entries)) {
    throw new Error('INVALID_LEDGER_SNAPSHOT');
  }

  const wallets = new Set();
  const positions = new Set();
  const periods = new Set();

  for (const entry of entries) {
    if (!entry || typeof entry.wallet !== 'string' || entry.wallet.trim() === '') {
      throw new Error('INVALID_LEDGER_ENTRY');
    }
    if (typeof entry.positionId !== 'string' || entry.positionId.trim() === '') {
      throw new Error('INVALID_LEDGER_ENTRY');
    }
    if (!Number.isInteger(entry.observationPeriod) || entry.observationPeriod < 0) {
      throw new Error('INVALID_LEDGER_ENTRY');
    }
    if (entry.status !== 'RECORDED') {
      throw new Error('INVALID_LEDGER_ENTRY');
    }

    wallets.add(entry.wallet.trim());
    positions.add(`${entry.wallet.trim()}:${entry.positionId.trim()}`);
    periods.add(entry.observationPeriod);
  }

  return Object.freeze({
    recordedObservations: entries.length,
    uniqueWallets: wallets.size,
    uniquePositions: positions.size,
    observedPeriods: periods.size,
    payoutAuthorized: false,
  });
}
