-- Authenticated sessions do not use TRUNCATE, and TRUNCATE bypasses
-- row-level security. Remove that privilege from authenticated only.
-- service_role, anon, and PUBLIC privileges are unchanged.

revoke truncate on table public.member_messages from authenticated;
revoke truncate on table public.member_conversations from authenticated;
