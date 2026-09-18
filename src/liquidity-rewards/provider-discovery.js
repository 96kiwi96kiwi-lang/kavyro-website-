// KAVYRO Liquidity Rewards — read-only provider/discovery composition.
// This boundary accepts only the constrained provider contract and never exposes
// wallet, transaction-building, signing, or send capabilities.

import { discoverPoolsReadOnly } from './read-only-discovery-adapter.js';

const DENIED = Object.freeze({
  payoutAuthorized: false,
  canBuildTransaction: false,
  canSignTransaction: false,
  canSendTransaction: false,
});

export async function discoverFromReadOnlyProvider(provider) {
  const capabilities = provider?.capabilities;
  const validProvider =
    provider &&
    typeof provider.source === 'string' &&
    provider.source.trim() !== '' &&
    typeof provider.readPoolCandidates === 'function' &&
    capabilities?.read === true &&
    capabilities?.buildTransaction === false &&
    capabilities?.signTransaction === false &&
    capabilities?.sendTransaction === false;

  if (!validProvider) {
    return Object.freeze({
      ok: false,
      source: null,
      candidates: Object.freeze([]),
      reasons: Object.freeze(['READ_ONLY_PROVIDER_INVALID']),
      ...DENIED,
    });
  }

  return discoverPoolsReadOnly({
    source: provider.source,
    fetchPools: () => provider.readPoolCandidates(),
  });
}
