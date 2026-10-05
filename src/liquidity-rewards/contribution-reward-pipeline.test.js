import test from 'node:test';
import assert from 'node:assert/strict';
import { composeContributionEntitlementEvidence } from './contribution-entitlement-evidence.js';
import { bindContributionEvidenceToObservation } from './contribution-eligibility-boundary.js';
import { evaluateHoldingEligibility } from './holding-eligibility.js';
import { requireVerifiedEntitlement } from './entitlement-boundary.js';
import { createReplayRecord, appendReplayRecord } from './replay-ledger.js';
import { createObservationAuditEvidence } from './integrity-audit.js';
import { createReviewableRewardCandidate } from './reward-candidate.js';
import { evaluatePayoutGate } from './payout-gate.js';
import { KAVYRO_MINT, WRAPPED_SOL_MINT, POOL_STATUS } from './config.js';

const receipt={finalized:true,signature:'SIG',wallet:'W',poolId:'P',poolType:'RAYDIUM_CPMM',lpMint:'LP',kvroMint:KAVYRO_MINT,quoteMint:WRAPPED_SOL_MINT,kvroSourceOwner:'W',kvroTransferredBaseUnits:500n,lpMintedBaseUnits:20n,slot:100,blockTimeSeconds:3600,observedAtSeconds:3610,maxAgeSeconds:60};
const ownership={verified:true,poolVerified:true,ownershipProven:true,wallet:'W',poolId:'P',lpMint:'LP',positionId:'LP-POSITION',ownershipEvidenceId:'OWNERSHIP-EVIDENCE'};
const rawObservation=(period,amount=999999n)=>({poolVerified:true,poolId:'P',wallet:'W',positionId:'LP-POSITION',observationPeriod:period,contextSlot:1000+period,observedAtSeconds:period*3600+60,contributionProven:true,contributedKvroBaseUnits:amount});

test('verified historical contribution reaches reviewable proposal but payout gate stays closed',()=>{
 const contribution=composeContributionEntitlementEvidence(receipt,ownership);
 const observations=[10,11,12].map((period)=>bindContributionEvidenceToObservation(receipt,rawObservation(period)));
 const eligibility=evaluateHoldingEligibility({observations,minimumPeriods:3});
 const entitlement=requireVerifiedEntitlement(contribution,eligibility);
 assert.equal(entitlement.entitledKvroBaseUnits,500n);
 const replay=createReplayRecord(entitlement);
 const ledger=appendReplayRecord([],replay);
 assert.equal(ledger.length,1);
 const terminal=observations[observations.length-1];
 const audit=createObservationAuditEvidence(terminal);
 assert.equal(audit.valid,true);
 if(!audit.valid) throw new Error('AUDIT_EXPECTED');
 const candidate=createReviewableRewardCandidate(entitlement,replay,audit.evidence,audit.digest);
 assert.equal(candidate.reviewable,true);
 assert.equal(candidate.rewardBaseUnits,500n);
 assert.equal(candidate.payoutAuthorized,false);
 const gate=evaluatePayoutGate({config:{enabled:true,poolId:'P',poolStatus:POOL_STATUS.VERIFIED},entitlement:candidate});
 assert.equal(gate.authorized,false);
 assert.equal(gate.canBuildTransaction,false);
 assert.equal(gate.canSignTransaction,false);
 assert.equal(gate.canSendTransaction,false);
 assert.ok(gate.reasons.includes('PAYOUT_IMPLEMENTATION_NOT_AVAILABLE'));
});

test('caller supplied observation amount cannot inflate entitlement above verified receipt',()=>{
 const contribution=composeContributionEntitlementEvidence(receipt,ownership);
 const observations=[20,21].map((period)=>bindContributionEvidenceToObservation(receipt,rawObservation(period,999999999n)));
 const eligibility=evaluateHoldingEligibility({observations,minimumPeriods:2});
 const entitlement=requireVerifiedEntitlement(contribution,eligibility);
 assert.equal(eligibility.minimumContributionKvroBaseUnits,500n);
 assert.equal(entitlement.entitledKvroBaseUnits,500n);
});

test('reusing the same verified contribution and ownership evidence fails replay ledger',()=>{
 const contribution=composeContributionEntitlementEvidence(receipt,ownership);
 const observations=[30,31].map((period)=>bindContributionEvidenceToObservation(receipt,rawObservation(period)));
 const entitlement=requireVerifiedEntitlement(contribution,evaluateHoldingEligibility({observations,minimumPeriods:2}));
 const replay=createReplayRecord(entitlement);
 const ledger=appendReplayRecord([],replay);
 assert.throws(()=>appendReplayRecord(ledger,replay),/ENTITLEMENT_REPLAY_DETECTED|EVIDENCE_REUSE_DETECTED/);
});
