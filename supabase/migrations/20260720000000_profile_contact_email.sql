-- Optional public contact email, separate from account/login email (profiles.email).

alter table public.profiles
  add column if not exists contact_email text,
  add column if not exists show_contact_email boolean not null default false;

comment on column public.profiles.contact_email is
  'Optional email members may share on their public profile. Never falls back to account email.';

comment on column public.profiles.show_contact_email is
  'When true, contact_email is visible to signed-in approved members on directory/profile pages.';
