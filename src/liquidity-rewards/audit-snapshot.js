// KAVYRO Liquidity Rewards — integrity-gated, read-only audit snapshot.
// This module never discovers pools, authorizes payouts, signs, or sends transactions.

import { verifyLedgerIntegrity } from './ledger-integrity.js';
import { exportLedgerSnapshot } from './ledger-export.js';

export function createVerifiedAuditSnapshot(ledger) {
  const integrity = verifyLedgerIntegrity(ledger);

  if (!integrity.valid) {
    return Object.freeze({
      valid: false,
      reason: integrity.reason,
      payoutAuthorized: false,
    });
  }

  const exported = exportLedgerSnapshot(ledger);

  return Object.freeze({
    valid: true,
    reason: 'VERIFIED_AUDIT_SNAPSHOT',
    schemaVersion: exported.schemaVersion,
    entryCount: exported.entryCount,
    entries: exported.entries,
    payoutAuthorized: false,
  });
}
