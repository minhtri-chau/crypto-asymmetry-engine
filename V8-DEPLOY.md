# v8 deployment

v8 adds persistent research lifecycle data and one new daily evaluator.

1. Push v8 to GitHub `main`, preserving the existing genuine `package-lock.json`.
2. In Supabase SQL Editor, run the updated `supabase.sql` once. It adds `research_assets` and `research_evaluations` with RLS.
3. In Supabase Dashboard -> Edge Functions, create/deploy `research-monitor` from `supabase/functions/research-monitor/index.ts`.
4. Disable JWT verification for `research-monitor`, matching `supabase/config.toml`. The function authenticates Cron with the existing `MONITOR_CRON_SECRET`.
5. Add `COINGECKO_DEMO_API_KEY` to Supabase Edge Function secrets if it is not already there. Your Vercel key does not automatically exist in Supabase.
6. Run `supabase/research-monitor-cron.sql` in SQL Editor. It reuses the existing Vault secrets `project_url` and `monitor_cron_secret` and schedules evaluation daily at 00:30 UTC.
7. Vercel deploys the frontend from `main`.

No changes to the existing monitor Cron or daily-snapshot Cron are required.

Verification:
- Sign in.
- Scanner -> Add to Research on a Discovery candidate.
- Open Research in the sidebar and confirm the candidate appears.
- Invoke `research-monitor` once manually with the existing x-monitor-secret or wait for Cron.
- Refresh Research and confirm an evaluation/status appears.
