# Progress

## 2026-11-09

### Hotovo
- Compared draft PR #56 with `origin/main` `3b31730acd8f0dd23f0fb98877458b62e253a0fb`: the branch already contains that commit, so no merge was required.
- `7e50a1846bcaf06078de20984a263bb24ab2395e` binds finalized transaction evidence to signature status and fails closed on non-canonical evidence. A transaction signature must be byte-identical 64-byte base58, not merely equal after trimming. Transaction success and signature status require an own `err` of `null`. Deposit instructions and contribution receipts reject padded or control-character pool, LP mint, and KVRO mint aliases instead of trimming them into the canonical mint `8KuWwmApUWyVBVraBdhknQwRuanw2qUwXzAJorqMAHvE`.
- Parsed account-key `pubkey` values must be own data properties; accessors and descriptor traps fail closed without invoking getters or membership traps.
- Transaction message, account-key, transaction, and metadata containers must be own data properties.
- Verified on `7e50a1846bcaf06078de20984a263bb24ab2395e` at 2026-11-09T17:58:51Z before this documentation commit: `npm ci` exit 0, `npm run typecheck` exit 0, `npm test` exit 0 with 333 passed, 0 failed, 0 skipped. The payout gate still returns not authorized.

### Rozpracováno
- Draft PR #56 is ready for owner review of the read-only evidence binding. Merge stays on hold.

### Bloky
- Payout remains disabled until the official Raydium CPMM pool is independently verified on-chain and the owner explicitly approves activation.
- GitHub Actions runner startup is billing-locked, so a red Actions run with no test steps is not a test result.
- Live proof still requires a historical signature bound to the wallet, official pool, LP mint, and canonical KVRO mint, read from two organizationally independent RPC operators.

### Další priorita
- Owner review of the signature, finality, pool, LP mint, and evidence-origin binding. Do not enable payout, add a pool id, or treat a runner startup failure as a passing test.

## 2026-11-08

### Hotovo
- PR #56 validates untrusted Solana RPC stream read results before accessing `done` or `value`.
- Null results, non-boolean `done`, and throwing `done`/`value` getters cancel the reader and fail closed with the canonical malformed-body error.
- RPC `content-type` and `content-length` values must now be strings or null; object-shaped values cancel the body before any read and normalize to the canonical header error.
- RPC HTTP status metadata must now be a safe integer in the canonical `100–599` range; out-of-range values cancel the body before any read and fail closed.
- Malformed RPC readers with a usable cancellation method are now cancelled before rejection, including throwing `read` method accessors.
- Reader acquisition failures now use the response stream's direct cancellation path without repeating the failing `getReader()` call; synchronous and rejected cleanup failures remain contained.
- Reader validation now falls back to direct stream cancellation when an untrusted reader's `cancel` accessor itself is inaccessible.
- Late responses now also fall back to direct stream cancellation when their acquired reader cannot expose a callable cancellation method.
- Late response bodies that expose direct cancellation but no reader factory are now cancelled instead of being silently abandoned.
- Current pool and LP-account ownership observations must now come from slots at or after the finalized contribution transaction slot.
- Current ownership composition now independently binds both returned on-chain account addresses to the requested pool and LP token account.
- Current ownership verification rejects missing, padded, or non-string pool LP-mint identities before comparing the LP token account.
- Padded or control-character ownership request identities are rejected before any pool or token-account reader is invoked.
- Verified contribution composition now independently requires a positive bigint current LP balance from ownership evidence.
- Verified contribution composition now independently binds current ownership evidence to the Raydium CPMM pool type and rejects missing or CLMM evidence.
- Current ownership evidence must explicitly remain non-authoritative for historical contribution amount and payout; missing or elevated authority flags fail closed.
- Ownership evidence identity now deterministically binds wallet, pool, LP mint, LP token account, and both RPC context slots instead of using a position-only identifier.
- Verified contribution requests now reject padded or ASCII-control signature, wallet, pool, and LP-account identities before invoking either verifier or transaction reader.
- Validated request identities are snapshotted before ownership verification, preventing caller mutation across the first await boundary.
- Composition independently rejects padded, control-character, or non-string LP-mint identities returned by an ownership verifier.
- Validated ownership facts are snapshotted before finalized-transaction RPC I/O, preventing an injected adapter from rewriting evidence across the await boundary.
- Finalized transaction evidence now rejects top-level signatures that only match after trimming; response provenance must remain byte-for-byte canonical.
- Primitive finalized provenance is snapshotted once and reused by nested deposit verification, preventing changing response getters from rewriting signature, slot, or block time.
- The standalone delta verifier now rejects wallet, pool, or LP-mint expectations that only match after normalization.
- Standalone delta identity validation also rejects embedded ASCII control characters instead of treating them as an alternate scope.
- The expected Raydium CPMM program id must also remain canonical; padded or control-character aliases fail closed.
- Finalized transaction account keys must remain canonical; padded or control-character wallet and program aliases fail closed before balance-delta evaluation.
- Finalized token-balance mint and owner identities must also remain canonical; whitespace or control-character aliases fail closed before contributing deltas.
- Token amount evidence must expose an own data value; accessor-backed amounts fail closed without invoking untrusted getters.
- Throwing token-amount descriptor traps are contained and normalized without invoking proxy membership traps.
- Token-balance `uiTokenAmount` containers must be own data properties; accessor-backed containers fail closed without invoking their getters.
- Token-balance account index, mint, and owner fields are now snapshotted only from own data properties; accessors cannot rewrite or interrupt delta verification.
- The pre/post token-balance arrays themselves must now be own data properties; accessor-backed arrays fail closed without invoking untrusted getters.
- Final-head verification ran with `npm ci`, `npm run typecheck`, and `npm test`: 325/325 tests passed.

### Rozpracováno
- Draft PR #56 remains review-only and read-only; it cannot build, sign, send, or authorize payout transactions.

### Bloky
- Payout remains disabled until the official Raydium CPMM pool is independently verified on-chain and explicitly approved.
- Live proof still requires a historical signature, wallet/pool/LP-mint binding, and two organizationally independent RPC operators.
- GitHub Actions runner startup is currently blocked before test execution.

### Další priorita
- Complete the PR #56 acceptance checklist on the final head: visible passing CI steps and focused security review; do not add further feature scope.
