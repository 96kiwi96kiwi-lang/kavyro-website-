// KAVYRO Liquidity Rewards — deterministic observation-period helpers.
// Pure logic only: no clocks, RPC calls, pool discovery, signing, or payouts.

export const DEFAULT_OBSERVATION_PERIOD_SECONDS = 3600;

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {number}
 */
function requireSafeNonNegativeInteger(value, field) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  return value;
}

/**
 * @param {unknown} timestampSeconds
 * @param {unknown} [periodSeconds]
 * @returns {number}
 */
export function observationPeriodForTimestamp(
  timestampSeconds,
  periodSeconds = DEFAULT_OBSERVATION_PERIOD_SECONDS,
) {
  const timestamp = requireSafeNonNegativeInteger(timestampSeconds, 'timestamp_seconds');
  const period = requireSafeNonNegativeInteger(periodSeconds, 'period_seconds');

  if (period === 0) {
    throw new Error('INVALID_PERIOD_SECONDS');
  }

  return Math.floor(timestamp / period);
}

/**
 * @param {unknown} observationPeriod
 * @param {unknown} [periodSeconds]
 * @returns {Readonly<{
 *   observationPeriod: number,
 *   startSeconds: number,
 *   endSecondsExclusive: number,
 *   periodSeconds: number
 * }>}
 */
export function observationPeriodBounds(
  observationPeriod,
  periodSeconds = DEFAULT_OBSERVATION_PERIOD_SECONDS,
) {
  const periodIndex = requireSafeNonNegativeInteger(observationPeriod, 'observation_period');
  const period = requireSafeNonNegativeInteger(periodSeconds, 'period_seconds');

  if (period === 0) {
    throw new Error('INVALID_PERIOD_SECONDS');
  }

  const startSeconds = periodIndex * period;
  const endSecondsExclusive = startSeconds + period;

  if (!Number.isSafeInteger(startSeconds) || !Number.isSafeInteger(endSecondsExclusive)) {
    throw new Error('OBSERVATION_PERIOD_OVERFLOW');
  }

  return Object.freeze({
    observationPeriod: periodIndex,
    startSeconds,
    endSecondsExclusive,
    periodSeconds: period,
  });
}
