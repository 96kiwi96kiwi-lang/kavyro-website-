// KAVYRO Liquidity Rewards — fail-closed read-only observation pipeline.
// This module composes provider discovery with observation safety validation.
// It never authorizes payouts or exposes transaction capabilities.

import { discoverFromReadOnlyProvider } from './provider-discovery.js';
import { enforceObservationSafety } from './observation-safety.js';

const DENIED = Object.freeze({
  payoutAuthorized: false,
  canBuildTransaction: false,
  canSignTransaction: false,
  canSendTransaction: false,
});

export async function collectSafeObservations(provider) {
  const discovery = await discoverFromReadOnlyProvider(provider);

  if (!discovery?.ok) {
    return Object.freeze({
      ok: false,
      source: discovery?.source ?? null,
      observations: Object.freeze([]),
      reasons: Object.freeze(discovery?.reasons ?? ['DISCOVERY_FAILED']),
      ...DENIED,
    });
  }

  const observations = [];
  const rejected = [];

  for (const candidate of discovery.candidates ?? []) {
    const checked = enforceObservationSafety(candidate);
    if (checked.ok) observations.push(checked.observation);
    else rejected.push(...checked.reasons);
  }

  return Object.freeze({
    ok: true,
    source: discovery.source,
    observations: Object.freeze(observations),
    rejectedCount: rejected.length,
    reasons: Object.freeze(rejected),
    ...DENIED,
  });
}
