create table if not exists public.adoption_evidence_snapshots (
 user_id uuid not null references auth.users(id) on delete cascade,
 research_asset_id bigint not null references public.research_assets(id) on delete cascade,
 observed_date date not null,
 collected_at timestamptz not null default now(),
 intelligence jsonb not null,
 primary key(user_id,research_asset_id,observed_date)
);
alter table public.adoption_evidence_snapshots enable row level security;
drop policy if exists "own adoption evidence" on public.adoption_evidence_snapshots;
create policy "own adoption evidence" on public.adoption_evidence_snapshots for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id and exists(select 1 from public.research_assets a where a.id=research_asset_id and a.user_id=auth.uid()));
grant select,insert,update,delete on public.adoption_evidence_snapshots to authenticated;
