# KAVYRO Website

Repository for KAVYRO development.

Official token mint: `8KuWwmApUWyVBVraBdhknQwRuanw2qUwXzAJorqMAHvE`

## Liquidity Rewards

The `src/liquidity-rewards/` module is a **read-only, fail-closed** pipeline:

discovery → verification → observation → eligibility → payout-gate

### Safety

- Rewards remain **disabled** until an official Raydium pool is independently verified on-chain.
- No unverified Pool ID is stored in this repository.
- No transaction building, signing, or sending.
- No private keys or secrets.
- Payout is never authorized by this module alone.

See [src/liquidity-rewards/ARCHITECTURE.md](src/liquidity-rewards/ARCHITECTURE.md) for the full security contract and data flow.

### Commands

```bash
npm ci
npm run typecheck
npm test
```
