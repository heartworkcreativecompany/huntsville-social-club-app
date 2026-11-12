-- member_directory_profiles runs as its owner and is auto-updatable. Default
-- privileges had also granted authenticated every command, so a signed-in
-- member could update or delete profiles through the view and bypass profiles
-- RLS. member_public_recognition_badges is owner-run too and had the same
-- authenticated write grants.
--
-- public and anon already have no EXECUTE on is_approved_active_member(uuid)
-- or member_public_profile(jsonb). authenticated and service_role keep theirs.

revoke all on public.member_directory_profiles from public, anon, authenticated;
grant select on public.member_directory_profiles to authenticated;
grant select on public.member_directory_profiles to service_role;

revoke all on public.member_public_recognition_badges from public, anon, authenticated;
grant select on public.member_public_recognition_badges to authenticated;
grant select on public.member_public_recognition_badges to service_role;
