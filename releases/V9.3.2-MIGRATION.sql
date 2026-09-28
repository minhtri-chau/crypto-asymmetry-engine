-- v9.3.2 Dynamic History Onboarding
-- No hardcoded research symbols. Safe to re-run.

alter table public.research_assets add column if not exists history_mapping_status text
  check (history_mapping_status is null or history_mapping_status in
    ('PENDING','VERIFIED','UNRESOLVED','AMBIGUOUS','NO_USD_PRODUCT','ERROR'));
alter table public.research_assets add column if not exists history_mapping_note text;
alter table public.research_assets add column if not exists history_last_attempt_at timestamptz;

-- Existing explicitly verified v9.3.1 mappings remain trusted.
update public.research_assets
set history_mapping_status='VERIFIED'
where coinbase_product_id is not null
  and history_mapping_status is null;

create index if not exists research_assets_history_mapping_status_idx
  on public.research_assets(history_mapping_status,stage);
