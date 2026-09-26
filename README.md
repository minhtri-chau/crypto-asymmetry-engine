# Crypto Asymmetry Engine v5.2

Rules-first decision support plus the first backend boundary.

## New
- Buy/sell plans per asset
- Buy-price, take-profit, stop-loss and FDV/TVL rules
- Thesis alert based on fee deterioration from the saved baseline
- Portfolio/Plans screen with triggered-rule indicators
- Snapshot history instead of a single overwritten snapshot, retaining up to 180 per asset
- Vercel `/api/market` proxy scaffold
- Vercel `/api/evidence` source-status endpoint
- Unlock/flow/catalyst adapter boundary so licensed/stable providers can be added without rewriting UI

## Intentional limitation
No unlock schedule is fabricated. Public DefiLlama unlock pages are useful for research, but stable programmatic unlock access is a premium endpoint. v5.2 therefore exposes an adapter-ready backend status instead of scraping the site.

Next:
1. Wire frontend market calls through `/api/market`
2. Choose persistent DB (Supabase/Postgres is a good fit)
3. Add licensed/reliable unlock provider
4. Add trend/relative-strength and market-regime feeds
5. Persist plans/snapshots server-side
