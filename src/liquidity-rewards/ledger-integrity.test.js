import { describe, expect, it } from 'vitest';
import { verifyLedgerIntegrity } from './ledger-integrity.js';

function ledgerWith(entries) {
  return { snapshot: () => entries };
}

function entry(overrides = {}) {
  return {
    key: 'wallet-1:position-1:0',
    wallet: 'wallet-1',
    positionId: 'position-1',
    poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
    observationPeriod: 0,
    status: 'RECORDED',
    ...overrides,
  };
}

describe('verifyLedgerIntegrity', () => {
  it('accepts an empty ledger without authorizing payout', () => {
    expect(verifyLedgerIntegrity(ledgerWith([]))).toEqual({
      valid: true,
      reason: 'LEDGER_INTEGRITY_OK',
      checkedEntries: 0,
      payoutAuthorized: false,
    });
  });

  it('accepts valid unique recorded entries', () => {
    const result = verifyLedgerIntegrity(ledgerWith([
      entry(),
      entry({ key: 'wallet-1:position-1:1', observationPeriod: 1 }),
    ]));

    expect(result.valid).toBe(true);
    expect(result.checkedEntries).toBe(2);
    expect(result.payoutAuthorized).toBe(false);
  });

  it.each([
    ['missing wallet', { wallet: '' }, 'INVALID_LEDGER_ENTRY'],
    ['missing position', { positionId: '' }, 'INVALID_LEDGER_ENTRY'],
    ['missing pool', { poolId: '' }, 'INVALID_LEDGER_ENTRY'],
    ['negative period', { observationPeriod: -1 }, 'INVALID_LEDGER_ENTRY'],
    ['fractional period', { observationPeriod: 0.5 }, 'INVALID_LEDGER_ENTRY'],
    ['invalid status', { status: 'PAID' }, 'INVALID_LEDGER_STATUS'],
    ['mismatched key', { key: 'tampered-key' }, 'LEDGER_KEY_MISMATCH'],
  ])('fails closed for %s', (_label, overrides, reason) => {
    expect(verifyLedgerIntegrity(ledgerWith([entry(overrides)]))).toEqual({
      valid: false,
      reason,
      payoutAuthorized: false,
    });
  });

  it('detects duplicate ledger identity keys', () => {
    const duplicate = entry({ poolId: 'ANOTHER_TEST_ONLY_POOL_ID_NOT_PRODUCTION' });
    expect(verifyLedgerIntegrity(ledgerWith([entry(), duplicate]))).toEqual({
      valid: false,
      reason: 'DUPLICATE_LEDGER_KEY',
      payoutAuthorized: false,
    });
  });

  it('rejects invalid ledger interfaces', () => {
    expect(() => verifyLedgerIntegrity(null)).toThrow('INVALID_LEDGER');
    expect(() => verifyLedgerIntegrity({ snapshot: () => ({}) })).toThrow('INVALID_LEDGER_SNAPSHOT');
  });

  it('never trusts injected payout or signing fields', () => {
    const result = verifyLedgerIntegrity(ledgerWith([
      entry({ payoutAuthorized: true, privateKey: 'do-not-trust', signedTransaction: 'do-not-trust' }),
    ]));
    expect(result.valid).toBe(true);
    expect(result.payoutAuthorized).toBe(false);
    expect(result).not.toHaveProperty('privateKey');
    expect(result).not.toHaveProperty('signedTransaction');
  });
});
