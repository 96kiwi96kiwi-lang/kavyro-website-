// KAVYRO Liquidity Rewards — deterministic in-memory ledger core.
// This module does not discover pools, send tokens, or make positions eligible.
// Eligibility must be established by independently verified upstream data.

/**
 * @typedef {object} LedgerIdentity
 * @property {string} wallet
 * @property {string} positionId
 * @property {number} observationPeriod
 */

/**
 * @typedef {LedgerIdentity & {
 *   eligible: true,
 *   poolVerified: true,
 *   poolId: string,
 * }} VerifiedEligibleObservation
 */

/**
 * @typedef {Readonly<{
 *   key: string,
 *   wallet: string,
 *   positionId: string,
 *   observationPeriod: number,
 *   poolId: string,
 *   status: 'RECORDED',
 * }>} LedgerEntry
 */

/** @param {unknown} value @param {string} field @returns {string} */
function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  return value.trim();
}

/** @param {unknown} value @returns {number} */
function requirePeriod(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('INVALID_OBSERVATION_PERIOD');
  }
  return value;
}

/** @param {LedgerIdentity} identity @returns {string} */
export function makeLedgerKey({ wallet, positionId, observationPeriod }) {
  return [
    requireNonEmptyString(wallet, 'wallet'),
    requireNonEmptyString(positionId, 'position_id'),
    requirePeriod(observationPeriod),
  ].join(':');
}

export function createRewardLedger() {
  /** @type {Map<string, LedgerEntry>} */
  const entries = new Map();

  return Object.freeze({
    /** @param {VerifiedEligibleObservation} observation @returns {LedgerEntry} */
    recordObservation(observation) {
      if (!observation || observation.eligible !== true) {
        throw new Error('POSITION_NOT_ELIGIBLE');
      }
      if (observation.poolVerified !== true) {
        throw new Error('POOL_NOT_VERIFIED');
      }

      const key = makeLedgerKey(observation);
      if (entries.has(key)) {
        throw new Error('DUPLICATE_OBSERVATION');
      }

      /** @type {LedgerEntry} */
      const entry = Object.freeze({
        key,
        wallet: observation.wallet.trim(),
        positionId: observation.positionId.trim(),
        observationPeriod: observation.observationPeriod,
        poolId: requireNonEmptyString(observation.poolId, 'pool_id'),
        status: 'RECORDED',
      });

      entries.set(key, entry);
      return entry;
    },

    /** @param {LedgerIdentity} identity @returns {boolean} */
    hasObservation(identity) {
      return entries.has(makeLedgerKey(identity));
    },

    /** @returns {number} */
    size() {
      return entries.size;
    },

    /** @returns {ReadonlyArray<LedgerEntry>} */
    snapshot() {
      return Object.freeze(Array.from(entries.values()));
    },
  });
}
