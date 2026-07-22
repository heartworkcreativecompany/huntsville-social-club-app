-- Elite guest invite spend: store guest name on the member's attendee row.
-- Counter remains on membership_entitlement_cycles.guest_invites_*.

alter table public.event_attendees
  add column if not exists guest_name text,
  add column if not exists guest_invite_consumed boolean not null default false;

comment on column public.event_attendees.guest_name is
  'Display name for an Elite guest invite attached to this member RSVP (premium events).';

comment on column public.event_attendees.guest_invite_consumed is
  'True when this RSVP consumed one Elite guest invite from the active billing cycle.';
