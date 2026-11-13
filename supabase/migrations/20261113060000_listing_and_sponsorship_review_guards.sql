-- Stop owners and sponsors from recording their own review decisions.
-- A missing JWT is not authorization. The payment webhook is trusted only
-- when the session role is service_role. That role may mark a
-- pending_payment or paid sponsorship paid, and may set
-- stripe_checkout_session_id on that update. It may set sponsor_id only
-- while the row stays paid, which is the link after a successful paid
-- update. Admins still review through is_admin(auth.uid()).
-- This migration does not update existing rows.

create or replace function public.sponsorship_payment_writer()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select current_user = 'service_role';
$$;

create or replace function public.business_listings_enforce_review()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.is_admin(auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending' then
      raise exception 'Business listings must be submitted as pending';
    end if;
    if new.admin_notes is not null or new.reviewed_at is not null then
      raise exception 'Only an admin can set business listing review metadata';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     or new.admin_notes is distinct from old.admin_notes
     or new.reviewed_at is distinct from old.reviewed_at
     or new.owner_id is distinct from old.owner_id
  then
    raise exception 'Only an admin can change a business listing review decision';
  end if;

  return new;
end;
$$;

create or replace function public.event_sponsorships_enforce_review()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.is_admin(auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending_payment' then
      raise exception 'Sponsorships must start as pending payment';
    end if;
    if new.paid_at is not null
       or new.approved_at is not null
       or new.stripe_payment_intent_id is not null
    then
      raise exception 'Payment and review fields cannot be set on a new sponsorship';
    end if;
    if new.amount_cents is distinct from 49900 or new.ticket_count is distinct from 4 then
      raise exception 'Sponsorship price and ticket count are fixed';
    end if;
    return new;
  end if;

  if public.sponsorship_payment_writer() then
    if new.event_id is distinct from old.event_id
       or new.sponsor_user_id is distinct from old.sponsor_user_id
       or new.business_name is distinct from old.business_name
       or new.contact_email is distinct from old.contact_email
       or new.amount_cents is distinct from old.amount_cents
       or new.ticket_count is distinct from old.ticket_count
       or new.logo_url is distinct from old.logo_url
       or new.notes is distinct from old.notes
       or new.created_at is distinct from old.created_at
       or new.approved_at is distinct from old.approved_at
       or new.sort_order is distinct from old.sort_order
    then
      raise exception 'Payment processing cannot change sponsorship content or review metadata';
    end if;

    if new.status is distinct from old.status
       and not (
         old.status in ('pending_payment', 'paid')
         and new.status = 'paid'
       )
    then
      raise exception 'Payment processing can only mark a reserved sponsorship paid';
    end if;

    if (
         new.paid_at is distinct from old.paid_at
         or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
       )
       and new.status is distinct from 'paid'
    then
      raise exception 'Payment fields belong on a paid sponsorship';
    end if;

    if new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id
       and not (
         old.status in ('pending_payment', 'paid')
         and new.status = 'paid'
       )
    then
      raise exception 'Payment processing can only record a checkout session when marking a sponsorship paid';
    end if;

    if new.sponsor_id is distinct from old.sponsor_id
       and not (old.status = 'paid' and new.status = 'paid')
    then
      raise exception 'Payment processing can only link a sponsor after the sponsorship is paid';
    end if;

    return new;
  end if;

  if new.event_id is distinct from old.event_id
     or new.sponsor_user_id is distinct from old.sponsor_user_id
     or new.sponsor_id is distinct from old.sponsor_id
     or new.amount_cents is distinct from old.amount_cents
     or new.ticket_count is distinct from old.ticket_count
     or new.sort_order is distinct from old.sort_order
     or new.paid_at is distinct from old.paid_at
     or new.approved_at is distinct from old.approved_at
     or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
     or new.created_at is distinct from old.created_at
  then
    raise exception 'That sponsorship field is reserved for payment processing or admin review';
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'pending_payment' and new.status = 'cancelled')
  then
    raise exception 'Only an admin can record that sponsorship decision';
  end if;

  return new;
end;
$$;

drop trigger if exists business_listings_enforce_review on public.business_listings;
create trigger business_listings_enforce_review
  before insert or update on public.business_listings
  for each row
  execute function public.business_listings_enforce_review();

drop trigger if exists event_sponsorships_enforce_review on public.event_sponsorships;
create trigger event_sponsorships_enforce_review
  before insert or update on public.event_sponsorships
  for each row
  execute function public.event_sponsorships_enforce_review();

revoke all on function public.sponsorship_payment_writer() from public;
grant execute on function public.sponsorship_payment_writer() to authenticated, service_role;

revoke all on function public.business_listings_enforce_review() from public;
grant execute on function public.business_listings_enforce_review() to authenticated, service_role;

revoke all on function public.event_sponsorships_enforce_review() from public;
grant execute on function public.event_sponsorships_enforce_review() to authenticated, service_role;
