-- Members can read their own profiles row and, through member_directory_profiles,
-- the public columns of other approved members. The table-level SELECT grant
-- made the earlier column revoke on email ineffective, and "Members can view
-- approved profiles" returned every column of every approved row.

drop policy if exists "Members can view approved profiles" on public.profiles;

-- Reshapes a draft the owner view already selected. It does not read profiles,
-- so it runs as the caller. Authenticated needs execute because a
-- security_invoker function inside an owner view is still called as the session user.
create or replace function public.member_public_profile(draft jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when draft is null or jsonb_typeof(draft) <> 'object' then null
    else jsonb_build_object(
      'version', 2,
      'step', 0,
      'profile', jsonb_build_object(
        'firstName', '',
        'lastName', '',
        'displayName', coalesce(draft #>> '{profile,displayName}', ''),
        'dateOfBirth', '',
        'gender', '',
        'pronouns', '',
        'lookingFor', '',
        'aboutMe', coalesce(draft #>> '{profile,aboutMe}', ''),
        'connectionIntents', case
          when jsonb_typeof(draft #> '{profile,connectionIntents}') = 'array'
            then draft #> '{profile,connectionIntents}'
          else '[]'::jsonb
        end,
        'connectionsOpenTo', case
          when jsonb_typeof(draft #> '{profile,connectionsOpenTo}') = 'array'
            then draft #> '{profile,connectionsOpenTo}'
          else '[]'::jsonb
        end
      ),
      'location', jsonb_build_object(
        'city', '',
        'state', '',
        'zipCode', '',
        'neighborhoodOrArea', coalesce(draft #>> '{location,neighborhoodOrArea}', ''),
        'livesInHuntsvilleArea', null,
        'localConnection', '',
        'socialLink', ''
      ),
      'workAndInterests', jsonb_build_object(
        'occupation', coalesce(draft #>> '{workAndInterests,occupation}', ''),
        'industry', coalesce(draft #>> '{workAndInterests,industry}', ''),
        'employerCompany', '',
        'education', '',
        'interests', case
          when jsonb_typeof(draft #> '{workAndInterests,interests}') = 'array'
            then draft #> '{workAndInterests,interests}'
          else '[]'::jsonb
        end,
        'lifestyleTags', case
          when jsonb_typeof(draft #> '{workAndInterests,lifestyleTags}') = 'array'
            then draft #> '{workAndInterests,lifestyleTags}'
          else '[]'::jsonb
        end,
        'eventInterests', case
          when jsonb_typeof(draft #> '{workAndInterests,eventInterests}') = 'array'
            then draft #> '{workAndInterests,eventInterests}'
          else '[]'::jsonb
        end,
        'socialVibe', coalesce(draft #>> '{workAndInterests,socialVibe}', '')
      ),
      'prompts', jsonb_build_object(
        'bringsYouHere', '',
        'hopingToMeet', '',
        'perfectWeekend', coalesce(draft #>> '{prompts,perfectWeekend}', ''),
        'favoriteLocalActivities', coalesce(draft #>> '{prompts,favoriteLocalActivities}', ''),
        'icebreaker', case
          when length(trim(coalesce(draft #>> '{prompts,icebreaker}', ''))) > 0
            then draft #>> '{prompts,icebreaker}'
          else coalesce(draft #>> '{prompts,intoLately}', '')
        end,
        'intoLately', '',
        'valueInCommunity', ''
      ),
      'photos', case
        when jsonb_typeof(draft -> 'photos') = 'array' then (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', photo ->> 'id',
                'storagePath', photo ->> 'storagePath',
                'isPrimary', coalesce((photo ->> 'isPrimary')::boolean, false),
                'facePhotoConfirmed', coalesce((photo ->> 'facePhotoConfirmed')::boolean, false)
              )
            ),
            '[]'::jsonb
          )
          from jsonb_array_elements(draft -> 'photos') as photo
        )
        else '[]'::jsonb
      end,
      'agreements', jsonb_build_object(
        'codeOfConduct', false,
        'informationAccurate', false,
        'approvalRequired', false,
        'verificationConsent', false,
        'ageEligibilityConfirmed', false
      )
    )
  end;
$$;

comment on function public.member_public_profile(jsonb) is
  'Public profile slice. Invoker: it only transforms jsonb the owner view already read. Internal review prompts are blank. Icebreaker falls back to legacy intoLately.';

revoke all on function public.member_public_profile(jsonb) from public;
revoke all on function public.member_public_profile(jsonb) from anon;
grant execute on function public.member_public_profile(jsonb) to authenticated;

-- Other-member checks cannot select public.profiles under the caller's RLS.
create or replace function public.is_approved_active_member(member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = member_id
      and application_status = 'approved'
      and removed_at is null
  );
$$;

comment on function public.is_approved_active_member(uuid) is
  'True when that profile is approved and not removed. Used by policies that must see another member after the broad profile select policy is dropped.';

revoke all on function public.is_approved_active_member(uuid) from public;
revoke all on function public.is_approved_active_member(uuid) from anon;
grant execute on function public.is_approved_active_member(uuid) to authenticated;
grant execute on function public.is_approved_active_member(uuid) to service_role;

drop view if exists public.member_directory_profiles;

create view public.member_directory_profiles
with (security_invoker = false, security_barrier = true) as
select
  p.id,
  p.full_name,
  p.role,
  p.created_at,
  p.application_status,
  p.membership_intent,
  p.verified_at,
  p.location_area,
  case
    when p.show_contact_email then p.contact_email
    else null
  end as contact_email,
  p.show_contact_email,
  p.discovery_intent,
  p.discovery_interests,
  p.discovery_industry,
  p.connection_intents,
  p.connections_open_to,
  public.member_public_profile(p.application_draft) as public_profile,
  (
    coalesce(p.verification_state ->> 'email', '') = 'approved'
    and coalesce(p.verification_state ->> 'phone', '') = 'approved'
    and coalesce(p.verification_state ->> 'profile_reviewed', '') = 'approved'
    and coalesce(p.verification_state ->> 'photo_reviewed', '') = 'approved'
    and coalesce(p.verification_state ->> 'locality', '') = 'approved'
  ) as profile_checks_approved,
  p.removed_at
from public.profiles p
where p.application_status = 'approved'
  and p.removed_at is null
  and exists (
    select 1
    from public.profiles viewer
    where viewer.id = (select auth.uid())
      and viewer.removed_at is null
      and (
        viewer.application_status = 'approved'
        or viewer.role = any (array['admin'::text, 'host'::text])
      )
  );

comment on view public.member_directory_profiles is
  'Approved, not-removed profiles for an approved, host, or admin viewer who is not removed. Runs as the view owner so private profile columns are not selectable. Pending applicants get no rows.';

revoke all on public.member_directory_profiles from public;
revoke all on public.member_directory_profiles from anon;
grant select on public.member_directory_profiles to authenticated;

-- Vouchee and photo-owner checks read another profile through the helper.
-- The voucher and the photo viewer still use their own row, which RLS still
-- allows, and that row must not be removed. A removed host or admin is denied
-- the same way as a removed approved member.
drop policy if exists "Approved members create vouches" on public.member_vouches;
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
        and voucher.removed_at is null
    )
    and public.is_approved_active_member(vouchee_id)
  );

drop policy if exists "Approved members read approved member photos" on storage.objects;
create policy "Approved members read approved member photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'application-photos'
  and exists (
    select 1
    from public.profiles viewer_profile
    where viewer_profile.id = (select auth.uid())
      and viewer_profile.removed_at is null
      and (
        viewer_profile.application_status = 'approved'
        or viewer_profile.role = any (array['admin'::text, 'host'::text])
      )
  )
  and public.is_approved_active_member(
    case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);
