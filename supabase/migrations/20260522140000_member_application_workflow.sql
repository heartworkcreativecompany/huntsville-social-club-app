-- Membership application workflow on profiles

alter table public.profiles
  add column if not exists application_status text not null default 'draft',
  add column if not exists membership_intent text,
  add column if not exists application_draft jsonb,
  add column if not exists application_submitted_at timestamptz,
  add column if not exists application_reviewed_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists admin_review_notes text,
  add column if not exists location_area text,
  add column if not exists referral_source text;

alter table public.profiles
  drop constraint if exists profiles_application_status_check;

alter table public.profiles
  add constraint profiles_application_status_check
  check (
    application_status = any (
      array[
        'draft'::text,
        'submitted'::text,
        'in_review'::text,
        'needs_info'::text,
        'approved'::text,
        'rejected'::text
      ]
    )
  );

-- Existing active members remain approved
update public.profiles
set
  application_status = 'approved',
  verified_at = coalesce(verified_at, now())
where role in ('admin', 'host');

update public.profiles
set
  application_status = 'approved',
  verified_at = coalesce(verified_at, now())
where application_status = 'draft'
  and full_name is not null
  and trim(full_name) <> '';

create or replace function public.guard_profile_application_status()
returns trigger
language plpgsql
as $function$
begin
  if old.application_status is distinct from new.application_status then
    if not public.is_admin(auth.uid()) then
      if auth.uid() is distinct from new.id then
        raise exception 'Cannot change another member''s application status';
      end if;

      if new.application_status not in ('draft', 'submitted') then
        raise exception 'Members may only save draft or submit applications';
      end if;

      if old.application_status = 'approved' then
        raise exception 'Approved membership cannot be changed by the member';
      end if;

      if old.application_status = 'rejected'
        and new.application_status <> 'draft' then
        raise exception 'Rejected applications must be revised as a draft first';
      end if;
    end if;

    if new.application_status = 'submitted' then
      new.application_submitted_at = coalesce(new.application_submitted_at, now());
    end if;

    if new.application_status in ('approved', 'rejected', 'needs_info', 'in_review') then
      new.application_reviewed_at = coalesce(new.application_reviewed_at, now());
    end if;

    if new.application_status = 'approved' then
      new.verified_at = coalesce(new.verified_at, now());
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists profiles_guard_application_status on public.profiles;

create trigger profiles_guard_application_status
before update on public.profiles
for each row
execute function public.guard_profile_application_status();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, role, application_status)
  values (new.id, new.email, 'member', 'draft')
  on conflict (id) do nothing;

  return new;
end;
$function$;

drop policy if exists "Members can view approved profiles" on public.profiles;

create policy "Members can view approved profiles"
on public.profiles
as permissive
for select
to authenticated
using (
  application_status = 'approved'
  or id = (select auth.uid())
  or public.is_admin((select auth.uid()))
);
