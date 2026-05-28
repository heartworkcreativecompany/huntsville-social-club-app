-- Ensure private application-photos bucket and RLS policies exist (idempotent).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-photos',
  'application-photos',
  false,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Allow authenticated clients to resolve bucket metadata (getBucket / uploads).
drop policy if exists "Authenticated read application-photos bucket" on storage.buckets;

create policy "Authenticated read application-photos bucket"
on storage.buckets
for select
to authenticated
using (id = 'application-photos');

drop policy if exists "Applicants upload own application photos" on storage.objects;
drop policy if exists "Applicants read own application photos" on storage.objects;
drop policy if exists "Applicants update own application photos" on storage.objects;
drop policy if exists "Applicants delete own application photos" on storage.objects;
drop policy if exists "Admins read application photos" on storage.objects;

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
