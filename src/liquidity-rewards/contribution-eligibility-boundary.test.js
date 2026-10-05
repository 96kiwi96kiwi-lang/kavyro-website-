import test from 'node:test';
import assert from 'node:assert/strict';
import { bindContributionEvidenceToObservation } from './contribution-eligibility-boundary.js';
import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';

const receipt = {
  finalized: true,
  signature: 'SIG',
  wallet: 'W',
  poolId: 'P',
  poolType: 'RAYDIUM_CPMM',
  lpMint: 'LP',
  kvroMint: KAVYRO_MINT,
  quoteMint: WRAPPED_SOL_MINT,
  kvroSourceOwner: 'W',
  kvroTransferredBaseUnits: 500n,
  lpMintedBaseUnits: 20n,
  slot: 100,
  blockTimeSeconds: 3600,
  observedAtSeconds: 3610,
  maxAgeSeconds: 60,
};

const observation = {
  poolVerified: true,
  poolId: 'P',
  wallet: 'W',
  positionId: 'LP',
  observationPeriod: 2,
  contextSlot: 200,
  observedAtSeconds: 7201,
  contributionProven: false,
  contributedKvroBaseUnits: 999999n,
};

test('promotes only verified historical CPMM receipt facts into eligibility input', () => {
  const result = bindContributionEvidenceToObservation(receipt, observation);
  assert.equal(result.contributionProven, true);
  assert.equal(result.contributedKvroBaseUnits, 500n);
  assert.equal(result.contributionEvidenceId, 'SIG:P:W');
  assert.equal(result.payoutAuthorized, false);
});

test('caller flags and amounts cannot replace receipt verification', () => {
  assert.throws(
    () => bindContributionEvidenceToObservation(
      { contributionProven: true, contributedKvroBaseUnits: 999n },
      observation,
    ),
    /NOT_FINALIZED|IDENTITY|RECEIPT/,
  );
});

test('receipt and holding identities must agree', () => {
  assert.throws(
    () => bindContributionEvidenceToObservation(receipt, { ...observation, wallet: 'OTHER' }),
    /IDENTITY_MISMATCH/,
  );
  assert.throws(
    () => bindContributionEvidenceToObservation(receipt, { ...observation, poolId: 'OTHER' }),
    /IDENTITY_MISMATCH/,
  );
});
