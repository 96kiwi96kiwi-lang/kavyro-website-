// KAVYRO Liquidity Rewards — LP contribution evidence boundary.
// Pure/read-only. Pool verification alone never proves ownership or contribution.
//
// IMPORTANT TRUST BOUNDARY:
// This module intentionally cannot promote plain caller-supplied objects into
// ownership/contribution proof. A future read-only on-chain/RPC verifier must
// provide a non-forgeable internal capability before this boundary can accept
// evidence. Until that verifier exists, fail closed.

/**
 * Contribution evidence is deliberately disabled at this boundary until an
 * independent on-chain/RPC verifier is wired in. Boolean proof flags, source
 * labels, evidence IDs, wallet/position IDs, and amounts are all forgeable when
 * supplied by an ordinary caller and therefore cannot establish LP ownership or
 * contribution.
 *
 * @param {unknown} _value
 * @returns {never}
 */
export function requireVerifiedContributionEvidence(_value) {
  throw new Error('TRUSTED_CONTRIBUTION_EVIDENCE_REQUIRED');
}
