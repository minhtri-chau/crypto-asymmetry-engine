# Crypto Asymmetry Engine v5.7

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
Added Supabase Auth, authenticated cloud persistence, one-time local-to-cloud migration and visible sync state while retaining local fallback.

### v5.6
Hardens persistence: newest-180-per-asset cloud loading, account-scoped caches, isolated signed-out guest edits, shared-browser migration protection, `.gitignore`, exact dependency pins and committed npm lockfile.

A compatibility guard was subsequently added to v5.6: if the browser already completed the v5.5 cloud migration (`cae_cloud_migrated_<uid>`), v5.6 must **not** re-upload the legacy snapshot keys. This guard is required in all later versions.

### v5.7
Adds database-side snapshot retention, upgrades Vite from 7.1.7 to 7.3.6, preserves the v5.5 migration compatibility guard, and documents Supabase Scheduler as the intended home for future background monitoring.

## v5.6 persistence hardening

v5.6 fixes four persistence/build issues found during review:

- Snapshot cloud reads are now **per symbol, newest 180 first**, then reversed for chronological display. This avoids Supabase's default 1,000-row response ceiling causing stale history after roughly 111 nine-asset saves.
- Signed-out edits live in a dedicated **guest workspace**. They are not silently overwritten into, or merged with, a signed-in account.
- Signed-in browser caches are **scoped by Supabase user ID**, preventing one user's cached portfolio from becoming another user's migration source on a shared browser.
- Legacy pre-v5.6 local data is claimable only once by the first account migration on that browser. Account-scoped caches are never treated as migration input.
- Added `.gitignore` for `node_modules`, build output, Vercel metadata, logs and all `.env*` files except `.env.example`.
- Runtime/build dependencies are pinned to exact versions and `package-lock.json` is committed for reproducible Vercel installs.

The database may retain more than 180 snapshots per asset. The UI intentionally loads only the newest 180 per asset. A future retention job can prune older cloud history if long-term archival is not desired.


## v5.7 database retention and build hardening

### Snapshot retention

The database now includes `public.prune_snapshot_history()` plus an `AFTER INSERT` trigger. After each cloud snapshot insert, Postgres removes rows older than the newest **180 snapshots for that same user and symbol**.

This makes the database retention policy match the browser/UI history policy and prevents unbounded snapshot growth. Retention is enforced in Supabase rather than by browser JavaScript, so closing the dashboard does not disable it.

The pruning function is `SECURITY DEFINER`, has a fixed `search_path`, accepts no user-controlled identifiers, and derives `user_id` and `symbol` only from the row that fired the trigger. Execute permission is revoked from `public`, `anon`, and `authenticated`; it is invoked only by the trigger.

**Deployment step:** run the updated `supabase.sql` in the Supabase SQL Editor after deploying v5.7. Existing rows above the 180-row limit are pruned the next time a new snapshot is inserted for that user/symbol. If immediate cleanup of old rows is desired, run a one-time cleanup separately.

### Migration compatibility rule

Do not remove this behavior:

```text
If cae_cloud_migrated_<uid> exists, the browser already migrated under v5.5.
Mark the legacy cache claimed and do not insert those legacy snapshots again.
```

v5.5 wrote cloud data back into the old browser keys. Without this guard, a later migration version can mistake those rows for never-uploaded legacy data and duplicate them.

### Vite security update

`package.json` moves Vite from `7.1.7` to `7.3.6`.

The repository's **real npm-generated `package-lock.json` is the canonical lockfile**. The v5.7 patch package intentionally does not replace it with a generated placeholder. After applying the patch, run:

```bash
npm install
npm run build
```

Commit the resulting real `package-lock.json` only after the build succeeds.

### Background monitoring direction

Future recurring rule evaluation should run from **Supabase Scheduler / pg_cron**, not from a browser timer. The browser remains the control panel; scheduled database/server work should continue when the dashboard is closed.

The future scheduler should evaluate user-defined rules and create reassessment events. It should not place trades or infer undocumented buy/sell decisions.

## Known limitations

- Alerts are still evaluated only while the application is running.
- Browser/push notifications are not implemented yet.
- Exact token-unlock calendars are not connected.
- Capital-flow feeds are not connected.
- Stablecoin-flow and sentiment regime inputs are not connected.
- Fundamental coverage is incomplete for AKT, LINK, TAO, TIA and SUI.
- Entry Score remains locked.
- CoinGecko free-tier historical requests can still occasionally fail.
- Cloud sync currently uses local migration markers rather than a server-side migration ledger.
- Manually deleting migration markers can defeat migration safeguards and should not be treated as a supported reset mechanism.

## Planned sequence after v5.7

1. Run the v5.7 Supabase retention migration and verify Auth + RLS with real test accounts.
2. Add Supabase-scheduled background rule evaluation and notifications.
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

## v5.8 background monitoring foundation

v5.8 adds a server-side monitoring path so saved rules can be evaluated while the browser is closed.

- `public.monitor_state` stores the current active/inactive state of each saved rule. It is server-worker-only.
- `public.monitor_events` stores transitions into a triggered state. Authenticated users can read only their own events through RLS.
- `supabase/functions/monitor/index.ts` fetches current CoinGecko market data and supported DefiLlama fundamentals, evaluates saved buy-price, take-profit, stop-loss, FDV/TVL and fee-deterioration rules, and creates an event only on a false -> true transition.
- When a condition clears, the open event is resolved and the state resets. A later false -> true transition can create a new event.
- The Alerts page now reads active `monitor_events` for the signed-in user.
- `supabase/monitor-cron.sql` is a deployment template for a five-minute Supabase Cron heartbeat. Store the project URL and monitor secret in Vault. The same `MONITOR_CRON_SECRET` must be configured as an Edge Function secret.

The worker does not place trades. It records reassessment events from rules the user already defined.

### v5.8 deployment order

1. Run the updated `supabase.sql` in the Supabase SQL Editor.
2. Deploy the `monitor` Edge Function with JWT verification disabled as specified in `supabase/config.toml`.
3. Generate a long random value and save it as the Edge Function secret `MONITOR_CRON_SECRET`.
4. Store the project URL and the same monitor secret in Supabase Vault.
5. Run `supabase/monitor-cron.sql` after replacing/setup of the Vault values.
6. Inspect Cron job history and Edge Function logs after the first run.
7. Sign in to the dashboard and use Alerts to view active reassessment events.

Do not put `MONITOR_CRON_SECRET` or a Supabase secret/service-role key in any `VITE_*` variable or frontend file.


## v5.8.1 authentication hotfix

- Validates and trims the email before password sign-in/sign-up.
- Prevents auth actions until an email and a password of at least 6 characters are present.
- Makes account creation explicitly prevent the form submit path before calling Supabase Auth.
- Preserves the v5.5 duplicate-migration compatibility guard and all v5.8 monitor code.


## v5.9 monitoring quality release

v5.9 intentionally keeps notifications inside the web app. No email provider is required.

- Active and Resolved tabs on Alerts, with observed value, threshold, trigger time and resolution time.
- Deleted plans and removed rules no longer leave stale active alerts. The monitor resolves the event and removes obsolete monitor state on the next cron run.
- Changing a rule threshold resets that rule. If the new threshold is already triggered, a fresh event is created for the new threshold.
- The worker fetches DefiLlama data only when a saved rule needs TVL or fee data, and uses direct per-protocol requests instead of downloading the complete protocol directory every five minutes.
- Optional CoinGecko Demo API authentication is supported through the Edge Function secret `COINGECKO_DEMO_API_KEY`. The worker still works without it using the public endpoint.
- The v5.8 TypeScript numeric narrowing fixes are preserved.
- The v5.5/v5.6 duplicate-snapshot migration compatibility guard is preserved.

### v5.9 deployment

1. No database schema change is required. Re-running `supabase.sql` is safe but optional.
2. Deploy the updated `supabase/functions/monitor/index.ts` over the existing `monitor` Edge Function.
3. Keep JWT verification disabled for `monitor`; it continues to authenticate the cron request with `MONITOR_CRON_SECRET`.
4. The existing five-minute Cron job does not need to be recreated.
5. Optional: create a CoinGecko Demo key and store it only as the Edge Function secret `COINGECKO_DEMO_API_KEY`.
6. Push the frontend files to GitHub `main`; Vercel will deploy the Active/Resolved Alerts UI.


## v6.0 What Changed

v6.0 turns saved snapshots into a comparison layer instead of a passive history list.

- Dashboard `What changed?` ranks assets by the largest absolute percentage move among comparable snapshot metrics.
- Asset detail pages show price, market cap, FDV, TVL, 30d fees, 30d revenue, circulating supply and FDV/TVL changes when the data exists.
- A 3% display threshold separates material dashboard changes from small snapshot-to-snapshot noise. The raw metric changes remain visible on the asset page.
- Comparisons use the previous saved snapshot when at least two snapshots exist; with one snapshot, that snapshot becomes the baseline.
- Current live values are compared against the saved baseline, so a new snapshot is not required just to see movement.
- This is descriptive monitoring, not an automatic buy/sell score.
- No database migration or monitor redeployment is required for the What Changed frontend itself.

### Carry-forward regression rules

Future releases must preserve all three known fixes:
1. Keep the v5.5/v5.6 duplicate-snapshot migration compatibility guard.
2. Keep the monitor TypeScript numeric non-null/narrowing fixes.
3. For current DefiLlama TVL in the monitor, use `/tvl/{slug}` and treat the response as a scalar number. Do not replace it with `/protocol/{slug}`, which returns historical TVL series data.


## v6.1 Daily memory + fixed comparison periods

v6.1 gives What Changed a regular clock instead of relying only on manual saves.

- New `daily-snapshot` Supabase Edge Function captures one snapshot per tracked asset per authenticated account per UTC day.
- A separate Cron job calls it daily at 00:15 UTC.
- It reuses the existing `snapshots` table and the v5.7 180-row-per-user/symbol retention trigger, so no schema migration is required.
- Manual snapshot saving remains available.
- Daily capture skips a symbol if that account already has a snapshot for that UTC day, preventing the scheduled run from adding a second daily row after a manual save.
- What Changed now offers `Latest`, `7D`, and `30D` baselines.
- 7D/30D select the closest stored snapshot at or before the target date. Until enough daily history exists, the UI says the baseline is unavailable instead of pretending a shorter period is equivalent.
- The UI labels comparisons `LIVE + SNAPSHOT` when current feeds are available and `SNAPSHOT-ONLY FALLBACK` when it must rely on stored observations.

### v6.1 deployment

1. Push the frontend and new Supabase files to GitHub `main`, preserving the genuine existing `package-lock.json`.
2. In Supabase Edge Functions, create/deploy a new function named exactly `daily-snapshot` from `supabase/functions/daily-snapshot/index.ts`.
3. Keep legacy JWT verification OFF for `daily-snapshot`, matching `supabase/config.toml`. The function authenticates the scheduled call with the existing `MONITOR_CRON_SECRET`.
4. No new secret is required. It reuses `MONITOR_CRON_SECRET`, and optionally uses the existing `COINGECKO_DEMO_API_KEY` if configured.
5. Run `supabase/daily-snapshot-cron.sql` once in the SQL Editor. It reuses the existing Vault secrets `project_url` and `monitor_cron_secret`.
6. The schedule is `15 0 * * *`, or 00:15 UTC daily. Supabase Cron uses standard cron scheduling; inspect the job's History in the Dashboard after the first run.
7. The existing five-minute `monitor` function and Cron job do not need to be changed or redeployed for v6.1.

### Carry-forward regression rules

Future releases must preserve:
1. The v5.5/v5.6 duplicate-snapshot migration compatibility guard.
2. The monitor TypeScript numeric non-null/narrowing fixes.
3. Current DefiLlama TVL uses `/tvl/{slug}` as a scalar number in both monitor and daily snapshot workers. Never substitute `/protocol/{slug}` for current TVL.


## v6.2 Decision Radar

v6.2 converts What Changed measurements into transparent reassessment prompts.

- Dashboard Decision Radar has two separate lanes: `ENTRY RESEARCH` and `POSITIONS TO REVIEW`.
- Entry research combines the existing qualitative Research Snapshot with observed fundamental change, FDV/TVL change, price-vs-fundamentals divergence, 50D/200D trend and saved buy rules.
- Position review gives saved risk and take-profit rules priority, then checks fundamental deterioration and price outrunning fundamentals.
- Asset pages show the signal, the reasons behind it, the comparison period and the underlying price/TVL/fees/revenue/FDV-TVL changes.
- Labels intentionally say `Entry setup improving`, `Worth deeper entry review`, `Hold / monitor`, `Profit-taking review`, `Exit / thesis review`, etc. They are evidence-based prompts, not autonomous orders.
- Confidence is lower when only Latest snapshot history exists and improves when fixed-period history is available.
- No database or Edge Function changes are required for v6.2 itself.
- v6.2 carries forward the deployed v6.1 Admin API user-enumeration fix in `daily-snapshot`.

This is an important bridge toward the end goal, but it is not yet a complete "best buy now / sell now" engine. Exact unlock timing, broader capital-flow/regime inputs, and deeper fundamentals for AKT/LINK/TAO/TIA/SUI remain prerequisites before treating the radar as a comprehensive crypto decision layer.


## v6.3 Signal quality cleanup

v6.3 tightens the Decision Radar before adding more breadth.

- 7D reassessment now uses `fees7d` / `revenue7d` rather than changes in overlapping rolling-30D totals. Daily snapshots persist those 7D totals so the current 7-day window can be compared with the prior saved 7-day window.
- 30D reassessment continues to use 30D fees/revenue.
- Static Research Score no longer contributes points that can qualify an asset for Entry Research by itself. It remains context. Entry Research requires at least one fresh positive condition such as improving fundamentals, valuation compression, favorable price/fundamental divergence, or a triggered saved buy rule.
- A constructive trend only adds confirmation after fresh positive evidence exists.
- Plans now have an explicit `I currently own this asset` flag. Portfolio and `POSITIONS TO REVIEW` include only assets marked owned.
- AKT, LINK, TAO, TIA and SUI are labeled `Limited evidence` in the Decision Radar until protocol-specific fundamentals are connected. Price/trend alone no longer masquerades as a fundamental setup.
- Confidence is explicitly `limited` for those thin-data assets.
- Existing plans migrate safely with `is_owned=false`; users opt holdings in deliberately.

### v6.3 deployment

1. Push v6.3 to GitHub while preserving the genuine current `package-lock.json`.
2. Run the updated `supabase.sql` once. The migration only adds `plans.is_owned`, `snapshots.fees_7d`, and `snapshots.revenue_7d`.
3. Redeploy the existing `daily-snapshot` Edge Function from the repo so future snapshots store the new 7D activity fields.
4. Do not recreate either Cron job. The existing daily schedule will call the updated function automatically.
5. The five-minute `monitor` function does not need redeployment for v6.3.
6. Existing historical snapshots will naturally have blank 7D activity fields. The 7D fee/revenue comparison becomes available after new v6.3 snapshots accumulate; the UI will not fabricate missing history.


## v6.5 fundamentals + immediate 7D evidence

- Moves fundamentals aggregation behind `/api/fundamentals`.
- Adds Chainlink protocol fundamentals.
- Adds Sui and Celestia chain TVL/activity adapters.
- Adds Bittensor chain TVL plus a clearly labeled Chutes paid-AI-revenue ecosystem proxy.
- Adds live Akash provider CPU/GPU utilization from Akash's public Console API. It is displayed but is not used as a historical growth signal because the source does not provide the required period history.
- Uses DefiLlama's source-native `change_7dover7d` where available, so fee/revenue momentum can be evaluated immediately instead of waiting seven days for local snapshots.
- Snapshot history remains the fallback and is still useful for price, valuation and independent auditability.
- No database migration, Supabase Edge Function change or Cron change is required for v6.5.


## v6.6 data-consistency release

- Preserves the v6.5 production fixes: 7D fee/revenue change is calculated from daily history, and parent-protocol TVL uses `/tvl/{slug}` plus child/version changes.
- Adds CoinGecko 7D price return to `/api/trends`; Decision Radar uses that 7D price when it uses source-native 7D fundamentals, avoiding mixed-period "price outran fundamentals" comparisons.
- Leaves unavailable 1-month protocol TVL change blank instead of inventing it.
- Adds a shared Supabase worker fundamentals adapter so monitor and daily snapshots use the same TVL/fee definitions.
- Daily snapshots now record supported fundamentals for LINK, SUI, TIA and TAO as well as the original four protocol assets. AKT provider utilization remains live-only because the snapshot schema does not have a compute-utilization field.
- Monitor expands protocol TVL/fee rules to LINK, and chain fee monitoring to SUI/TIA/TAO. SUI may use chain TVL for FDV/TVL; TAO and TIA deliberately do not because their chain-TVL semantics make that ratio misleading or unusable.
- Existing Cron schedules do not change. Redeploy both `monitor` and `daily-snapshot` Edge Functions because their code and shared helper changed.
- No database migration is required.


## v6.6.1 hotfix
- Edge Functions are self-contained for Supabase Dashboard copy/paste deployment. `_shared/fundamentals.ts` is no longer required.
- Restores aligned 7D FDV/TVL change in Decision Radar using `(1 + 7D price)/(1 + 7D TVL) - 1`.
- Applies that valuation signal only to AAVE, PENDLE, AERO, LINK, ONDO and SUI. TAO/TIA remain excluded because their chain-TVL semantics are not suitable for this valuation ratio.
- No SQL or Cron changes.


## v7 Dynamic Discovery

v7 separates the permanent research/portfolio layer from a changing discovery universe.

- `/api/discovery` starts from currently online Coinbase USD/USDC spot markets, then matches those symbols to CoinGecko market data.
- Stablecoins, fiat quote assets, the existing nine research assets, very small markets (<$25M market cap), and very thin markets (<$2M 24h volume) are excluded from the candidate screen.
- Discovery Score is a transparent triage heuristic using liquidity, market size, 7D/30D momentum, supply overhang, and an extension penalty. It is **not** an Entry Score and is not a buy recommendation.
- Scanner now shows `Dynamic discovery` above the persistent `Deep research & watchlist`.
- The current nine assets remain tracked for history, plans, ownership, monitoring and deeper fundamentals. Discovery candidates do not silently become researched assets.
- Promotion into the research list remains evidence-gated. A later release can persist candidate lifecycle states and add automatic fundamental adapters where reliable.

### v7 deployment

Push the frontend and `api/discovery.js` to GitHub `main`; Vercel deploys them together. No Supabase SQL migration, Edge Function redeploy, Cron change, secret change, or dependency change is required.


## v7.1
Discovery now uses relative ranking, much stronger recent-gain penalties, best-effort DefiLlama TVL/fee evidence, sequential CoinGecko requests, and server-only CoinGecko Demo-key support. It remains research triage, not a buy score.


## v7.2: rank is not quality

v7.2 separates two concepts that v7.1 mixed together:

- **Research Priority** is the candidate's relative rank among today's eligible Coinbase universe. Someone will always be #1.
- **Asymmetry Evidence** is an absolute 0-100 evidence score based on the underlying screen. A weak market can therefore have a #1 candidate with a mediocre evidence score.
- **Evidence Coverage** shows how much of the intended evidence set is actually present. Market-only candidates no longer look equally complete beside candidates with matched fundamentals.
- The user's production identity fix is preserved: DefiLlama matching uses CoinGecko ID first, with ticker fallback only for child protocols in a named project family.
- The user's production stablecoin fix is preserved: expanded stablecoin exclusions plus a near-$1/low-volatility peg heuristic.
- Large recent gains retain the strong v7.1 extension penalty.
- Chain transaction fees are activity evidence and must not be interpreted as equivalent to protocol/token-holder revenue.


## v8 Research Pipeline

v8 turns Discovery into a persistent lifecycle.

`Discovery -> Active Research -> Watchlist -> Archived`

A signed-in user can promote a Discovery candidate into Active Research. The asset then remains in Supabase even if it disappears from the current Discovery top 25.

The new `research-monitor` Edge Function evaluates every non-archived research asset daily using the same early-asymmetry concepts as Discovery: liquidity, supply overhang, mild price confirmation, strong extension penalties, and identity-safe DefiLlama fundamentals where available. It records an immutable evaluation history.

Evaluation states:
- `strengthening`: evidence and coverage support deeper entry research.
- `monitor`: no material deterioration signal.
- `reassess`: evidence fell materially or price appears substantially repriced.
- `archive_candidate`: a non-owned asset has sufficiently weak, well-covered evidence to consider retiring.
- `reduce_exit_review`: the same deterioration on an owned asset. This is a review prompt, not an automatic sell instruction.

Missing fundamentals are treated as missing evidence. Low coverage limits confidence; it is not described as proof of weak fundamentals.

Research assets can be marked Owned with amount and entry price, allowing the pipeline to show P/L and change deterioration language from archive review to reduce/exit review.

The original nine curated research assets remain intact in v8. Dynamic research candidates are a separate persistent layer so the existing monitoring and migration logic is not destabilized.
