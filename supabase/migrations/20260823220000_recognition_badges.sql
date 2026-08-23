-- Admin-awarded public recognition badges.
-- Catalog + award history only. No Stripe, coupon, billing, entitlement, or membership-tier data.

create table if not exists public.recognition_badges (
  slug text primary key,
  public_label text not null,
  public_description text not null,
  display_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.recognition_badges is
  'Reusable public recognition badge catalog. Labels only — not membership, billing, or access.';
comment on column public.recognition_badges.public_label is
  'Member-visible badge name shown on directory cards and public profiles.';
comment on column public.recognition_badges.public_description is
  'Short public explanation of the recognition label.';
comment on column public.recognition_badges.active is
  'Inactive catalog entries cannot be newly awarded and are omitted from public display.';

drop trigger if exists set_recognition_badges_updated_at on public.recognition_badges;
create trigger set_recognition_badges_updated_at
  before update on public.recognition_badges
  for each row
  execute function public.set_updated_at();

insert into public.recognition_badges (
  slug,
  public_label,
  public_description,
  display_order,
  active
)
values
  (
    'founding_member',
    'Founding Member',
    'Recognized as an early member of Huntsville Social Club.',
    10,
    true
  ),
  (
    'premium_sponsor',
    'Premium Sponsor',
    'Recognized as a premium sponsor of Huntsville Social Club.',
    20,
    true
  ),
  (
    'experience_partner',
    'Experience Partner',
    'Recognized as an experience partner of Huntsville Social Club.',
    30,
    true
  )
on conflict (slug) do update
set
  public_label = excluded.public_label,
  public_description = excluded.public_description,
  display_order = excluded.display_order,
  active = excluded.active,
  updated_at = now();

create table if not exists public.member_recognition_badge_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_slug text not null references public.recognition_badges (slug),
  awarded_at timestamptz not null default now(),
  awarded_by uuid not null references public.profiles (id) on delete restrict,
  admin_note text,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  constraint member_recognition_badge_awards_revoke_pair check (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null and revoked_by is not null)
  )
);

comment on table public.member_recognition_badge_awards is
  'Admin-only award history for public recognition badges. Members cannot self-award or revoke.';
comment on column public.member_recognition_badge_awards.admin_note is
  'Private admin note. Never exposed on public profiles, directory payloads, or member selects.';
comment on column public.member_recognition_badge_awards.awarded_by is
  'Administrator who awarded the badge. Admin-only.';
comment on column public.member_recognition_badge_awards.revoked_by is
  'Administrator who revoked the badge. Admin-only.';

create unique index if not exists member_recognition_badge_awards_one_active
  on public.member_recognition_badge_awards (user_id, badge_slug)
  where revoked_at is null;

create index if not exists member_recognition_badge_awards_user_active_idx
  on public.member_recognition_badge_awards (user_id)
  where revoked_at is null;

alter table public.recognition_badges enable row level security;
alter table public.member_recognition_badge_awards enable row level security;

drop policy if exists "Approved members read active recognition badges"
  on public.recognition_badges;
create policy "Approved members read active recognition badges"
  on public.recognition_badges
  for select
  to authenticated
  using (active = true);

-- No insert/update/delete policies for authenticated on either table.
-- Writes go through service-role admin actions after server-side requireAdmin().

revoke all on public.recognition_badges from anon, authenticated;
grant select on public.recognition_badges to authenticated;
grant all on public.recognition_badges to service_role;

revoke all on public.member_recognition_badge_awards from anon, authenticated;
grant all on public.member_recognition_badge_awards to service_role;

-- Public view exposes only active labels for approved members. No admin metadata.
create or replace view public.member_public_recognition_badges
  with (security_invoker = false)
as
select
  a.user_id,
  c.slug as badge_slug,
  c.public_label,
  c.display_order
from public.member_recognition_badge_awards a
join public.recognition_badges c
  on c.slug = a.badge_slug
join public.profiles p
  on p.id = a.user_id
where a.revoked_at is null
  and c.active = true
  and p.application_status = 'approved';

comment on view public.member_public_recognition_badges is
  'Public recognition labels for approved member profiles. Omits admin notes, actor ids, and revoked awards.';

revoke all on public.member_public_recognition_badges from anon, public;
grant select on public.member_public_recognition_badges to authenticated;
grant all on public.member_public_recognition_badges to service_role;

alter table public.moderation_actions
  drop constraint if exists moderation_actions_action_type_check;

alter table public.moderation_actions
  add constraint moderation_actions_action_type_check
  check (action_type = any (array[
    'message_report_reviewed'::text,
    'message_report_dismissed'::text,
    'messaging_suspended'::text,
    'messaging_unsuspended'::text,
    'admin_member_block'::text,
    'member_deleted'::text,
    'recognition_badge_awarded'::text,
    'recognition_badge_revoked'::text
  ]));
