-- 20261106120000 used "revoke insert, update (cols)", which PostgreSQL reads
-- as a table-level REVOKE INSERT. The ticket columns stay protected by the
-- preserve_event_admission_confirmation trigger.

grant insert on table public.event_attendees to anon, authenticated;
