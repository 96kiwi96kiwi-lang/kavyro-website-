import test from 'node:test';
import assert from 'node:assert/strict';
import { composeContributionEntitlementEvidence } from './contribution-entitlement-evidence.js';
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
const ownership = {
  verified: true,
  poolVerified: true,
  ownershipProven: true,
  wallet: 'W',
  poolId: 'P',
  lpMint: 'LP',
  positionId: 'LP-POSITION',
  ownershipEvidenceId: 'OWNERSHIP-EVIDENCE',
};

test('composes historical contribution with independently verified LP ownership', () => {
  const result = composeContributionEntitlementEvidence(receipt, ownership);
  assert.equal(result.verified, true);
  assert.equal(result.contributionProven, true);
  assert.equal(result.contributedKvroBaseUnits, 500n);
  assert.equal(result.contributionEvidenceId, 'SIG:P:W');
  assert.equal(result.ownershipEvidenceId, 'OWNERSHIP-EVIDENCE');
  assert.equal(result.payoutAuthorized, false);
});

test('caller supplied proof flags cannot replace verified historical receipt', () => {
  assert.throws(
    () => composeContributionEntitlementEvidence(
      { contributionProven: true, contributedKvroBaseUnits: 999999n },
      ownership,
    ),
    /NOT_FINALIZED|IDENTITY|RECEIPT/,
  );
});

test('fails closed unless ownership is independently verified', () => {
  assert.throws(
    () => composeContributionEntitlementEvidence(receipt, { ...ownership, ownershipProven: false }),
    /VERIFIED_OWNERSHIP_REQUIRED/,
  );
});

test('fails closed when receipt and ownership identity differ', () => {
  for (const patch of [{ wallet: 'OTHER' }, { poolId: 'OTHER' }, { lpMint: 'OTHER' }]) {
    assert.throws(
      () => composeContributionEntitlementEvidence(receipt, { ...ownership, ...patch }),
      /CONTRIBUTION_OWNERSHIP_IDENTITY_MISMATCH/,
    );
  }
});
