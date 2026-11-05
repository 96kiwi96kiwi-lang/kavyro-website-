// Read-only production composition for verifier-owned CPMM contribution evidence.
// Caller supplies identity only; LP mint and contributed KVRO amount come from independent verifiers.
import { verifyCpmmContributionDeltas } from './cpmm-contribution-delta-verifier.js';
import { composeContributionEntitlementEvidence } from './contribution-entitlement-evidence.js';

/** @param {unknown} value */
function isCanonicalIdentity(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value &&
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
    });
}

/** @param {unknown} txValue @param {string} wallet */
function requireFinalizedWalletSigner(txValue, wallet) {
  if (!txValue || typeof txValue !== 'object') throw new Error('FINALIZED_WALLET_SIGNER_REQUIRED');
  const txEvidence = /** @type {Record<string, unknown>} */ (txValue);
  if (!txEvidence.transaction || typeof txEvidence.transaction !== 'object') throw new Error('FINALIZED_WALLET_SIGNER_REQUIRED');
  const transaction = /** @type {Record<string, unknown>} */ (txEvidence.transaction);
  if (!transaction.message || typeof transaction.message !== 'object') throw new Error('FINALIZED_WALLET_SIGNER_REQUIRED');
  const message = /** @type {Record<string, unknown>} */ (transaction.message);
  const keys = Array.isArray(message.accountKeys) ? message.accountKeys : [];
  const matches = keys.filter((value) => value && typeof value === 'object' &&
    'pubkey' in value && value.pubkey === wallet);
  if (matches.length !== 1 || (/** @type {Record<string, unknown>} */ (matches[0])).signer !== true) {
    throw new Error('FINALIZED_WALLET_SIGNER_REQUIRED');
  }
}

/**
 * @param {{
 *   ownershipVerifier:{verifyCurrentOwnership:(r:{poolId:string,tokenAccount:string,wallet:string})=>Promise<any>},
 *   transactionReader:{readFinalizedTransaction:(signature:string)=>Promise<any>},
 *   nowSeconds:()=>number,
 *   maxReceiptAgeSeconds:number
 * }} deps
 */
export function createVerifiedContributionComposition(deps) {
  if (!deps || typeof deps.ownershipVerifier?.verifyCurrentOwnership !== 'function' ||
      typeof deps.transactionReader?.readFinalizedTransaction !== 'function' ||
      typeof deps.nowSeconds !== 'function' ||
      !Number.isSafeInteger(deps.maxReceiptAgeSeconds) || deps.maxReceiptAgeSeconds < 0) {
    throw new TypeError('verified contribution composition dependencies are required');
  }

  return Object.freeze({
    /** @param {{signature:string,wallet:string,poolId:string,tokenAccount:string}} request */
    async verify(request) {
      if (!request || !isCanonicalIdentity(request.signature) ||
          !isCanonicalIdentity(request.wallet) || !isCanonicalIdentity(request.poolId) ||
          !isCanonicalIdentity(request.tokenAccount)) {
        throw new Error('VERIFIED_CONTRIBUTION_REQUEST_INVALID');
      }

      const ownership = await deps.ownershipVerifier.verifyCurrentOwnership({
        wallet: request.wallet, poolId: request.poolId, tokenAccount: request.tokenAccount,
      });
      if (!ownership || ownership.verified !== true || ownership.evidenceKind !== 'CURRENT_CPMM_LP_OWNERSHIP' ||
          ownership.poolType !== 'RAYDIUM_CPMM' || ownership.contributionAmountVerified !== false ||
          ownership.payoutAuthorized !== false || ownership.wallet !== request.wallet || ownership.poolId !== request.poolId ||
          ownership.tokenAccount !== request.tokenAccount || !isCanonicalIdentity(ownership.lpMint)) {
        throw new Error('VERIFIER_OWNED_LP_EVIDENCE_REQUIRED');
      }
      if (typeof ownership.lpAmountBaseUnits !== 'bigint' || ownership.lpAmountBaseUnits <= 0n) {
        throw new Error('VERIFIER_OWNED_LP_BALANCE_REQUIRED');
      }
      if (!Number.isSafeInteger(ownership.poolContextSlot) || ownership.poolContextSlot <= 0 ||
          !Number.isSafeInteger(ownership.tokenAccountContextSlot) || ownership.tokenAccountContextSlot <= 0) {
        throw new Error('VERIFIER_OWNED_LP_PROVENANCE_REQUIRED');
      }
      // Snapshot verifier-owned facts before the next await. An injected adapter
      // must not be able to rewrite already-validated evidence while RPC I/O is pending.
      const verifiedOwnership = Object.freeze({
        wallet: ownership.wallet,
        poolId: ownership.poolId,
        tokenAccount: ownership.tokenAccount,
        lpMint: ownership.lpMint,
        poolContextSlot: ownership.poolContextSlot,
        tokenAccountContextSlot: ownership.tokenAccountContextSlot,
      });

      const tx = await deps.transactionReader.readFinalizedTransaction(request.signature);
      requireFinalizedWalletSigner(tx, request.wallet);
      const delta = verifyCpmmContributionDeltas(tx, {
        wallet: request.wallet, poolId: request.poolId, lpMint: verifiedOwnership.lpMint,
      });
      const contributionSlot = /** @type {number} */ (delta.slot);
      if (verifiedOwnership.poolContextSlot < contributionSlot ||
          verifiedOwnership.tokenAccountContextSlot < contributionSlot) {
        throw new Error('VERIFIER_OWNED_LP_PROVENANCE_PRECEDES_CONTRIBUTION');
      }
      if (delta.signature !== request.signature) throw new Error('CONTRIBUTION_SIGNATURE_MISMATCH');
      if (delta.lpDestinationTokenAccount !== verifiedOwnership.tokenAccount) {
        throw new Error('HISTORICAL_LP_POSITION_MISMATCH');
      }
      const observedAtSeconds = deps.nowSeconds();
      if (!Number.isSafeInteger(observedAtSeconds) || observedAtSeconds < 0) throw new Error('TRUSTED_TIME_INVALID');

      // Keep the raw verifier-owned receipt shape here. The downstream entitlement
      // boundary performs the single canonical receipt validation before composing it.
      const receipt = {
        ...delta,
        rpcProviders: tx.providers,
        observedAtSeconds,
        maxAgeSeconds: deps.maxReceiptAgeSeconds,
      };

      // Adapt only verifier-owned current-ownership facts. Current LP amount is intentionally omitted:
      // it proves neither historical contribution nor contributed KVRO amount.
      return composeContributionEntitlementEvidence(receipt, {
        verified: true,
        poolVerified: true,
        ownershipProven: true,
        wallet: verifiedOwnership.wallet,
        poolId: verifiedOwnership.poolId,
        lpMint: verifiedOwnership.lpMint,
        positionId: verifiedOwnership.tokenAccount,
        ownershipEvidenceId: JSON.stringify([
          verifiedOwnership.wallet,
          verifiedOwnership.poolId,
          verifiedOwnership.lpMint,
          verifiedOwnership.tokenAccount,
          verifiedOwnership.poolContextSlot,
          verifiedOwnership.tokenAccountContextSlot,
        ]),
      });
    },
    capabilities: Object.freeze({read:true,buildTransaction:false,signTransaction:false,sendTransaction:false}),
  });
}
