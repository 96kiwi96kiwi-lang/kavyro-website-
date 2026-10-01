# CPMM trust-boundary regression matrix

This is a test-preparation artifact for the historical KAVYRO CPMM contribution verifier.
It does not authorize payout and must not be used as evidence itself.

## Invariants

- Canonical KAVYRO mint: `8KuWwmApUWyVBVraBdhknQwRuanw2qUwXzAJorqMAHvE`.
- Only Raydium CPMM evidence is accepted. CLMM evidence must never be promoted or reused.
- Current LP balance is ownership evidence only; it is never historical contribution evidence.
- Missing, ambiguous, stale, conflicting, replayed, or corrupt data fails closed.
- Caller-supplied `contributionProven: true` is not a trust capability.
- Payout remains disabled/unauthorized.

## Security regression cases

| Case | Input mutation | Required result |
| --- | --- | --- |
| forged boolean | plain observation with `contributionProven: true` but no verifier-owned capability | reject |
| CLMM substitution | otherwise valid facts with CLMM program/pool type | reject |
| pool change | receipt pool differs from independently verified configured pool | reject |
| LP mint change | receipt LP mint differs from verified CPMM pool LP mint | reject |
| KVRO mint change | any mint other than canonical KAVYRO mint | reject |
| owner transfer | current LP owner did not receive LP mint in the contribution transaction | do not infer contribution; reject as contribution proof |
| transferred LP | wallet receives LP tokens by transfer rather than liquidity-add mint | reject |
| zero KVRO delta | no positive historical wallet-owned KVRO source debit | reject |
| missing balances | required pre/post token balance is absent | reject |
| corrupt balances | decimals/mint/owner/index data conflict | reject |
| unresolved ALT | required account key cannot be resolved from loaded addresses | reject |
| failed tx | transaction metadata reports an error | reject |
| non-finalized | RPC provenance is below finalized commitment | reject |
| stale time | block time exceeds allowed verifier freshness bound | reject |
| future/conflicting time | block time is after observation time or conflicts with trusted observation | reject |
| duplicate signature | same contribution receipt replayed after restart | reject/deduplicate without increasing contribution |
| duplicate period | repeated holding observation period | reject |
| duplicate slot/time | replayed observation slot or trusted timestamp | reject |
| gap | non-consecutive holding period sequence | reject |
| out of order | slot/time does not strictly advance | reject |
| persisted corruption | stored evidence cannot be revalidated exactly | quarantine/reject |
| restart replay | persisted evidence is ingested again after restart | idempotent; never double count |

## Required positive fixture

A positive test must be based on one raw, finalized Solana `getTransaction` response whose Raydium CPMM
liquidity-add semantics are decoded by verifier-owned code. The fixture must bind the transaction signature,
CPMM program, exact verified pool, LP mint, wallet-owned KVRO source, canonical KAVYRO mint, quote mint,
positive historical KVRO debit, positive LP minting, slot and block time.

Until that fixture and the actual pool identity are independently verified, there is no positive production
contribution proof. Tests must not fabricate a positive production claim merely to exercise the happy path.

## Integration order

1. Land the read-only finalized transaction reader.
2. Add verifier-owned account-key resolution and CPMM-only instruction identification.
3. Bind the instruction to independently verified pool/program/LP-mint/KAVYRO/quote identities.
4. Derive exact historical KVRO debit and LP mint from transaction metadata; never from current balances.
5. Promote only the verified result into the module-private trusted-evidence capability.
6. Change holding eligibility to require that capability rather than a caller boolean.
7. Add persistence/restart/replay tests before any reward proposal can consume the result.

Every returned eligibility/reward proposal must continue to carry `payoutAuthorized: false`.
