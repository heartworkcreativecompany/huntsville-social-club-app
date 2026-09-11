-- Private pending RSVP answers for paid checkout only.
-- These are not attendance records. Hosts and admins have no SELECT policy.
-- Copied onto event_attendees only after successful payment confirmation.

create table if not exists public.event_rsvp_pending_answers (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null,
  rsvp_answer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id),
  constraint event_rsvp_pending_answers_answer_max_length
    check (char_length(rsvp_answer) <= 500)
);

comment on table public.event_rsvp_pending_answers is
  'Member-owned RSVP answers held until paid Going is confirmed. Not a host-visible RSVP or attendance row.';

comment on column public.event_rsvp_pending_answers.rsvp_answer is
  'Trimmed nonblank answer staged for the member’s next paid Going confirmation.';

alter table public.event_rsvp_pending_answers enable row level security;

drop policy if exists "Users can view own pending RSVP answers"
  on public.event_rsvp_pending_answers;
create policy "Users can view own pending RSVP answers"
  on public.event_rsvp_pending_answers
  as permissive
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can insert own pending RSVP answers"
  on public.event_rsvp_pending_answers;
create policy "Users can insert own pending RSVP answers"
  on public.event_rsvp_pending_answers
  as permissive
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update own pending RSVP answers"
  on public.event_rsvp_pending_answers;
create policy "Users can update own pending RSVP answers"
  on public.event_rsvp_pending_answers
  as permissive
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete own pending RSVP answers"
  on public.event_rsvp_pending_answers;
create policy "Users can delete own pending RSVP answers"
  on public.event_rsvp_pending_answers
  as permissive
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on table public.event_rsvp_pending_answers
  to authenticated;
grant all on table public.event_rsvp_pending_answers to service_role;
