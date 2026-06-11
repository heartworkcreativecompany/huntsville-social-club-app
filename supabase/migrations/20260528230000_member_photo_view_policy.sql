-- Allow approved members to view application photos of other approved members.

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
      and (
        viewer_profile.application_status = 'approved'
        or viewer_profile.role = any (array['admin'::text, 'host'::text])
      )
  )
  and exists (
    select 1
    from public.profiles owner_profile
    where owner_profile.id::text = (storage.foldername(name))[1]
      and owner_profile.application_status = 'approved'
  )
);
