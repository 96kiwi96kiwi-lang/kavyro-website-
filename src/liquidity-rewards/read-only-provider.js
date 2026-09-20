// Read-only provider contract for KAVYRO Liquidity Rewards.
// This module deliberately exposes no wallet, transaction, signing, or send capability.

/** @typedef {Record<string, unknown> & { source?: unknown }} PoolCandidate */
/** @typedef {() => Promise<unknown>} FetchCandidates */
/** @typedef {{ fetchCandidates?: unknown, source?: unknown }} ReadOnlyProviderInput */

/**
 * Create a provider that can only return untrusted pool-discovery candidates.
 * Discovery provenance is not evidence of LP ownership, contribution, eligibility,
 * entitlement, or payout authorization; those require independent verification.
 *
 * @param {unknown} input
 */
export function createReadOnlyPoolProvider(input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('read-only provider input must be an object');
  }

  const { fetchCandidates, source } = /** @type {ReadOnlyProviderInput} */ (input);
  if (typeof fetchCandidates !== 'function') {
    throw new TypeError('fetchCandidates must be a function');
  }
  if (typeof source !== 'string' || source.trim() === '') {
    throw new TypeError('source must be a non-empty string');
  }

  const provenance = source.trim();
  const fetchReadOnlyCandidates = /** @type {FetchCandidates} */ (fetchCandidates);

  return Object.freeze({
    source: provenance,
    capabilities: Object.freeze({
      read: true,
      buildTransaction: false,
      signTransaction: false,
      sendTransaction: false,
    }),
    async readPoolCandidates() {
      const result = await fetchReadOnlyCandidates();
      if (!Array.isArray(result)) {
        throw new TypeError('read-only provider must return an array');
      }

      return result.map((candidate) => {
        if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
          throw new TypeError('read-only provider candidate must be an object');
        }

        const record = /** @type {PoolCandidate} */ (candidate);
        return Object.freeze({
          ...record,
          source: typeof record.source === 'string' && record.source.trim() !== ''
            ? record.source
            : provenance,
        });
      });
    },
  });
}
