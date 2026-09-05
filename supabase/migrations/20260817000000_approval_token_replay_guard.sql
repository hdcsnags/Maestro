-- SEC-02 follow-up: approval-token replay protection.
-- HMAC approval tokens (supabase/functions/_shared/approval-tokens.ts) previously had no
-- server-side record of which tokens had already been consumed — a captured token remained
-- valid for reuse for its full 5-minute TTL on every resubmit. This table records only the
-- random per-token `jti` nonce (never the token, command hash, or any other payload content)
-- so the executor-api submit handler can atomically reject a second use of the same token.

create table if not exists consumed_approval_tokens (
  jti uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  consumed_at timestamptz not null default now()
);

-- Service-role only: this table is never queried or written from user-facing clients,
-- only from the executor-api edge function via the admin client.
alter table consumed_approval_tokens enable row level security;

create index if not exists idx_consumed_approval_tokens_consumed_at
  on consumed_approval_tokens(consumed_at);

comment on table consumed_approval_tokens is
  'Nonce ledger for one-time-use approval tokens (SEC-02). Rows older than the token TTL '
  '(5 minutes) are safe to prune; no cleanup job exists yet — see MAESTROCLAW-ATTACK-PLAN.md.';
