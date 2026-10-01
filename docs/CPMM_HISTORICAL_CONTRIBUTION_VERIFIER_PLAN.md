# CPMM Historical Contribution Verifier Integration Plan

Status: design/test preparation only. Rewards and payouts remain disabled/unauthorized.

## Security invariants

- Canonical KVRO mint: `8KuWwmApUWyVBVraBdhknQwRuanw2qUwXzAJorqMAHvE`.
- CPMM and CLMM evidence paths are separate. CLMM instructions/accounts must never satisfy CPMM contribution proof.
- Current LP-token balance proves only current ownership; it is never historical KVRO contribution evidence.
- Missing, ambiguous, incomplete, stale, malformed, or conflicting evidence fails closed.
- No transaction construction, signing, sending, payout, private key/seed handling, or paid-service dependency.

## Required verifier-owned chain

1. Read one exact transaction signature at `finalized` commitment.
2. Preserve RPC provenance: signature, slot, blockTime, transaction and meta.
3. Resolve all account keys used by the transaction, including versioned-message loaded addresses. Unresolved address-table/account indices fail closed.
4. Identify the Raydium CPMM add-liquidity instruction by verified program identity and CPMM instruction semantics. Do not infer CPMM from token transfers alone.
5. Bind the instruction to one independently verified pool account and its expected LP mint.
6. Bind the pool pair to canonical KVRO and the expected quote mint. Any pool/mint substitution fails closed.
7. Bind wallet/source token ownership to the contributor. Owner changes or ambiguous authority fail closed.
8. Derive historical KVRO contributed from transaction-local pre/post token evidence and instruction/account bindings. Never substitute current balances or estimate missing history.
9. Verify positive LP minting attributable to the same CPMM contribution and expected LP mint.
10. Require internally consistent finalized slot/blockTime provenance and freshness rules.
11. Only after every check succeeds, mint the module-private trusted contribution capability.
12. Eligibility must consume that capability, not a caller-supplied boolean.

## Test matrix before promotion

- valid finalized CPMM contribution;
- CLMM instruction with otherwise similar token movements;
- wrong Raydium/program identity;
- wrong pool, changed pool, or pool-account substitution;
- wrong LP mint or LP-mint change;
- wrong KVRO mint / ticker-only substitution;
- owner transfer, source-owner mismatch, or ambiguous authority;
- zero/negative/absent KVRO delta;
- current LP balance without historical transaction proof;
- LP transfer received from another wallet instead of LP minted by contribution;
- missing/corrupt preTokenBalances or postTokenBalances;
- unresolved loaded addresses / account indices;
- failed, missing, malformed, non-finalized, or unsupported-version transaction;
- stale blockTime, invalid slot, slot/time contradiction, or conflicting RPC provenance;
- duplicate/replayed signature and restart replay;
- observation gaps and out-of-order evidence;
- persisted corrupt data;
- forged `contributionProven: true` without trusted capability.

## Integration order

Keep the finalized transaction reader isolated. Add a pure CPMM decoder/binder next, with fixture-driven tests. Feed only its verified receipt into the private trusted-evidence promotion point. Then remove any eligibility path that can be satisfied by an untrusted boolean. Keep configuration `enabled:false` and pool state unverified until the real Raydium CPMM pool identity and LP mint are independently established.
