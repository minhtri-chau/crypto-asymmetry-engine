# Crypto Asymmetry Engine v5.5

Crypto Asymmetry Engine is a rules-first crypto research and decision-support dashboard. It is intentionally **not** a "magic buy/sell signal" product. The design goal is to make the thesis, valuation, buy rules, sell rules and thesis-break conditions explicit in advance, then surface when those rules or underlying evidence change.

Live production dashboard: `https://crypto-asymmetry-engine.vercel.app`

## Product philosophy

The Engine is built around three questions:

1. What deserves deeper research?
2. Is the setup attractive under rules defined in advance?
3. Has anything changed enough to require reassessment?

Research priority, live evidence, entry timing and portfolio rules are separate concepts. A high research score is not automatically a buy signal. A falling price is not automatically a bargain. Protocol growth is not automatically token-holder value capture.

## Research universe

Current tracked Coinbase-oriented research universe:

- AAVE
- PENDLE
- AERO
- AKT
- LINK
- TAO
- ONDO
- TIA
- SUI

The qualitative research snapshot is dated research context and must be refreshed before making current conclusions.

## Current data architecture

```text
CoinGecko --------\
                   \
DefiLlama ----------> React/Vite dashboard
                     |        |
                     |        +--> localStorage fallback
                     |
                     +--> Vercel server functions
                              |
                              +--> trends / market regime

Authenticated user
      |
      v
Supabase Auth
      |
      v
Supabase Postgres
  plans + snapshots
      |
      v
Row Level Security
auth.uid() = user_id
```

## Market data

CoinGecko supplies current market data including:

- price
- 24-hour change
- market capitalization
- fully diluted valuation
- 24-hour volume
- circulating supply
- total supply
- maximum supply

Supply ratios are used as **supply-overhang context only**. Circulating/max supply is not treated as an unlock calendar.

## Fundamentals

DefiLlama is currently mapped for:

- AAVE
- PENDLE
- AERO
- ONDO

Where supported, the dashboard loads:

- TVL
- 1-day / 7-day / 1-month TVL change
- 30-day and 7-day fees
- 30-day and 7-day protocol revenue
- 30-day holder revenue

Unsupported metrics stay blank. The application does not fabricate proxy values.

AKT, LINK, TAO, TIA and SUI still need asset-specific fundamental adapters.

## Research Score vs Live Evidence

**Research Score** is a qualitative research-priority snapshot.

**Live Evidence** is dynamic and calculated only from available live data. It currently combines a fundamental-momentum heuristic and valuation heuristic when both are available.

Derived screening metrics include:

- market cap / TVL
- FDV / TVL
- annualized fees / FDV
- annualized protocol revenue / FDV
- FDV / market cap
- fundamental momentum
- valuation subscore
- data coverage

These are screening metrics, not forecasts.

## Entry Score

Entry Score remains deliberately locked.

Before it is enabled, the project still needs enough reliable evidence for:

- valuation
- price setup
- catalyst proximity
- fundamental momentum
- capital flow
- dilution / exact unlock timing
- liquidity
- risk-reward

The application should never fill missing evidence with invented values simply to produce a score.

## Buy and sell plans

Each asset can store a user-defined plan containing:

- buy-below price
- take-profit price
- stop-loss price
- maximum FDV/TVL buy threshold
- fee-deterioration thesis alert
- position amount
- bought-at price
- written thesis / thesis-break condition

When a bought-at price exists, Portfolio can calculate current percentage P/L.

Rule priority is:

```text
risk -> profit-taking -> buy
```

This prevents a stop-loss condition from being hidden by a simultaneous buy-zone condition. Portfolio shows all triggered rules.

## Snapshot history

The original one-snapshot model was replaced by history. The browser retains up to 180 observations per asset.

Legacy v5/v5.1 data stored under `cae_snapshots` is migrated into `cae_snapshot_history`.

Snapshots contain market and fundamental observations so the dashboard can compare current evidence with prior observations.

## Trend and relative strength

Vercel server functions calculate:

- 50-day moving average
- 200-day moving average
- 30-day asset return
- 30-day relative strength versus Bitcoin

`/api/trends` uses small upstream batches, reuses Bitcoin history and caches results to reduce CoinGecko free-tier pressure.

Plain `npm run dev` does not run Vercel server functions. In that mode, the dashboard explicitly reports the trend feed as unavailable rather than remaining in an endless loading state.

## Market regime

`/api/regime` currently describes Bitcoin trend using price, 50-day MA and 200-day MA.

It does **not** yet infer:

- stablecoin capital flows
- Fear & Greed / sentiment
- broad altcoin breadth
- macro liquidity

Those are future inputs.

## Catalyst and token value capture

Catalyst and token-value-capture text is curated research metadata, not automatic live-event detection.

Holder revenue is displayed separately when the protocol data source exposes it.

The project explicitly avoids assuming that protocol revenue automatically accrues to the token.

## Unlocks

Exact unlock schedules are not automated yet.

A future unlock adapter should provide fields such as:

- next unlock date
- amount unlocked
- percentage of circulating supply
- 30-day and 90-day expected supply expansion
- emissions / inflation where relevant

The project should use a stable/licensed data source rather than scraping a public dashboard.

## Supabase setup completed

A Supabase project named `crypto-asymmetry-engine` has been created.

The database schema in `supabase.sql` has been successfully run and creates:

### `public.plans`

Stores user-owned plan data including entry, buy, take-profit, stop-loss, valuation rule, fee rule, amount and notes.

### `public.snapshots`

Stores user-owned historical market/fundamental snapshots.

### Security

Both tables have Row Level Security enabled.

Policies enforce:

```sql
auth.uid() = user_id
```

for user-owned operations.

Anonymous table access is revoked.

Authenticated users receive only the table operations required by the application.

The Supabase secret/service-role key must **never** be included in Vite frontend variables.

## Vercel configuration completed

Production environment variables have been configured:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

The publishable key is intentionally browser-safe. Authorization is enforced by Supabase Auth + RLS, not by hiding the publishable key.

Vite injects `VITE_*` variables at build time, so a deployment after these variables were created is required.

## v5.5 authenticated persistence

v5.5 connects the prepared infrastructure.

It adds:

- Supabase email/password authentication
- authenticated session restoration
- sign-in / sign-out UI
- account creation
- cloud loading of the signed-in user's plans and snapshots
- one-time migration of existing browser plans and snapshots into that user's Supabase account
- localStorage retained as a fallback/cache
- cloud writes when plans are created or changed
- cloud deletes when plans are deleted
- cloud writes for new snapshots
- visible persistence state: LOCAL STORAGE / SYNCING / CLOUD SYNCED / SYNC ERROR

The one-time migration marker is stored per Supabase user in localStorage. Local data is not deleted after migration.

## Authentication flow

1. User creates an account or signs in.
2. Supabase establishes an authenticated browser session.
3. RLS uses the authenticated user's ID.
4. On the first sign-in from an existing browser, local plans are upserted and local snapshot history is inserted.
5. Cloud rows are then loaded back into the application.
6. Subsequent plan/snapshot changes write to localStorage and Supabase.
7. Signing out returns the application to local-only behavior.

Email confirmation behavior depends on the Supabase Auth settings configured for the project.

## Security notes

Never store any of these in thesis notes:

- passwords
- exchange API secrets
- seed phrases
- wallet private keys
- Supabase secret/service-role keys

The portfolio database is for research and position metadata, not credentials.

Before treating the cloud layer as production-complete, test RLS with two separate users and confirm one account cannot read, modify or delete another account's rows.

## Version history

### v4 / v4.1
Introduced live CoinGecko market data and DefiLlama fundamentals. Fixed duplicate fundamentals loading, scanner visibility and zero-value handling.

### v5
Added Live Evidence, derived valuation metrics and browser comparison snapshots.

### v5.1
Added supply/dilution context, holder revenue, catalyst metadata and token-value-capture states.

### v5.2
Added buy/sell plans, portfolio rule evaluation, snapshot history and the first Vercel backend boundary.

### v5.3
Added 50/200-day moving averages, BTC relative strength, BTC trend regime, Bought at ($), P/L support and risk-first rule ordering.

### v5.4
Added secured Supabase schema with RLS, improved historical-price request reliability, explicit local server-function errors and Vercel/Supabase infrastructure preparation.

### v5.5
Adds Supabase Auth, authenticated cloud persistence, one-time local-to-cloud migration and visible sync state while retaining local fallback.

## Known limitations

- Alerts are still evaluated only while the application is running.
- Browser/push notifications are not implemented yet.
- Exact token-unlock calendars are not connected.
- Capital-flow feeds are not connected.
- Stablecoin-flow and sentiment regime inputs are not connected.
- Fundamental coverage is incomplete for AKT, LINK, TAO, TIA and SUI.
- Entry Score remains locked.
- CoinGecko free-tier historical requests can still occasionally fail.
- Cloud sync currently uses a local migration marker rather than a server-side migration ledger.
- Snapshot migration is intentionally append-only on first cloud migration, so repeated manual deletion of the local migration marker could duplicate historical snapshots.

## Planned sequence after v5.5

1. Verify Auth + RLS with real test accounts.
2. Add background rule evaluation and notifications.
3. Connect a reliable unlock provider.
4. Add stablecoin-flow and broader market-regime inputs.
5. Add fundamentals for AKT, LINK, TAO, TIA and SUI.
6. Build persistent "What Changed?" comparisons from historical snapshots.
7. Revisit Entry Score only after evidence coverage is sufficient.
8. Add more complete portfolio monitoring and reassessment workflows.

## Development

```bash
npm install
npm run dev
```

Plain Vite development does not execute Vercel server functions.

For full local behavior, use Vercel's local development workflow.

Production deploys from the GitHub `main` branch through Vercel.
