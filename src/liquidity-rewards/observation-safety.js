import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';

const DENIED = Object.freeze({
  ok: false,
  observation: null,
  payoutAuthorized: false,
  canBuildTransaction: false,
  canSignTransaction: false,
  canSendTransaction: false,
});

/**
 * @typedef {object} ObservationCandidate
 * @property {unknown} [source]
 * @property {unknown} [poolId]
 * @property {unknown} [mintA]
 * @property {unknown} [mintB]
 * @property {unknown} [onChainExists]
 * @property {unknown} [contextSlot]
 * @property {unknown} [observedAtSeconds]
 */

/** @param {unknown} value */
const safeNonNegativeInteger = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/**
 * Fail-closed normalization boundary for an already independently verified
 * read-only observation. Trusted observation time must remain bound to the RPC
 * context slot; callers cannot promote untimed verification into sustained
 * eligibility evidence. This function cannot authorize payouts or expose any
 * transaction capability.
 *
 * @param {unknown} observation
 */
export function enforceObservationSafety(observation) {
  if (!observation || typeof observation !== 'object') {
    return { ...DENIED, reasons: ['OBSERVATION_INVALID'] };
  }

  /** @type {ObservationCandidate} */
  const candidate = observation;
  const source = typeof candidate.source === 'string' ? candidate.source.trim() : '';
  const poolId = typeof candidate.poolId === 'string' ? candidate.poolId.trim() : '';
  const mintA = typeof candidate.mintA === 'string' ? candidate.mintA.trim() : '';
  const mintB = typeof candidate.mintB === 'string' ? candidate.mintB.trim() : '';

  if (!source || !poolId || !mintA || !mintB || candidate.onChainExists !== true) {
    return { ...DENIED, reasons: ['OBSERVATION_UNVERIFIED'] };
  }

  const observedMints = [mintA, mintB];
  if (!observedMints.includes(KAVYRO_MINT) || !observedMints.includes(WRAPPED_SOL_MINT)) {
    return { ...DENIED, reasons: ['OBSERVATION_UNEXPECTED_MINTS'] };
  }

  const contextSlot = safeNonNegativeInteger(candidate.contextSlot);
  const observedAtSeconds = safeNonNegativeInteger(candidate.observedAtSeconds);
  if (contextSlot === null || observedAtSeconds === null) {
    return { ...DENIED, reasons: ['OBSERVATION_TRUSTED_TIME_REQUIRED'] };
  }

  return {
    ok: true,
    observation: Object.freeze({ source, poolId, mintA, mintB, onChainExists: true, contextSlot, observedAtSeconds }),
    reasons: [],
    payoutAuthorized: false,
    canBuildTransaction: false,
    canSignTransaction: false,
    canSendTransaction: false,
  };
}
