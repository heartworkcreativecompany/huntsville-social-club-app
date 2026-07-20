-- Allow messaging_unsuspended in moderation audit log.

alter table public.moderation_actions
  drop constraint if exists moderation_actions_action_type_check;

alter table public.moderation_actions
  add constraint moderation_actions_action_type_check
  check (action_type = any (array[
    'message_report_reviewed'::text,
    'message_report_dismissed'::text,
    'messaging_suspended'::text,
    'messaging_unsuspended'::text,
    'admin_member_block'::text
  ]));
