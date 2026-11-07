# Progress

## 2026-11-07

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
- Final-head verification ran with `npm ci`, `npm run typecheck`, and `npm test`: 316/316 tests passed.

### Rozpracováno
- Draft PR #56 remains review-only and read-only; it cannot build, sign, send, or authorize payout transactions.

### Bloky
- Payout remains disabled until the official Raydium CPMM pool is independently verified on-chain and explicitly approved.
- Live proof still requires a historical signature, wallet/pool/LP-mint binding, and two organizationally independent RPC operators.
- GitHub Actions runner startup is currently blocked before test execution.

### Další priorita
- Re-run final-head CI when Actions runners are available, then continue the smallest fail-closed provenance gap without adding an unverified pool ID.
