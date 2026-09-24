// KAVYRO Liquidity Rewards — trusted LP contribution evidence capability.
// Pure/read-only. This module does not perform RPC itself and cannot authorize payout.
// The factory is intentionally module-private: ordinary callers cannot mint trusted evidence.

const TRUSTED_CONTRIBUTION_EVIDENCE = Symbol('KAVYRO_TRUSTED_CONTRIBUTION_EVIDENCE');

/**
 * Narrow verifier-owned result accepted by the contribution boundary.
 * @typedef {Readonly<{
 *   poolId: string,
 *   wallet: string,
 *   positionId: string,
 *   contributedKvroBaseUnits: bigint,
 *   ownershipEvidenceId: string,
 *   contributionEvidenceId: string,
 *   kvroMint: string,
 *   quoteMint: string
 * }>} VerifiedContributionFacts
 */

/**
 * This is the only promotion point for independently verified LP facts.
 * Keep it private until the read-only on-chain/RPC verifier is implemented in this module.
 *
 * @param {VerifiedContributionFacts} facts
 */
function mintTrustedContributionEvidence(facts) {
  return Object.freeze({ ...facts, [TRUSTED_CONTRIBUTION_EVIDENCE]: true });
}

/**
 * Fail-closed type guard used by the public contribution boundary.
 * Plain objects cannot reproduce the module-private Symbol capability.
 *
 * @param {unknown} value
 * @returns {value is VerifiedContributionFacts & { readonly [TRUSTED_CONTRIBUTION_EVIDENCE]: true }}
 */
export function isTrustedContributionEvidence(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    /** @type {Record<PropertyKey, unknown>} */ (value)[TRUSTED_CONTRIBUTION_EVIDENCE] === true,
  );
}

// Prevent accidental removal as dead code while keeping the promotion point inaccessible.
void mintTrustedContributionEvidence;
