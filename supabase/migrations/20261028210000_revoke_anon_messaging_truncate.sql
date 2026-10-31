-- Anon sessions do not truncate messaging tables, and TRUNCATE bypasses
-- row-level security. Remove that privilege from anon only.
-- authenticated already has no TRUNCATE grant. PUBLIC has no grant.
-- service_role and the table owner keep TRUNCATE.

revoke truncate on table public.member_messages from anon;
revoke truncate on table public.member_conversations from anon;
