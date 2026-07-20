-- Admin-mediated recontact after a declined message request.

alter table public.member_conversations
  add column if not exists recontact_status text
    check (
      recontact_status is null
      or recontact_status = any (
        array[
          'requested'::text,
          'awaiting_recipient'::text,
          'allowed'::text,
          'denied'::text,
          'consumed'::text
        ]
      )
    ),
  add column if not exists recontact_requested_at timestamptz,
  add column if not exists recontact_requested_by uuid
    references public.profiles (id) on delete set null,
  add column if not exists recontact_note text,
  add column if not exists recontact_admin_actor_id uuid
    references public.profiles (id) on delete set null,
  add column if not exists recontact_admin_reviewed_at timestamptz,
  add column if not exists recontact_recipient_responded_at timestamptz;

comment on column public.member_conversations.recontact_status is
  'requested = sender asked admin; awaiting_recipient = admin asked recipient to reconsider; allowed = recipient approved one retry; denied = recipient refused recontact; consumed = retry used.';

create index if not exists member_conversations_recontact_requested_idx
  on public.member_conversations (recontact_requested_at desc)
  where recontact_status = 'requested';

create index if not exists member_conversations_recontact_awaiting_idx
  on public.member_conversations (updated_at desc)
  where recontact_status = 'awaiting_recipient';
