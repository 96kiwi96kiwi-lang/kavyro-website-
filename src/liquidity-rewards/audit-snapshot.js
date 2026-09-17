// KAVYRO Liquidity Rewards — integrity-gated, read-only audit snapshot.
// This module never discovers pools, authorizes payouts, signs, or sends transactions.

import { verifyLedgerIntegrity } from './ledger-integrity.js';
import { exportLedgerSnapshot } from './ledger-export.js';

function failedSnapshot(reason = 'INVALID_LEDGER') {
  return Object.freeze({
    valid: false,
    reason,
    payoutAuthorized: false,
  });
}

export function createVerifiedAuditSnapshot(ledger) {
  let integrity;

  try {
    integrity = verifyLedgerIntegrity(ledger);
  } catch {
    return failedSnapshot();
  }

  if (!integrity.valid) {
    return failedSnapshot(integrity.reason);
  }

  try {
    const exported = exportLedgerSnapshot(ledger);

    return Object.freeze({
      valid: true,
      reason: 'VERIFIED_AUDIT_SNAPSHOT',
      schemaVersion: exported.schemaVersion,
      entryCount: exported.entryCount,
      entries: exported.entries,
      payoutAuthorized: false,
    });
  } catch {
    // Integrity and export intentionally remain separate gates. If the ledger
    // changes between reads or export validation fails, never emit a verified
    // snapshot and never authorize a payout.
    return failedSnapshot('AUDIT_EXPORT_FAILED');
  }
}
