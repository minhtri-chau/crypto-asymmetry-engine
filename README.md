# Crypto Asymmetry Engine v5.3

Rules + trend/regime + persistence foundation.

## v5.2 bug fixes
- Adds Bought at ($), enabling Portfolio P/L
- Rule priority is risk -> profit -> buy, so a stop-loss cannot be hidden by a buy-zone hit
- Automatically migrates legacy `cae_snapshots` into snapshot history
- Keeps local plans/snapshots working while database setup is pending

## v5.3
- Server-side 50-day and 200-day moving averages
- 30-day asset return and relative strength vs Bitcoin
- BTC trend-based market regime
- `/api/trends` and `/api/regime` with Vercel caching
- Supabase/Postgres schema for plans and snapshot history
- Existing `/api/evidence` remains the adapter boundary for unlocks, flows and catalysts

## Not yet claimed
- No reliable automatic unlock schedule until a stable/licensed provider is connected
- No background push notifications yet
- No fear/greed or stablecoin-flow regime input yet
- AKT/LINK/TAO/TIA/SUI still need asset-specific fundamental adapters
- Supabase schema is included, but frontend remains local-first until credentials/auth are configured
