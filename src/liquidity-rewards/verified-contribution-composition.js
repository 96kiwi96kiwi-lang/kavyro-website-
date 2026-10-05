// Read-only production composition for verifier-owned CPMM contribution evidence.
// Caller supplies identity only; LP mint and contributed KVRO amount come from independent verifiers.
import { WRAPPED_SOL_MINT } from './config.js';
import { verifyCpmmContributionDeltas } from './cpmm-contribution-delta-verifier.js';
import { verifyCpmmContributionReceipt } from './cpmm-contribution-receipt.js';
import { composeContributionEntitlementEvidence } from './contribution-entitlement-evidence.js';

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
      if (!request || typeof request.signature !== 'string' || !request.signature.trim() ||
          typeof request.wallet !== 'string' || !request.wallet.trim() ||
          typeof request.poolId !== 'string' || !request.poolId.trim() ||
          typeof request.tokenAccount !== 'string' || !request.tokenAccount.trim()) {
        throw new Error('VERIFIED_CONTRIBUTION_REQUEST_INVALID');
      }

      const ownership = await deps.ownershipVerifier.verifyCurrentOwnership({
        wallet: request.wallet, poolId: request.poolId, tokenAccount: request.tokenAccount,
      });
      if (!ownership || ownership.verified !== true || ownership.evidenceKind !== 'CURRENT_CPMM_LP_OWNERSHIP' ||
          ownership.wallet !== request.wallet || ownership.poolId !== request.poolId ||
          ownership.tokenAccount !== request.tokenAccount || typeof ownership.lpMint !== 'string' || !ownership.lpMint) {
        throw new Error('VERIFIER_OWNED_LP_EVIDENCE_REQUIRED');
      }

      const tx = await deps.transactionReader.readFinalizedTransaction(request.signature);
      const delta = verifyCpmmContributionDeltas(tx, {
        wallet: request.wallet, poolId: request.poolId, lpMint: ownership.lpMint,
      });
      const observedAtSeconds = deps.nowSeconds();
      if (!Number.isSafeInteger(observedAtSeconds) || observedAtSeconds < 0) throw new Error('TRUSTED_TIME_INVALID');

      const receipt = verifyCpmmContributionReceipt({
        ...delta,
        quoteMint: WRAPPED_SOL_MINT,
        observedAtSeconds,
        maxAgeSeconds: deps.maxReceiptAgeSeconds,
      });

      // Adapt only verifier-owned current-ownership facts. Current LP amount is intentionally omitted:
      // it proves neither historical contribution nor contributed KVRO amount.
      return composeContributionEntitlementEvidence(receipt, {
        verified: true,
        poolVerified: true,
        ownershipProven: true,
        wallet: ownership.wallet,
        poolId: ownership.poolId,
        lpMint: ownership.lpMint,
        positionId: ownership.tokenAccount,
        ownershipEvidenceId: `${ownership.tokenAccount}:${ownership.poolContextSlot}:${ownership.tokenAccountContextSlot}`,
      });
    },
    capabilities: Object.freeze({read:true,buildTransaction:false,signTransaction:false,sendTransaction:false}),
  });
}
