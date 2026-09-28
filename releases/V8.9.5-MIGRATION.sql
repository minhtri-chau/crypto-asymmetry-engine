-- Crypto Asymmetry Engine v8.9.5
-- Observational structural-timing context in the Signal Journal.

alter table public.signal_observations add column if not exists structure_stage text;
alter table public.signal_observations add column if not exists weekly_breakout_confirmation text;
alter table public.signal_observations add column if not exists btc_downside_beta numeric;
