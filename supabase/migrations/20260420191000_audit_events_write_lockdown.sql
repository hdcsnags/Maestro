-- Audit events are append-only server records. Browser clients may read their
-- own rows but must not insert directly.

drop policy if exists "Users can insert own audit events" on audit_events;
