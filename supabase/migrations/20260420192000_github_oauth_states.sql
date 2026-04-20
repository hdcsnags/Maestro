create table if not exists oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  state text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

alter table oauth_states enable row level security;

create unique index if not exists oauth_states_provider_state_idx
  on oauth_states(provider, state);

create index if not exists oauth_states_user_provider_idx
  on oauth_states(user_id, provider);
