// Read-only provider contract for KAVYRO Liquidity Rewards.
// This module deliberately exposes no wallet, transaction, signing, or send capability.

export function createReadOnlyPoolProvider({ fetchCandidates, source }) {
  if (typeof fetchCandidates !== 'function') {
    throw new TypeError('fetchCandidates must be a function');
  }
  if (typeof source !== 'string' || source.trim() === '') {
    throw new TypeError('source must be a non-empty string');
  }

  const provenance = source.trim();

  return Object.freeze({
    source: provenance,
    capabilities: Object.freeze({
      read: true,
      buildTransaction: false,
      signTransaction: false,
      sendTransaction: false,
    }),
    async readPoolCandidates() {
      const result = await fetchCandidates();
      if (!Array.isArray(result)) {
        throw new TypeError('read-only provider must return an array');
      }
      return result.map((candidate) => Object.freeze({
        ...candidate,
        source: candidate?.source || provenance,
      }));
    },
  });
}
