// KAVYRO Liquidity Rewards — integrity-gated, read-only audit snapshot.
// This module never discovers pools, authorizes payouts, signs, or sends transactions.

import { verifyLedgerIntegrity } from './ledger-integrity.js';
import { exportLedgerSnapshot } from './ledger-export.js';

/**
 * @typedef {{ snapshot: () => unknown }} AuditLedger
 * @typedef {Readonly<{
 *   valid: false,
 *   reason: string,
 *   payoutAuthorized: false
 * }>} FailedAuditSnapshot
 */

/**
 * @param {string} [reason]
 * @returns {FailedAuditSnapshot}
 */
function failedSnapshot(reason = 'INVALID_LEDGER') {
  return Object.freeze({
    valid: false,
    reason,
    payoutAuthorized: false,
  });
}

/**
 * Create an integrity-gated audit view of a read-only ledger. A verified audit
 * snapshot is evidence for inspection only and can never authorize payout.
 * Unknown or malformed ledger inputs fail closed.
 *
 * @param {unknown} ledger
 * @returns {FailedAuditSnapshot | Readonly<{
 *   valid: true,
 *   reason: 'VERIFIED_AUDIT_SNAPSHOT',
 *   schemaVersion: unknown,
 *   entryCount: unknown,
 *   entries: unknown,
 *   payoutAuthorized: false
 * }>}
 */
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

  if (!ledger || typeof ledger !== 'object' || !('snapshot' in ledger) || typeof ledger.snapshot !== 'function') {
    return failedSnapshot();
  }

  try {
    const exported = exportLedgerSnapshot(/** @type {AuditLedger} */ (ledger));

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
