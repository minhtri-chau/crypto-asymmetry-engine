-- v8.9.7 server-side daily signal capture
-- Add provenance without changing the existing journal uniqueness semantics.
alter table public.signal_observations
  add column if not exists capture_source text not null default 'client_detail';

alter table public.signal_observations
  add column if not exists signal_model_version text;

create index if not exists signal_observations_capture_source_date
  on public.signal_observations(capture_source, observed_date desc);
