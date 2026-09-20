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

/**
 * @typedef {object} ReadOnlyCapabilities
 * @property {true} read
 * @property {false} buildTransaction
 * @property {false} signTransaction
 * @property {false} sendTransaction
 *
 * @typedef {object} ReadOnlyPoolProvider
 * @property {string} source
 * @property {ReadOnlyCapabilities} capabilities
 * @property {() => Promise<unknown>} readPoolCandidates
 */

/**
 * Compose discovery with a provider only after runtime proof that its exposed
 * capabilities are read-only. Provider data remains discovery evidence only;
 * this boundary does not establish LP ownership, contribution, eligibility,
 * or payout authorization.
 *
 * @param {unknown} provider
 * @returns {Promise<unknown>}
 */
export async function discoverFromReadOnlyProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    return Object.freeze({
      ok: false,
      source: null,
      candidates: Object.freeze([]),
      reasons: Object.freeze(['READ_ONLY_PROVIDER_INVALID']),
      ...DENIED,
    });
  }

  const capabilities = 'capabilities' in provider ? provider.capabilities : null;
  const validCapabilities =
    capabilities &&
    typeof capabilities === 'object' &&
    'read' in capabilities && capabilities.read === true &&
    'buildTransaction' in capabilities && capabilities.buildTransaction === false &&
    'signTransaction' in capabilities && capabilities.signTransaction === false &&
    'sendTransaction' in capabilities && capabilities.sendTransaction === false;

  const validProvider =
    'source' in provider &&
    typeof provider.source === 'string' &&
    provider.source.trim() !== '' &&
    'readPoolCandidates' in provider &&
    typeof provider.readPoolCandidates === 'function' &&
    validCapabilities;

  if (!validProvider) {
    return Object.freeze({
      ok: false,
      source: null,
      candidates: Object.freeze([]),
      reasons: Object.freeze(['READ_ONLY_PROVIDER_INVALID']),
      ...DENIED,
    });
  }

  const safeProvider = /** @type {ReadOnlyPoolProvider} */ (provider);
  return discoverPoolsReadOnly({
    source: safeProvider.source,
    fetchPools: () => safeProvider.readPoolCandidates(),
  });
}
