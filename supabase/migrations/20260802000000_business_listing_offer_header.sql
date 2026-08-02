-- Club offer + header image for Business Directory listings.
-- Category remains in the schema (default '') but is no longer collected in the app.

alter table public.business_listings
  add column if not exists club_offer text not null default '',
  add column if not exists header_image_url text;

-- Public bucket so approved directory cards can render logos without signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-listing-images',
  'business-listing-images',
  true,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated read business-listing-images bucket" on storage.buckets;

create policy "Authenticated read business-listing-images bucket"
on storage.buckets
for select
to authenticated
using (id = 'business-listing-images');

drop policy if exists "Members upload own business listing images" on storage.objects;
drop policy if exists "Members update own business listing images" on storage.objects;
drop policy if exists "Members delete own business listing images" on storage.objects;
drop policy if exists "Public read business listing images" on storage.objects;
drop policy if exists "Admins read business listing images" on storage.objects;

create policy "Members upload own business listing images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-listing-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Members update own business listing images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-listing-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'business-listing-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Members delete own business listing images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-listing-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Public read business listing images"
on storage.objects
for select
to public
using (bucket_id = 'business-listing-images');

create policy "Admins read business listing images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'business-listing-images'
  and public.is_admin((select auth.uid()))
);
