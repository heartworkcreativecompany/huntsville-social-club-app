-- Optional per-event RSVP question and private per-member answers.
-- Existing events and RSVP rows stay valid: new columns are nullable / default-safe.

alter table public.events
  add column if not exists rsvp_question text,
  add column if not exists rsvp_question_required boolean not null default false;

alter table public.events
  drop constraint if exists events_rsvp_question_required_has_text;

alter table public.events
  add constraint events_rsvp_question_required_has_text
  check (
    rsvp_question_required = false
    or (
      rsvp_question is not null
      and length(btrim(rsvp_question)) > 0
    )
  );

alter table public.events
  drop constraint if exists events_rsvp_question_max_length;

alter table public.events
  add constraint events_rsvp_question_max_length
  check (
    rsvp_question is null
    or char_length(rsvp_question) <= 300
  );

comment on column public.events.rsvp_question is
  'Optional free-text question shown to members when they RSVP Going. Null/blank means no question is configured.';

comment on column public.events.rsvp_question_required is
  'When true, Going RSVP requires a nonblank answer. Must be false when rsvp_question is blank.';

alter table public.event_attendees
  add column if not exists rsvp_answer text;

alter table public.event_attendees
  drop constraint if exists event_attendees_rsvp_answer_max_length;

alter table public.event_attendees
  add constraint event_attendees_rsvp_answer_max_length
  check (
    rsvp_answer is null
    or char_length(rsvp_answer) <= 500
  );

comment on column public.event_attendees.rsvp_answer is
  'Member answer to the event RSVP question. One answer per member RSVP; not a guest answer. Visible to the member, event host, and Club admins only.';

-- Hosts already SELECT attendees for events they own; members SELECT their own rows.
-- Admins who are not the owner need the same read access for attendee management.
drop policy if exists "Admins can view event attendees" on public.event_attendees;
create policy "Admins can view event attendees"
  on public.event_attendees
  as permissive
  for select
  to authenticated
  using (public.is_admin((select auth.uid())));
