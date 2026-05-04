-- DIFF-04: Provider Health Matrix
-- Adds provider_health table and build_tasks.fallback_chain column.

create table if not exists public.provider_health (
  user_id        uuid        not null references auth.users(id) on delete cascade,
  provider_id    text        not null,  -- 'anthropic' | 'openai' | 'google' | 'openrouter'
  state          text        not null default 'unknown',
  last_success_at           timestamptz,
  last_failure_at           timestamptz,
  recent_failure_count      int not null default 0,
  recent_success_count      int not null default 0,
  rate_limit_until          timestamptz,
  last_failure_reason       text,
  updated_at     timestamptz not null default now(),
  primary key (user_id, provider_id)
);

create index if not exists provider_health_user_id_idx
  on public.provider_health (user_id);

alter table public.provider_health enable row level security;

create policy "Users can manage own provider health"
  on public.provider_health for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Attach a fallback chain (jsonb) to each build task so the dispatch loop
-- can pick the best available model without round-tripping to a config table.
alter table public.build_tasks
  add column if not exists fallback_chain jsonb;
