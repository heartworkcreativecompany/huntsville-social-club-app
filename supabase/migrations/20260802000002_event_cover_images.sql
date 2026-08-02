-- Optional event cover images (public storage, same pattern as business listing headers).

alter table public.events
  add column if not exists cover_image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-images',
  'event-images',
  true,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated read event-images bucket" on storage.buckets;

create policy "Authenticated read event-images bucket"
on storage.buckets
for select
to authenticated
using (id = 'event-images');

drop policy if exists "Members upload own event images" on storage.objects;
drop policy if exists "Members update own event images" on storage.objects;
drop policy if exists "Members delete own event images" on storage.objects;
drop policy if exists "Public read event images" on storage.objects;
drop policy if exists "Admins read event images" on storage.objects;

create policy "Members upload own event images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Members update own event images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'event-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'event-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Members delete own event images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Public read event images"
on storage.objects
for select
to public
using (bucket_id = 'event-images');

create policy "Admins read event images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'event-images'
  and public.is_admin((select auth.uid()))
);
