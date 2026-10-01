# Crypto Asymmetry Engine — project context

Last reviewed: 2026-10-01. Code baseline: GitHub `main`, commit `002c15a` (v10.7 plus the sourced-research token-budget fix).

This is the durable handoff for collaborators. It summarizes release documents, current code, and recovered decisions from the **Analyze YouTube video** and **Chat Context Transfer** conversations. It is a summary, not a verbatim transcript. Release instructions describe what a release required; their existence does not prove those steps succeeded in production. Current code and later explicit decisions supersede older release instructions. Read the linked release document for exact SQL/deployment steps. This file merges the earlier short `PROJECT_CONTEXT.md` (shipped in the v10.7 ZIP) into this fuller version; every point from the short file is covered here.

## 1. Product goal and user preferences

- Find asymmetric upside opportunities that the user can trade on Coinbase. The universe must evolve with the market rather than stay fixed to the original nine coins.
- Answer two practical questions: which non-owned coins deserve research or offer an attractive entry now, and whether owned coins warrant holding, reassessment, profit-taking or exit review.
- “Nothing qualifies; wait” is a valid result. Do not force a buy recommendation from the highest scanner rank.
- ChatGPT is the research/reasoning partner; the web dashboard provides persistent evidence, monitoring and intuitive interaction. The app does not execute trades.
- Prefer automated, sourced research over hand-typed conviction numbers or repeated manual mapping SQL. Preserve uncertainty where automation cannot obtain reliable evidence.
- Alerts are viewed in the app. Email and Telegram notifications are not active and should not be reintroduced without a request.
- Usual delivery: actual changed source and instructions in a ZIP; the user copies into their local checkout, commits and pushes. Do not deliver instructions-only packages as implementations.
- Supabase deployments have commonly used complete function files pasted into the dashboard editor. Clearly identify which functions need redeployment; frontend pushes do not redeploy Supabase workers.

Project links:
- Repository: https://github.com/minhtri-chau/crypto-asymmetry-engine
- App: https://crypto-asymmetry-engine.vercel.app/
- Vercel: https://vercel.com/nick-chau/crypto-asymmetry-engine
- Supabase: https://supabase.com/dashboard/project/cdoapzksplgcxjwuddmx

## 2. Non-negotiable evidence and score semantics

| Concept | Meaning / rule |
| --- | --- |
| Research Priority | Relative scanner triage within today's eligible Coinbase universe. A rank change can result from other assets or refreshed evidence; rank is not a buy signal. |
| Setup Evidence | Absolute current quantitative condition score. Current version is `setup-v3`; preserve its normalization, extension penalties and provenance. |
| Thesis Strength | Longer-lived automated research judgment, separate from price setup. Initial curated/manual thesis scores are historical implementation, not the present design goal. |
| Coverage | Completeness of evidence, separate from its strength. Setup Coverage, Thesis Coverage and adoption-panel coverage are distinct. |
| Current vs daily Setup | Current Setup agrees across Scanner and Research from the same live model. Last daily evaluation is a timestamped saved observation; differences must remain visible. |
| Entry vs Position | Ownership determines which decision vocabulary applies. Entry quality and an existing position's risk review are different questions. |
| Historical evidence | Descriptive, dated, provenance-aware comparisons. Sample positive rates are not probabilities or guarantees. |

- Missing evidence means uncertainty. Do not substitute zero, invent a score, inflate a market-only score by dropping its denominator, or classify a never-queried feed as no activity.
- Preserve `NOT_QUERIED` versus `NO_DATA` and the distinction between unsupported, failed, stale and actually observed data.
- Headline Thesis Strength requires sufficient Thesis Coverage (currently 55%). Incomplete coverage must not produce an exit solely from a low thesis score. Mature coverage gates and predefined risk rules still apply.
- Strong scanner rank, “strengthening,” or past all-time-high drawdown alone does not establish an attractive entry or fair value.
- Hard saved risk/stop-loss and profit-taking rules remain authoritative. AI, analogs and empirical context cannot bypass risk triggers or missing research gates.
- Do not silently retune production scores or thresholds from backtests, AI judgments, adoption metrics or Calibration Lab output. Any future change needs explicit evidence, a documented decision and appropriate validation.

## 3. Architecture and data boundaries

Conceptual sequence: market regime → narrative/attention and capital rotation → discovery → automated thesis → valuation → price action/entry setup → position monitoring → outcome validation. These are evidence layers, not permission to collapse everything into one opaque score.

- React/Vite frontend; Vercel API functions; Supabase Auth, private database records and scheduled Edge Functions.
- Coinbase online spot market eligibility underpins discovery; stablecoins/fiat and illiquid assets are excluded. Early market-cap/liquidity floors and display limits in old notes are historical: check `api/discovery.js` for current filters. The unified Scanner now includes eligible original assets as well as new ones.
- CoinGecko supplies current market data, 365-day chart/context history and market identity. `COINGECKO_DEMO_API_KEY` stays server-side. A Vercel secret is not automatically present in Supabase.
- DefiLlama supplies matched TVL, fees and revenue. Match by CoinGecko identity first; narrowly scoped fallback only. Preserve whole-protocol-family aggregation (for example Aave versions), parent handling and `/tvl/{slug}` for current TVL where appropriate.
- Protocol fees, protocol revenue, net surplus/treasury cash and token-holder revenue are different. Chain fees are not automatically token accrual. FDV/TVL, market-cap/TVL and supply overhang are screening evidence, not price targets.
- Fee enrichment is capped and prioritizes followed assets. Structural history enrichment is capped at 40 scanner candidates. Unenriched coins remain uncertain; one cannot claim the entire universe was technically checked from partial coverage.
- `api/research-context.js` combines chart/price action and narrative/competitive context, reusing the same asset history. Attention/volume/trending proxies do not prove durable capital inflows.
- Canonical multi-year prices live in `historical_price_daily` with source and product provenance. Prefer verified Coinbase USD daily history for free multi-year replay. Never silently splice providers or request unsupported multi-year history from CoinGecko Demo.
- Automatic history onboarding verifies ownership and product identity, records ambiguous/unavailable mapping rather than guessing, and does not block adding a coin to Research. Preserve the user's CoinGecko/Coinbase price-agreement identity check.
- History self-healing retries failed/unmapped assets. First import backfills available history; later syncs use recent dates plus a three-day overlap. Verified mappings are revalidated periodically; `force_full` is a repair mode, not the nightly default.

## 4. Research lifecycle, ownership and monitoring

- Original curated assets were AAVE, PENDLE, AERO, AKT, LINK, TAO, ONDO, TIA and SUI. They are seed research, not permanent favorites or fixed top opportunities.
- Scanner promotion persists an asset in private Research beyond today's ranking window. Research shows Active Research and Watchlist.
- v10.4 replaced Archive with Remove. Remove hides an unowned coin, clears its tracked scanner state and stops future background research. Re-add is explicit through Scanner.
- The database retains `archived` internally as an inactive marker for compatibility and historical preservation. Do not add a visible Archived list back.
- Owned assets cannot be removed. Check ownership on both the research record and saved plan and guard the write against ownership changing before save. Legacy inactive owned assets remain reachable.
- Removal does not delete purchases, evaluation/validation history or automatically sell anything. Historical `archive_candidate` IDs remain compatible; UI calls them Removal review.
- The purchase ledger is authoritative for token amount, weighted average cost, cost basis and unrealized P/L. Legacy amount/entry-price fields support import and compatibility. v8.9.4 did not implement sales or realized P/L; do not pretend it did.
- Saved plans define buy-below, take-profit, stop-loss, valuation and thesis-break conditions. Monitoring creates review events, not trades. Preserve multiple alerts and risk precedence.
- `research-monitor` updates automated thesis metadata and writes evaluations. `daily-signal-capture` records daily signals without requiring a page visit; preserve capture/model provenance and pagination to avoid click bias and Supabase row-limit truncation.

## 5. Structure and chart behavior

- Structural stages and BTC downside sensitivity were added as transparent observational context, without hidden `setup-v3` points.
- A fresh resistance cross with zero completed weekly closes is BREAKOUT ATTEMPT. RETEST / HOLD requires at least one completed weekly close above resistance; confirmation uses completed weeks, not the unfinished week.
- Preserve resistance distance, 200-day EMA and EMA slope versus the separate 50/200-day simple moving averages. Do not conflate these measures.
- BTC downside sensitivity uses non-overlapping historical seven-day windows where BTC fell at least 5%; it is descriptive and can change.
- Research charts retain range switches, hover inspection and 50D/200D averages. v10.5 adds drag measurements snapping to recorded daily prices without extra API requests.
- First clicked point is the measurement baseline: 100→125 is +25%, reverse is −20%. Release retains it; click/Clear/Escape dismisses it; range/asset/history changes reset it. Preserve responsive coordinate conversion and pointer handling.

## 6. AI, sourced research and refresh behavior

- Independent AI research consumes structured quantitative state, position/risk context, previous evaluations, sourced qualitative/event evidence, historical evidence and matured live outcomes. Store assessment and input snapshot for audit and later evaluation.
- AI is not the deterministic scoring engine. Its evidence can support a separate conservative displayed decision posture under existing rules; it cannot rewrite Setup/Thesis or execute trades.
- Sourced qualitative research uses authenticated, allow-listed OpenAI Responses web search and strict structured output. Prefer primary sources; retain HTTPS citations, evidence dates, conflicts and unknowns. Protocol revenue alone does not establish holder value capture.
- Structured catalyst/unlock events distinguish one-time unlocks from ongoing emissions, retain source links/date precision/amounts/confidence/impact, and update stable event keys. Omission in a new run does not delete an event. Completed/cancelled/delayed statuses require affirmative evidence.
- Event research permits one no-search repair attempt that adds no facts. Preserve precise failure diagnostics, conflict states and previous saved intelligence on failure. Qualitative research currently has no equivalent repair fallback.
- Read transport responses as text and parse defensively so non-JSON platform errors expose the actual HTTP failure instead of masking it with a parse error.
- v10.6.1 **Refresh Research with AI** attempts quantitative → sourced qualitative → event intelligence → AI assessment, in that order, continuing after failures. Each step reports its own result; successful records remain saved.
- Later steps use fresh saved results when available, otherwise existing evidence with original timestamps. Final AI reloads available event records. Overall failure remains visible if any stage failed.
- **Refresh Research without AI** performs quantitative evaluation only; it preserves stored sourced/event/AI evidence. Stay on the page during the current synchronous pipeline.
- Single-coin refresh validates the signed-in owner's asset and worker capability before POST. Malformed targets must never fall back to a full scan. Scheduled empty-body research-monitor calls retain universe behavior.
- Paid sourced/AI research is on demand; do not turn it into automatic per-coin daily spending without an explicit decision.

### Current operational limits verified in main

- Vercel API files: 11; recorded Hobby budget: 12. Check before adding a route; Edge Functions are a separate count.
- Durations in `vercel.json`: AI assessment 60s, qualitative research 300s, event intelligence 300s, research refresh 120s.
- Output budgets: AI assessment 8,000; qualitative 16,000; initial event intelligence 16,000; event repair 8,000.
- Preserve the user's `002c15a` fix raising qualitative output from 11,000 to 16,000. The output budget includes reasoning tokens; truncation can break strict output. Budget is a ceiling, not actual billed usage.
- If long synchronous research still times out, investigate an asynchronous durable job rather than blindly increasing duration.

## 7. Historical evidence, decisions and validation

- Replay reconstructs point-in-time price features: returns, RSI, moving averages/distances, drawdown, BTC-relative return and trend. It must not fabricate historical fundamentals, thesis/setup scores, regime, qualitative facts, catalysts or AI from current information.
- Keep asset-specific and cross-asset results separate, Entry and Position modes separate, and 7/30/90-day horizons separate. Match historical context to the present state instead of selecting whichever cohort had the best returns.
- Overlapping daily/weekly observations are not independent trials. Show independent/non-overlapping counts and asset concentration; correlated coins observed in the same market month do not create independent market regimes.
- Forward outcome workers wait until horizons mature and calculate returns, BTC-relative returns, favorable/adverse excursions and drawdowns from observed prices. Paginate reads and retain model/version provenance.
- Signal outcomes, AI assessment outcomes and final decision outcomes are distinct datasets. Do not recreate historical final decision postures from replay; the scorecard uses actual saved decisions prospectively.
- v9.6 Decision & Expectation provides practical Entry/Position postures with empirical context. It does not alter `decisionSignal`; caution cannot override hard rules or turn insufficient evidence into a buy.
- v9.7 similarity compares the same asset using 7D/30D return, RSI, MA50/MA200 distance, 90D drawdown and BTC-relative 30D. Current state comes from fresh canonical prices, not the newest old replay anchor.
- IMPORTANT supersession: v9.7 initially allowed a cautious downgrade; v9.8 removed that influence. Similarity is now observational only. Do not revive the old downgrade from an earlier release note.
- v9.9 Calibration Lab is review governance, excluded from AI context and decision inputs. Current code requires ≥10 independent 30-day observations, ≥4 assets AND ≥6 separate 30-day calendar periods. Old notes omitting the six-period floor are incomplete. Readiness is permission to review evidence, not proof or an automatic threshold recommendation.
- v10.2 price expectations use same-asset matured neighbors only, up to 40 nearest candidates and weights `1/(0.15+distance)^2`, producing weighted q25/median/q75 return and dollar references. These are empirical ranges, not guaranteed targets or forecast probabilities. No HIGH confidence in this version.
- Current price/as-of must use latest saved daily prices. Outcomes used as neighbors must have matured by the as-of/anchor date. No cross-asset averaging or current qualitative evidence shifts this distribution.
- v10.3 validates exact expectation math walk-forward against zero-return and same-asset matured unconditional baselines. PROMISING is a research label, not decision authority; display independent counts separately.
- v10.3.1 fixed HTTP 546 resource exhaustion by processing one asset per call: an explicit `{symbol}`/`{research_asset_id}` target, otherwise the active asset whose validation is missing or oldest (hourly cron at :25). There is deliberately no stored cursor: `monitor` deletes every `monitor_state` row that is not a plan rule every five minutes, so a cursor there would be wiped. Outcomes are queried in batches of at most 150 IDs and the matured pool is an advancing prefix. Preserve math/leakage gates; do not return to whole-universe validation per invocation. Cross-asset summaries are reporting-only and are not recomputed by this worker.

## 8. v10.7 adoption and development evidence

- Collected by existing sourced research, persisted in `qualitative_research.intelligence` JSON and shown in Research. No new provider subscription, API route, SQL migration or Edge Function deployment.
- Metrics: active addresses, paying users, user retention, TVL, net deposits, fees, protocol revenue, monthly active developers, established developers, developer retention and releases.
- Growth is deterministic from sourced observations, not model-generated percentages: usage/economics target 30/90 days; developer/release metrics target 90/180 days.
- Definitions, project scope and measurement periods must match; baseline tolerance is three days. Zero baseline, invalid/future dates, missing resolved sources and invalid values produce Unknown.
- Older-than-30-day usage/economic observations and older-than-60-day developer/release observations are marked stale. Collection time is distinct from observation date.
- Addresses are not people; paying users and retention need their own definitions. USD TVL growth includes asset-price effects; net deposits require direct flow evidence. Commits are not unique developers or developer retention. Releases indicate activity, not continuity.
- Existing records show Unknown until refreshed with AI/sourced research. A successful run can still leave unsupported metrics unknown. Quantitative-only refresh does not collect them.
- Adoption coverage is separate from Thesis Coverage. No scanner score/entry threshold/allocation change was made. AI receives the evidence through the existing qualitative packet; deterministic scores remain independent.

## 9. Video-derived judgments and deferred proposals

Confirmed research principles from the strategy discussions:
- Compare operating growth with valuation/price growth; avoid chasing a price already far above its trend merely because fundamentals look good.
- Compare sector peers, distinguish circulating market cap from FDV/unlocks, and verify how economic activity benefits the token.
- Do not assume a market maker controls a guaranteed breakout, cumulative revenue equals treasury cash, or a prior ATH represents fair value.
- A $500M cap cutoff and a default 50/50 large/small-cap portfolio are not accepted safety rules. Smaller cap does not automatically mean cheap; diversification among correlated crypto assets does not eliminate shared risk.

Still proposals, not fully implemented features:
- Dedicated fundamentals-growth-versus-price divergence screen.
- Richer base-duration, higher-low, volatility-compression and breakout-volume confirmation screen.
- Direct chain bridge/net-stablecoin flow analysis beyond existing rotation/attention proxies.
- Consistent sector FDV/revenue and token-holder economics comparisons.
- Complete numeric 30/90/180-day unlock pressure coverage across all assets.
- Automatic scoring based on adoption/developer evidence, automatic threshold optimization, automatic portfolio allocation, sales/realized P&L and automated trading.

Do not store an old AAVE/ASTER/etc. recommendation here as a permanent conclusion. Coin rankings, MA proximity, setup quality and live fundamentals require new dated verification.

## 10. Release map and superseded decisions

| Releases | Durable change / reference |
| --- | --- |
| v5–v6.6.1 | Cloud plans/snapshots, ownership/alerts, fees/revenue/TVL fixes, dynamic adapters and dashboard-pasteable monitor/snapshot workers. Keep authentic lockfile, missing-value handling and user isolation. See README and V6.6.1-DEPLOY.md. |
| v7–v7.2 | Coinbase discovery; relative priority versus absolute evidence and coverage; anti-extension and matching safeguards. |
| v8–v8.5 | Persistent lifecycle, dynamic detail/dashboard, unified scanner and plan/ownership monitoring. Original separate curated table and top-25 persistence assumptions are superseded. |
| v8.6–v8.8.1 | Thesis separated from setup, automated research and coverage gates, regime/journal, family-level fundamentals. Manual score editing is not the current design goal. |
| v8.9–v8.9.3 | Attention/rotation/competition, setup-v3 provenance/alignment, breakdown and interactive chart; Promotion Review syntax fixes. |
| v8.9.4–v8.9.7 | Purchase ledger, structure/BTC downside, context hotfix, forward outcomes and server daily capture. |
| v9.0–v9.1.2 | Independent AI, sourced qualitative layer, defensive JSON handling and 300s sourced duration. Old 7,000-token qualitative budget is superseded. |
| v9.2–v9.3.4 | Leakage-safe replay/calibration, canonical multi-year history, verified/dynamic mapping, self-healing and incremental sync. |
| v9.4–v9.6 | Empirical/forward-outcome AI digest and practical decision postures. |
| v9.7–v9.9 | Same-state similarity, prospective decision scorecard, similarity influence removal and calibration review governance. |
| v10–v10.1 | Structured catalyst/unlock intelligence, repair and conflict handling. |
| v10.2–v10.3.1 | Asset-specific empirical price ranges, walk-forward validation and resource-safe targeted worker. |
| v10.4–v10.5 | Remove replaces visible Archive; drag-to-measure charts. |
| v10.6–v10.6.1 | Single-coin four-stage refresh, independent failures and quantitative-only option. |
| v10.7 + 002c15a | Sourced adoption/development panel and 16,000-token qualitative budget. |

Exact deployment documents and implementation specs are in `releases/`; matching migrations are also there. Read the relevant document rather than re-running the entire historical migration/deploy sequence.

## 11. Collaboration, security and release checklist

1. Fetch CURRENT GitHub main and read this file before changes. Preserve user fixes; never build a new release from an old ZIP or overwrite an unrelated dirty checkout.
2. Inspect relevant release notes AND current implementation. Explicit later user decisions and current fixes take precedence over historical examples.
3. Update this file each release with final scope, reasons, superseded decisions, required operations, known limitations and verified status.
4. Keep authenticated ownership checks, Supabase RLS (`auth.uid() = user_id`), request caps and fail-closed `AI_ALLOWED_EMAILS`. Missing allow-list means no paid AI access.
5. `OPENAI_API_KEY`, `MONITOR_CRON_SECRET` and service-role secrets stay server-only; no `VITE_` prefix. Browser Supabase publishable configuration is distinct from privileged secrets. Preserve HTTPS source-link guards.
6. Edge Functions with JWT verification disabled must retain their explicit authentication (typically `x-monitor-secret`); JWT OFF does not mean public authorization.
7. Apply required SQL before dependent code, append migrations to current `supabase.sql`, merge config without replacing unrelated entries, and redeploy only necessary workers. Preserve cron dependency order and use current cron files; pg_net request IDs are not HTTP status codes.
8. Run relevant tests/build and available checks. Preserve pagination, normalization/fee-budget/family safeguards, saved ownership/risk precedence, structure completed-week rules and Promotion Review brace correction (`</button>)}`, not `</button>})}`).
9. Deliver actual code with reviewable instructions. Clearly distinguish proposed, implemented locally, pushed and deployed. “Pushed” does not prove Vercel Ready or Supabase worker deployment; inspect production separately when requested.
10. Do not trigger paid research, mutate user positions or send outside notifications merely to validate a code package. Use authorized live acceptance steps and report limits of mocked tests.

## 12. Current status and next verification

- v10.7 and the 16,000-token follow-up are confirmed on GitHub main at `002c15a`.
- User reported 31/31 tests, build/lint/carry-forward guards, shared-file server import, AI/link safety and 11/12 API-function budget passing.
- Vercel Ready and live v10.7 sourced collection have not been independently verified in this context update. Earlier v10.6.1 deployment was user-confirmed.
- v10.7 requires frontend/API deployment through Vercel only; no new SQL, Supabase worker, cron, secret or dependency changes.
- After deployment, refresh a researched coin with AI and review observation dates/source links/comparability. Unknown metrics can be a legitimate coverage limit.
- This update changes documentation only, retains product version v10.7 and is prepared locally for the user's commit/push workflow.
