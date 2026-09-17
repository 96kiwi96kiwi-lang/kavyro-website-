// KAVYRO Liquidity Rewards — deterministic in-memory ledger core.
// This module does not discover pools, send tokens, or make positions eligible.
// Eligibility must be established by independently verified upstream data.

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  return value.trim();
}

function requirePeriod(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('INVALID_OBSERVATION_PERIOD');
  }
  return value;
}

export function makeLedgerKey({ wallet, positionId, observationPeriod }) {
  return [
    requireNonEmptyString(wallet, 'wallet'),
    requireNonEmptyString(positionId, 'position_id'),
    requirePeriod(observationPeriod),
  ].join(':');
}

export function createRewardLedger() {
  const entries = new Map();

  return Object.freeze({
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

    hasObservation(identity) {
      return entries.has(makeLedgerKey(identity));
    },

    size() {
      return entries.size;
    },

    snapshot() {
      return Object.freeze(Array.from(entries.values()));
    },
  });
}
