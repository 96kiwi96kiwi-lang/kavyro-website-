# Progress

## 2026-11-05

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
- Verified locally from the PR head with `npm ci`, `npm run typecheck`, and `npm test`: 304/304 tests passed.

### Rozpracováno
- Draft PR #56 remains review-only and read-only; it cannot build, sign, send, or authorize payout transactions.

### Bloky
- Payout remains disabled until the official Raydium CPMM pool is independently verified on-chain and explicitly approved.
- Live proof still requires a historical signature, wallet/pool/LP-mint binding, and two organizationally independent RPC operators.
- GitHub Actions runner startup is currently blocked before test execution.

### Další priorita
- Re-run final-head CI when Actions runners are available, then continue the smallest fail-closed provenance gap without adding an unverified pool ID.
