-- Optional member vouching — community trust signal, not a guarantee.

create table if not exists public.member_vouches (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.profiles (id) on delete cascade,
  vouchee_id uuid not null references public.profiles (id) on delete cascade,
  vouch_type text not null,
  relationship_context text not null,
  note text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid references public.profiles (id) on delete set null,
  moderation_reason text,
  constraint member_vouches_no_self check (voucher_id <> vouchee_id),
  constraint member_vouches_type_check check (
    vouch_type = any (array['personal'::text, 'professional'::text, 'community'::text])
  ),
  constraint member_vouches_status_check check (
    status = any (array['active'::text, 'removed'::text, 'flagged'::text])
  ),
  constraint member_vouches_unique_active unique (voucher_id, vouchee_id, vouch_type)
);

comment on table public.member_vouches is
  'Optional member endorsements — community signals, not safety guarantees.';
comment on column public.member_vouches.note is
  'Private note for admin moderation; not shown on public profiles by default.';
comment on column public.member_vouches.relationship_context is
  'How the voucher knows the vouchee — required context for the endorsement.';

create index if not exists member_vouches_vouchee_active_idx
  on public.member_vouches (vouchee_id)
  where status = 'active';

create index if not exists member_vouches_voucher_idx
  on public.member_vouches (voucher_id);

alter table public.member_vouches enable row level security;

-- Approved members may vouch for other approved members.
create policy "Approved members create vouches"
  on public.member_vouches
  for insert
  to authenticated
  with check (
    voucher_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles voucher
      where voucher.id = voucher_id
        and voucher.application_status = 'approved'
    )
    and exists (
      select 1
      from public.profiles vouchee
      where vouchee.id = vouchee_id
        and vouchee.application_status = 'approved'
    )
  );

-- Members see active vouch counts; admins see all statuses.
create policy "Members read active vouches"
  on public.member_vouches
  for select
  to authenticated
  using (
    status = 'active'
    or voucher_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

-- Voucher may withdraw; admin may moderate.
create policy "Voucher or admin updates vouches"
  on public.member_vouches
  for update
  to authenticated
  using (
    voucher_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  )
  with check (
    voucher_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

create policy "Voucher or admin deletes vouches"
  on public.member_vouches
  for delete
  to authenticated
  using (
    voucher_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );
