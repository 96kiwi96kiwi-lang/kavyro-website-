# PR #56 acceptance checklist

This checklist closes feature expansion for draft PR #56. It separates merge acceptance from any future liquidity-reward activation.

## Review baseline

- Code baseline: `559f52bcc555eeb91131350285009f2f4a9299eb` (before this checklist-only commit).
- Base: `main@3b31730acd8f0dd23f0fb98877458b62e253a0fb`.
- Local verification on 2026-11-09: `npm ci`, `npm run typecheck`, `npm test`; 325/325 tests passed.
- GitHub Actions run [#331](https://github.com/96kiwi96kiwi-lang/kavyro-website-/actions/runs/42569277670) did not execute observable test steps: its sole failed job exposes neither steps nor logs. It is not CI proof.

## Read-only evidence contract

- [x] Canonical KVRO identity is the exact mint `8KuWwmApUWyVBVraBdhknQwRuanw2qUwXzAJorqMAHvE`, never ticker-only identity.
- [x] RPC endpoints require HTTPS, reject URL credentials and redirects, and cannot share the same hostname.
- [x] Each provider independently returns the requested transaction and historical signature status.
- [x] The exact signature is first and unique in transaction evidence.
- [x] Signature status has no execution error, is `finalized`, has `confirmations === null`, and reports the same positive slot as the transaction.
- [x] Both providers agree on transaction evidence and finalized slot; one-sided absence or pruning ambiguity fails closed.
- [x] The finalized transaction binds the wallet signer, Raydium CPMM program, candidate pool, LP mint, canonical KVRO mint, deposit instruction accounts, KVRO debit, and LP mint credit.
- [x] Evidence carries positive slot and canonical block time; stale, future, reordered, malformed, or inconsistent facts fail closed.
- [x] Replay/dedup uses stable signature-bound evidence and persistent replay state.
- [x] Returned evidence is immutable and exposes no transaction build, sign, send, key, or payout capability.
- [x] Payout remains disabled by configuration and the payout gate.

## Merge acceptance

- [x] Scope is read-only evidence verification; no Pool ID, secret, signing path, or payout activation is committed.
- [x] Typecheck and the complete local test suite pass on the recorded code baseline.
- [ ] Final PR head receives an Actions run with visible test steps and passing typecheck/tests.
- [ ] Reviewer confirms the two-provider agreement, signature/slot binding, pool/mint/LP provenance, malformed-evidence rejection, and replay contract.
- [ ] Reviewer confirms the large accumulated PR has no unrelated or generated-file changes that should be split or discarded.

**Merge decision: HOLD** until all unchecked merge items are satisfied. Do not infer a pass from a runner/startup failure.

## Separate live-activation blockers

These items are not permission to merge unsafe code and are never implied by a merged PR:

- [ ] The official Raydium CPMM pool is independently verified on-chain without committing an unverified Pool ID.
- [ ] RPC operators are organizationally independent; distinct hostnames alone are insufficient evidence.
- [ ] A real historical signature is independently bound to wallet, official pool, LP mint, canonical KVRO mint, token deltas, slot, and time.
- [ ] Replay/reorg/dedup evidence is reviewed against live read-only observations.
- [ ] The owner gives explicit approval for any future activation.

**Payout decision: DISABLED.** This PR must not build, sign, send, or authorize an on-chain transaction.
