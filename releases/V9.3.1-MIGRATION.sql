-- v9.3.1 verified market-history mapping + import provenance
alter table public.research_assets add column if not exists coinbase_product_id text;
alter table public.research_assets add column if not exists history_provider text
  check (history_provider is null or history_provider in ('coinbase','coingecko_paid','coingecko_demo'));
alter table public.research_assets add column if not exists history_verified_at timestamptz;

alter table public.historical_price_daily add column if not exists open numeric;
alter table public.historical_price_daily add column if not exists high numeric;
alter table public.historical_price_daily add column if not exists low numeric;
alter table public.historical_price_daily add column if not exists volume numeric;
alter table public.historical_price_daily add column if not exists imported_at timestamptz not null default now();

create index if not exists research_assets_coinbase_product_idx on public.research_assets(coinbase_product_id);
