const DENIED = Object.freeze({
  ok: false,
  observation: null,
  payoutAuthorized: false,
  canBuildTransaction: false,
  canSignTransaction: false,
  canSendTransaction: false,
});

export function enforceObservationSafety(observation) {
  if (!observation || typeof observation !== 'object') {
    return { ...DENIED, reasons: ['OBSERVATION_INVALID'] };
  }

  const source = typeof observation.source === 'string' ? observation.source.trim() : '';
  const poolId = typeof observation.poolId === 'string' ? observation.poolId.trim() : '';
  const mintA = typeof observation.mintA === 'string' ? observation.mintA.trim() : '';
  const mintB = typeof observation.mintB === 'string' ? observation.mintB.trim() : '';

  if (!source || !poolId || !mintA || !mintB || observation.onChainExists !== true) {
    return { ...DENIED, reasons: ['OBSERVATION_UNVERIFIED'] };
  }

  return {
    ok: true,
    observation: Object.freeze({ source, poolId, mintA, mintB, onChainExists: true }),
    reasons: [],
    payoutAuthorized: false,
    canBuildTransaction: false,
    canSignTransaction: false,
    canSendTransaction: false,
  };
}
