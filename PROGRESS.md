# Progress

## 2026-11-05

### Hotovo
- PR #56 validates untrusted Solana RPC stream read results before accessing `done` or `value`.
- Null results, non-boolean `done`, and throwing `done`/`value` getters cancel the reader and fail closed with the canonical malformed-body error.
- RPC `content-type` and `content-length` values must now be strings or null; object-shaped values cancel the body before any read and normalize to the canonical header error.
- RPC HTTP status metadata must now be a safe integer in the canonical `100–599` range; out-of-range values cancel the body before any read and fail closed.
- Malformed RPC readers with a usable cancellation method are now cancelled before rejection, including throwing `read` method accessors.
- Verified locally from the PR head with `npm ci`, `npm run typecheck`, and `npm test`: 297/297 tests passed.

### Rozpracováno
- Draft PR #56 remains review-only and read-only; it cannot build, sign, send, or authorize payout transactions.

### Bloky
- Payout remains disabled until the official Raydium CPMM pool is independently verified on-chain and explicitly approved.
- Live proof still requires a historical signature, wallet/pool/LP-mint binding, and two organizationally independent RPC operators.
- GitHub Actions runner startup is currently blocked before test execution.

### Další priorita
- Re-run final-head CI when Actions runners are available, then continue the smallest fail-closed provenance gap without adding an unverified pool ID.
