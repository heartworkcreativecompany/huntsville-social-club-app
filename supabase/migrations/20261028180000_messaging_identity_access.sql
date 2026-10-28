-- Approved participants can read existing conversation history without
-- accepted identity. New requests and sends still require that evidence.
-- Payment remains a separate entitlement and does not satisfy this check.
-- This does not change billing, sponsorship, or in-person evidence.

create or replace function public.profile_has_accepted_identity(check_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role'
     and check_user_id is distinct from auth.uid() then
    raise exception 'identity verification status is not available'
      using errcode = '42501';
  end if;

  return exists (
    select 1
    from public.profiles p
    where p.id = check_user_id
      and p.identity_verification_status = 'verified'
  )
  or exists (
    select 1
    from public.in_person_identity_verifications v
    where v.profile_id = check_user_id
      and v.method = 'in_person'
      and v.status = 'verified'
      and v.revoked_at is null
  );
end;
$$;

revoke all on function public.profile_has_accepted_identity(uuid) from public;
revoke all on function public.profile_has_accepted_identity(uuid) from anon;
grant execute on function public.profile_has_accepted_identity(uuid) to authenticated;
grant execute on function public.profile_has_accepted_identity(uuid) to service_role;

-- Approved participants can read existing history without accepted identity.
-- Suspension still allows reading. It does not allow sending.
create or replace function public.member_can_read_message_history(check_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role'
     and check_user_id is distinct from auth.uid() then
    raise exception 'messaging permission is not available'
      using errcode = '42501';
  end if;

  return exists (
    select 1
    from public.profiles p
    where p.id = check_user_id
      and p.application_status = 'approved'
  );
end;
$$;

revoke all on function public.member_can_read_message_history(uuid) from public;
revoke all on function public.member_can_read_message_history(uuid) from anon;
grant execute on function public.member_can_read_message_history(uuid) to authenticated;
grant execute on function public.member_can_read_message_history(uuid) to service_role;

-- Sender-side write gate. Identity is checked separately.
-- Either member being unapproved or suspended, or a block in either
-- direction, denies the write. Admin and system writes use service_role,
-- which bypasses RLS and must enforce the same rules in application code.
create or replace function public.member_messaging_send_allowed(
  sender_id uuid,
  other_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role'
     and sender_id is distinct from auth.uid() then
    raise exception 'messaging permission is not available'
      using errcode = '42501';
  end if;

  if other_user_id is null or other_user_id = sender_id then
    return false;
  end if;

  if not exists (
    select 1
    from public.profiles sender
    where sender.id = sender_id
      and sender.application_status = 'approved'
      and sender.messaging_suspended_at is null
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from public.profiles other_member
    where other_member.id = other_user_id
      and other_member.application_status = 'approved'
      and other_member.messaging_suspended_at is null
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.member_member_blocks block
    where (
      block.blocker_id = sender_id
      and block.blocked_member_id = other_user_id
    )
    or (
      block.blocker_id = other_user_id
      and block.blocked_member_id = sender_id
    )
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.member_messaging_send_allowed(uuid, uuid) from public;
revoke all on function public.member_messaging_send_allowed(uuid, uuid) from anon;
grant execute on function public.member_messaging_send_allowed(uuid, uuid) to authenticated;
grant execute on function public.member_messaging_send_allowed(uuid, uuid) to service_role;

-- Authenticated members do not create conversation rows. Request creation
-- stays on the service-role path, which has to apply these same checks.
revoke insert on public.member_conversations from authenticated;

drop policy if exists "Participants read conversations" on public.member_conversations;
create policy "Participants read conversations"
  on public.member_conversations
  for select
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    or (
      public.member_can_read_message_history((select auth.uid()))
      and (
        participant_a = (select auth.uid())
        or participant_b = (select auth.uid())
      )
    )
  );

drop policy if exists "Participants update conversations" on public.member_conversations;
create policy "Participants update conversations"
  on public.member_conversations
  for update
  to authenticated
  using (
    public.profile_has_accepted_identity((select auth.uid()))
    and public.member_messaging_send_allowed(
      (select auth.uid()),
      case
        when participant_a = (select auth.uid()) then participant_b
        else participant_a
      end
    )
    and (
      participant_a = (select auth.uid())
      or participant_b = (select auth.uid())
    )
  )
  with check (
    public.profile_has_accepted_identity((select auth.uid()))
    and public.member_messaging_send_allowed(
      (select auth.uid()),
      case
        when participant_a = (select auth.uid()) then participant_b
        else participant_a
      end
    )
    and (
      participant_a = (select auth.uid())
      or participant_b = (select auth.uid())
    )
  );

drop policy if exists "Participants read messages" on public.member_messages;
create policy "Participants read messages"
  on public.member_messages
  for select
  to authenticated
  using (
    public.is_admin((select auth.uid()))
    or (
      public.member_can_read_message_history((select auth.uid()))
      and exists (
        select 1
        from public.member_conversations c
        where c.id = conversation_id
          and (
            c.participant_a = (select auth.uid())
            or c.participant_b = (select auth.uid())
          )
      )
    )
  );

drop policy if exists "Participants send messages" on public.member_messages;
create policy "Participants send messages"
  on public.member_messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and coalesce(is_system, false) = false
    and public.profile_has_accepted_identity((select auth.uid()))
    and exists (
      select 1
      from public.member_conversations c
      where c.id = conversation_id
        and c.status = 'accepted'
        and (
          c.participant_a = (select auth.uid())
          or c.participant_b = (select auth.uid())
        )
        and public.member_messaging_send_allowed(
          (select auth.uid()),
          case
            when c.participant_a = (select auth.uid()) then c.participant_b
            else c.participant_a
          end
        )
    )
  );

-- Authenticated sessions may mark a message read and touch a conversation
-- timestamp. Sender, participants, body, and status stay on the service-role path.
revoke update on public.member_messages from authenticated;
grant update (read_at) on public.member_messages to authenticated;

revoke update on public.member_conversations from authenticated;
grant update (updated_at) on public.member_conversations to authenticated;

drop policy if exists "Recipients mark messages read" on public.member_messages;
create policy "Recipients mark messages read"
  on public.member_messages
  for update
  to authenticated
  using (
    sender_id <> (select auth.uid())
    and public.profile_has_accepted_identity((select auth.uid()))
    and exists (
      select 1
      from public.member_conversations c
      where c.id = conversation_id
        and (
          c.participant_a = (select auth.uid())
          or c.participant_b = (select auth.uid())
        )
        and public.member_messaging_send_allowed(
          (select auth.uid()),
          case
            when c.participant_a = (select auth.uid()) then c.participant_b
            else c.participant_a
          end
        )
    )
  )
  with check (
    sender_id <> (select auth.uid())
    and public.profile_has_accepted_identity((select auth.uid()))
    and exists (
      select 1
      from public.member_conversations c
      where c.id = conversation_id
        and (
          c.participant_a = (select auth.uid())
          or c.participant_b = (select auth.uid())
        )
        and public.member_messaging_send_allowed(
          (select auth.uid()),
          case
            when c.participant_a = (select auth.uid()) then c.participant_b
            else c.participant_a
          end
        )
    )
  );
