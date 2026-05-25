drop policy "Users can insert their own events" on "public"."events";

drop policy "Users can view their own events" on "public"."events";

drop policy "Users can update their own profile" on "public"."profiles";


  create table "public"."event_attendees" (
    "event_id" uuid not null,
    "user_id" uuid not null,
    "status" text not null default 'going'::text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."event_attendees" enable row level security;

alter table "public"."events" add column "status" text not null default 'published'::text;

alter table "public"."profiles" add column "role" text not null default 'member'::text;

CREATE INDEX event_attendees_event_id_idx ON public.event_attendees USING btree (event_id);

CREATE UNIQUE INDEX event_attendees_event_id_user_id_key ON public.event_attendees USING btree (event_id, user_id);

CREATE UNIQUE INDEX event_attendees_pkey ON public.event_attendees USING btree (event_id, user_id);

CREATE INDEX event_attendees_user_id_idx ON public.event_attendees USING btree (user_id);

CREATE INDEX idx_event_attendees_event_id ON public.event_attendees USING btree (event_id);

CREATE INDEX idx_event_attendees_event_id_status ON public.event_attendees USING btree (event_id, status);

CREATE INDEX idx_event_attendees_user_id ON public.event_attendees USING btree (user_id);

CREATE INDEX idx_events_created_at ON public.events USING btree (created_at DESC);

CREATE INDEX idx_events_owner_id ON public.events USING btree (owner_id);

CREATE INDEX idx_events_status ON public.events USING btree (status);

alter table "public"."event_attendees" add constraint "event_attendees_pkey" PRIMARY KEY using index "event_attendees_pkey";

alter table "public"."event_attendees" add constraint "event_attendees_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE not valid;

alter table "public"."event_attendees" validate constraint "event_attendees_event_id_fkey";

alter table "public"."event_attendees" add constraint "event_attendees_event_id_user_id_key" UNIQUE using index "event_attendees_event_id_user_id_key";

alter table "public"."event_attendees" add constraint "event_attendees_status_check" CHECK ((status = ANY (ARRAY['going'::text, 'interested'::text, 'not_going'::text]))) not valid;

alter table "public"."event_attendees" validate constraint "event_attendees_status_check";

alter table "public"."event_attendees" add constraint "event_attendees_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."event_attendees" validate constraint "event_attendees_user_id_fkey";

alter table "public"."events" add constraint "events_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'cancelled'::text]))) not valid;

alter table "public"."events" validate constraint "events_status_check";

alter table "public"."profiles" add constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['member'::text, 'host'::text, 'admin'::text]))) not valid;

alter table "public"."profiles" validate constraint "profiles_role_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.is_admin(check_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select role = 'admin'
     from public.profiles
     where id = check_user_id),
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'member')
  on conflict (id) do nothing;

  return new;
end;
$function$
;

grant delete on table "public"."event_attendees" to "anon";

grant insert on table "public"."event_attendees" to "anon";

grant references on table "public"."event_attendees" to "anon";

grant select on table "public"."event_attendees" to "anon";

grant trigger on table "public"."event_attendees" to "anon";

grant truncate on table "public"."event_attendees" to "anon";

grant update on table "public"."event_attendees" to "anon";

grant delete on table "public"."event_attendees" to "authenticated";

grant insert on table "public"."event_attendees" to "authenticated";

grant references on table "public"."event_attendees" to "authenticated";

grant select on table "public"."event_attendees" to "authenticated";

grant trigger on table "public"."event_attendees" to "authenticated";

grant truncate on table "public"."event_attendees" to "authenticated";

grant update on table "public"."event_attendees" to "authenticated";

grant delete on table "public"."event_attendees" to "service_role";

grant insert on table "public"."event_attendees" to "service_role";

grant references on table "public"."event_attendees" to "service_role";

grant select on table "public"."event_attendees" to "service_role";

grant trigger on table "public"."event_attendees" to "service_role";

grant truncate on table "public"."event_attendees" to "service_role";

grant update on table "public"."event_attendees" to "service_role";


  create policy "Event owners can view attendees for their events"
  on "public"."event_attendees"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_attendees.event_id) AND (events.owner_id = ( SELECT auth.uid() AS uid))))));



  create policy "Users can RSVP to published events"
  on "public"."event_attendees"
  as permissive
  for insert
  to authenticated
with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = event_attendees.event_id) AND (events.status = 'published'::text))))));



  create policy "Users can create their own RSVPs"
  on "public"."event_attendees"
  as permissive
  for insert
  to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Users can delete their own RSVPs"
  on "public"."event_attendees"
  as permissive
  for delete
  to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Users can update their own RSVP"
  on "public"."event_attendees"
  as permissive
  for update
  to authenticated
using ((user_id = ( SELECT auth.uid() AS uid)))
with check ((user_id = ( SELECT auth.uid() AS uid)));



  create policy "Users can update their own RSVPs"
  on "public"."event_attendees"
  as permissive
  for update
  to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Users can view their own RSVPs"
  on "public"."event_attendees"
  as permissive
  for select
  to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Admins can delete any event"
  on "public"."events"
  as permissive
  for delete
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "Authenticated users can view visible events"
  on "public"."events"
  as permissive
  for select
  to authenticated
using (((owner_id = ( SELECT auth.uid() AS uid)) OR (visibility = ANY (ARRAY['members'::text, 'public'::text]))));



  create policy "Hosts and admins can insert their own events"
  on "public"."events"
  as permissive
  for insert
  to authenticated
with check (((owner_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ANY (ARRAY['host'::text, 'admin'::text])))))));



  create policy "Owners can delete their own events"
  on "public"."events"
  as permissive
  for delete
  to authenticated
using ((owner_id = ( SELECT auth.uid() AS uid)));



  create policy "Owners or admins can update events"
  on "public"."events"
  as permissive
  for update
  to authenticated
using (((owner_id = ( SELECT auth.uid() AS uid)) OR public.is_admin(( SELECT auth.uid() AS uid))))
with check (((owner_id = ( SELECT auth.uid() AS uid)) OR public.is_admin(( SELECT auth.uid() AS uid))));



  create policy "Users can view visible events, owners see own, admins see all"
  on "public"."events"
  as permissive
  for select
  to authenticated
using (((status = ANY (ARRAY['published'::text, 'cancelled'::text])) OR (owner_id = ( SELECT auth.uid() AS uid)) OR public.is_admin(( SELECT auth.uid() AS uid))));



  create policy "Admins can update other profiles"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using ((public.is_admin(( SELECT auth.uid() AS uid)) AND (id <> ( SELECT auth.uid() AS uid))))
with check ((public.is_admin(( SELECT auth.uid() AS uid)) AND (id <> ( SELECT auth.uid() AS uid))));



  create policy "Admins can view all profiles"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "Users can update their own profile except role"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using ((( SELECT auth.uid() AS uid) = id))
with check (((( SELECT auth.uid() AS uid) = id) AND (role = ( SELECT profiles_1.role
   FROM public.profiles profiles_1
  WHERE (profiles_1.id = ( SELECT auth.uid() AS uid))))));


CREATE TRIGGER set_event_attendees_updated_at BEFORE UPDATE ON public.event_attendees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


