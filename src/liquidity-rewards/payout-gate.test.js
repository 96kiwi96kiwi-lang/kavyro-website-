import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePayoutGate } from './payout-gate.js';

const replayRecord = Object.freeze({
  entitlementKey: 'TEST_ENTITLEMENT',
  evidenceKey: 'TEST_EVIDENCE',
  wallet: 'TEST_WALLET',
  positionId: 'TEST_POSITION',
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
  payoutAuthorized: false,
});

test('valid replay record is manual-review-only and never opens payout gate', () => {
  const result = evaluatePayoutGate(replayRecord);
  assert.equal(result.manualReviewEligible, true);
  assert.equal(result.gateOpen, false);
  assert.equal(result.rewardsEnabled, false);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.reason, 'MANUAL_REVIEW_ONLY');
  assert.equal('sign' in result, false);
  assert.equal('send' in result, false);
  assert.equal('buildTransaction' in result, false);
});

test('fails closed when payout is pre-authorized or identity is incomplete', () => {
  assert.equal(evaluatePayoutGate({ ...replayRecord, payoutAuthorized: true }).manualReviewEligible, false);
  assert.equal(evaluatePayoutGate({ ...replayRecord, evidenceKey: '' }).manualReviewEligible, false);
  assert.equal(evaluatePayoutGate({ ...replayRecord, poolId: '' }).manualReviewEligible, false);
  assert.equal(evaluatePayoutGate(null).manualReviewEligible, false);
});
