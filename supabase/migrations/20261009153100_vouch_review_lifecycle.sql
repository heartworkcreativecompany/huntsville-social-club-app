-- Vouch moderation: pending, approved, rejected.
-- Existing active/flagged rows become pending. They are not treated as approved.
-- Existing removed rows become rejected. Endorsement text is left untouched.
-- Applying this migration creates an admin review backlog at /admin/member-vouches.

alter table public.member_vouches
  drop constraint if exists member_vouches_status_check;

update public.member_vouches
set status = 'pending'
where status in ('active', 'flagged');

update public.member_vouches
set
  status = 'rejected',
  moderation_reason = coalesce(
    moderation_reason,
    'Migrated from a withdrawn vouch. Not publicly approved.'
  )
where status = 'removed';

alter table public.member_vouches
  add constraint member_vouches_status_check
  check (status = any (array['pending'::text, 'approved'::text, 'rejected'::text]));

alter table public.member_vouches
  alter column status set default 'pending';

comment on column public.member_vouches.note is
  'Member-written endorsement. Public only while status is approved. Null means no endorsement text was submitted.';
comment on column public.member_vouches.status is
  'pending until an admin approves or rejects. Edited approved text returns to pending.';
comment on column public.member_vouches.moderation_reason is
  'Optional internal moderation note. Not shown on public profiles.';
comment on column public.member_vouches.moderated_by is
  'Admin who approved or rejected the vouch.';
comment on column public.member_vouches.moderated_at is
  'When an admin last approved or rejected the vouch.';

drop index if exists public.member_vouches_vouchee_active_idx;
create index if not exists member_vouches_vouchee_approved_idx
  on public.member_vouches (vouchee_id)
  where status = 'approved';

create index if not exists member_vouches_status_created_idx
  on public.member_vouches (status, created_at desc);

drop policy if exists "Members read active vouches" on public.member_vouches;
drop policy if exists "Members read approved vouches" on public.member_vouches;
create policy "Members read approved vouches"
  on public.member_vouches
  for select
  to authenticated
  using (
    status = 'approved'
    or voucher_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

create or replace function public.member_vouches_guard_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin(auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.moderated_at := null;
    new.moderated_by := null;
    return new;
  end if;

  if new.note is distinct from old.note
     or new.relationship_context is distinct from old.relationship_context
     or new.vouch_type is distinct from old.vouch_type then
    new.status := 'pending';
    new.moderated_at := null;
    new.moderated_by := null;
  elsif new.status = 'approved' then
    new.status := 'pending';
    new.moderated_at := null;
    new.moderated_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists member_vouches_guard_review on public.member_vouches;
create trigger member_vouches_guard_review
  before insert or update on public.member_vouches
  for each row
  execute function public.member_vouches_guard_review();
