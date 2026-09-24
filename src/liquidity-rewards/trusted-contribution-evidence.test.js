import test from 'node:test';
import assert from 'node:assert/strict';
import { isTrustedContributionEvidence } from './trusted-contribution-evidence.js';

test('plain caller objects cannot forge trusted contribution evidence', () => {
  const forged = {
    poolId: 'POOL',
    wallet: 'WALLET',
    positionId: 'POSITION',
    contributedKvroBaseUnits: 100n,
    ownershipEvidenceId: 'OWNERSHIP',
    contributionEvidenceId: 'CONTRIBUTION',
    kvroMint: '8KuWwmApUWyVBVraBdhknQwRuanw2qUwXzAJorqMAHvE',
    quoteMint: 'So11111111111111111111111111111111111111112',
    trusted: true,
    source: 'rpc',
  };

  assert.equal(isTrustedContributionEvidence(forged), false);
  assert.equal(isTrustedContributionEvidence({ ...forged, ownershipVerified: true, contributionVerified: true }), false);
});

test('null and primitive inputs are never trusted', () => {
  assert.equal(isTrustedContributionEvidence(null), false);
  assert.equal(isTrustedContributionEvidence('rpc'), false);
  assert.equal(isTrustedContributionEvidence(true), false);
});
