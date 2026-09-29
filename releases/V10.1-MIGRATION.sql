alter table public.catalyst_events
 add column if not exists conflict_state text not null default 'NONE'
 check (conflict_state in ('NONE','CONFLICTED')),
 add column if not exists conflict_note text;
alter table public.catalyst_event_runs
 add column if not exists repair_used boolean not null default false,
 add column if not exists ingestion_diagnostics jsonb not null default '{}'::jsonb;
