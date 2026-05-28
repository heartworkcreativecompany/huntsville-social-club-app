-- Application intake v2: private photo storage for membership applications

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-photos',
  'application-photos',
  false,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "Applicants upload own application photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'application-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Applicants read own application photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'application-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Applicants update own application photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'application-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'application-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Applicants delete own application photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'application-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Admins read application photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'application-photos'
  and public.is_admin((select auth.uid()))
);
