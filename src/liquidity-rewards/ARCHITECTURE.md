# Liquidity Rewards architecture

## Security invariants

This module is read-only and fail-closed. The canonical KAVYRO identity is the Solana mint `8KuWwmApUWyVBVraBdhknQwRuanw2qUwXzAJorqMAHvE`; ticker text is never an identity signal. No component in this module may build, sign, submit, or broadcast a transaction, hold a private key/seed phrase, or authorize a payout by itself. Unknown, stale, malformed, conflicting, duplicated, or unverifiable data is rejected rather than treated as eligible.

## Data flow

### 1. Discovery

Raydium discovery is only a source of candidate pool IDs. Discovery is constrained by the canonical KVRO mint and the expected counter-mint; ticker/name matching is not accepted. A discovery result is not proof that a pool is official, safe, or reward-eligible.

### 2. Verification

Every candidate must cross an independent read-only Solana RPC boundary. Verification checks that the account exists at the required commitment, is owned by an explicitly supported Raydium program, has the expected account layout/discriminator, is not executable where a pool state must be data, and decodes to the exact canonical KVRO mint pair. A candidate remains unverified if any check cannot be established. API metadata cannot override an RPC verification failure.

### 3. Observation

`collectSafeObservations` may consume only independently verified pools. Observations are read-only facts with provenance/freshness information. Stale observations, duplicates, identity conflicts, gaps that violate the configured observation policy, and unverifiable provider responses are rejected. Observation collection cannot create reward entitlement by itself.

### 4. Eligibility

Eligibility is derived from a sustained sequence of valid observations under the configured holding/observation policy. Short-lived liquidity that does not survive the required periods must not qualify. Reward calculations use the policy-defined conservative basis and must not infer missing periods. An eligibility result is a claim candidate, not payout authorization.

### 5. Payout gate

The payout gate is the final fail-closed decision boundary. It may inspect verified identity, observation history, eligibility, reward-ledger state, reconciliation and integrity/audit evidence. A failed, missing, stale, conflicting, unreconciled, or unaudited prerequisite closes the gate.

Even a successful gate evaluation does **not** send funds and does **not** grant this module transaction capability. It can only produce a reviewable payout candidate for a separate manual approval process.

## Payout authorization boundary

### What can contribute to a payout candidate

A candidate may be produced only after all required evidence is present: canonical mint identity, independently verified pool, acceptable read-only observations, completed holding/eligibility policy, persistent ledger/reconciliation state, and successful integrity/audit checks.

### What cannot authorize payout

None of the following can authorize payout alone or in combination without the separate manual approval boundary: Raydium discovery/API output; ticker or token name; a pool ID supplied by a user/configuration; a single LP snapshot; provider metadata; an eligibility calculation; a reward-ledger row; a passing automated test/CI run; or a payout-gate result.

The Liquidity Rewards code must not contain wallet secrets, private keys, seed phrases, signing callbacks, transaction builders, send/broadcast functions, or automatic payout jobs. Manual approval is intentionally outside the read-only pipeline. Until that separate approval exists and all prerequisites are valid, payout is denied.

## Failure model

Network/RPC errors, parser errors, unsupported Raydium layouts/programs, stale slots/data, duplicate/conflicting observations, canonical-mint mismatches, ledger integrity failures, reconciliation differences, and missing manual approval all resolve to rejection/disabled payout. There is no permissive fallback.
