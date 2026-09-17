import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_OBSERVATION_PERIOD_SECONDS,
  observationPeriodBounds,
  observationPeriodForTimestamp,
} from './observation-period.js';

test('uses deterministic one-hour periods by default', () => {
  assert.equal(DEFAULT_OBSERVATION_PERIOD_SECONDS, 3600);
  assert.equal(observationPeriodForTimestamp(0), 0);
  assert.equal(observationPeriodForTimestamp(3599), 0);
  assert.equal(observationPeriodForTimestamp(3600), 1);
  assert.equal(observationPeriodForTimestamp(7199), 1);
});

test('returns exact half-open period bounds', () => {
  assert.deepEqual(observationPeriodBounds(2), {
    observationPeriod: 2,
    startSeconds: 7200,
    endSecondsExclusive: 10800,
    periodSeconds: 3600,
  });
});

test('supports explicit deterministic period sizes', () => {
  assert.equal(observationPeriodForTimestamp(899, 300), 2);
  assert.deepEqual(observationPeriodBounds(2, 300), {
    observationPeriod: 2,
    startSeconds: 600,
    endSecondsExclusive: 900,
    periodSeconds: 300,
  });
});

test('rejects invalid timestamps and periods fail-closed', () => {
  for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '3600', null]) {
    assert.throws(() => observationPeriodForTimestamp(value), /INVALID_TIMESTAMP_SECONDS/);
  }

  for (const value of [0, -1, 1.5, Number.NaN, '3600', null]) {
    assert.throws(() => observationPeriodForTimestamp(0, value), /INVALID_PERIOD_SECONDS/);
  }
});

test('rejects unsafe period bounds instead of overflowing silently', () => {
  assert.throws(
    () => observationPeriodBounds(Number.MAX_SAFE_INTEGER, 2),
    /OBSERVATION_PERIOD_OVERFLOW/,
  );
});
