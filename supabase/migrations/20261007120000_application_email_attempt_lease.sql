-- Forward-only audit states for application status events.
-- Does not delete or replay rows. Historic rows stay non-retryable.
-- processing_state defaults to historic so the currently deployed function
-- can still insert during the window before the replacement function is deployed.
-- next_attempt_at null means "not scheduled", never "due now".

alter table public.application_email_log
  add column if not exists processing_state text not null default 'historic';

alter table public.application_email_log
  add column if not exists claim_token uuid;

alter table public.application_email_log
  add column if not exists claimed_until timestamptz;

alter table public.application_email_log
  add column if not exists attempt_count integer not null default 0;

alter table public.application_email_log
  add column if not exists next_attempt_at timestamptz;

alter table public.application_email_log
  add column if not exists submission_version integer;

alter table public.application_email_log
  add column if not exists resend_event_name text;

-- The webhook persists the event before the profile reload. The confirmed
-- recipient is written later, under the lease, and is never taken from the
-- webhook body. Existing rows already have an address.
alter table public.application_email_log
  alter column recipient_email drop not null;

update public.application_email_log
set
  processing_state = 'historic',
  next_attempt_at = null,
  claim_token = null,
  claimed_until = null
where processing_state is distinct from 'historic'
   or next_attempt_at is not null
   or claim_token is not null
   or claimed_until is not null;

alter table public.application_email_log
  drop constraint if exists application_email_log_delivery_status_check;

alter table public.application_email_log
  add constraint application_email_log_delivery_status_check
  check (
    delivery_status = any (
      array[
        'queued'::text,
        'sent'::text,
        'failed'::text,
        'skipped'::text,
        'bounced'::text,
        'unconfirmed'::text
      ]
    )
  );

alter table public.application_email_log
  drop constraint if exists application_email_log_processing_state_check;

alter table public.application_email_log
  add constraint application_email_log_processing_state_check
  check (
    processing_state = any (
      array[
        'historic'::text,
        'contact_sync_pending'::text,
        'contact_sync_failed'::text,
        'missing_first_name'::text,
        'obsolete'::text,
        'event_submitting'::text,
        'event_accepted'::text,
        'event_submission_unknown'::text
      ]
    )
  );

alter table public.application_email_log
  drop constraint if exists application_email_log_attempt_count_check;

alter table public.application_email_log
  add constraint application_email_log_attempt_count_check
  check (attempt_count >= 0 and attempt_count <= 5);

alter table public.application_email_log
  drop constraint if exists application_email_log_schedule_check;

-- Null next_attempt_at is not a due time.
-- Retryable states are scheduled only while attempt_count < 5.
-- Exhausted rows keep the failure state, attempt_count >= 5, and null schedule.
alter table public.application_email_log
  add constraint application_email_log_schedule_check
  check (
    (
      processing_state = any (
        array[
          'historic'::text,
          'obsolete'::text,
          'event_submitting'::text,
          'event_accepted'::text,
          'event_submission_unknown'::text
        ]
      )
      and next_attempt_at is null
    )
    or (
      processing_state = any (
        array[
          'contact_sync_pending'::text,
          'contact_sync_failed'::text,
          'missing_first_name'::text
        ]
      )
      and (
        (attempt_count < 5 and next_attempt_at is not null)
        or (attempt_count >= 5 and next_attempt_at is null)
      )
    )
  );

alter table public.application_email_log
  drop constraint if exists application_email_log_event_identity_check;

alter table public.application_email_log
  add constraint application_email_log_event_identity_check
  check (
    processing_state = 'historic'
    or (
      submission_version is not null
      and submission_version > 0
      and resend_event_name is not null
      and length(trim(resend_event_name)) > 0
    )
  );

create index if not exists application_email_log_retry_idx
  on public.application_email_log (next_attempt_at, created_at)
  where processing_state = any (
    array[
      'contact_sync_pending'::text,
      'contact_sync_failed'::text,
      'missing_first_name'::text
    ]
  )
  and attempt_count < 5
  and next_attempt_at is not null;

comment on column public.application_email_log.processing_state is
  'Pipeline state. historic and obsolete are non-retryable. event_accepted is not email delivery.';

comment on column public.application_email_log.next_attempt_at is
  'Explicit next run time. Null means not scheduled: historic, obsolete, in-flight, terminal, or exhausted at attempt_count >= 5. Initial pending work uses the insert time, not null.';

-- Permitted owner transitions (claim_token matches, expected state, lease unexpired):
--   contact_sync_failed -> contact_sync_pending
--   missing_first_name -> contact_sync_pending
--   contact_sync_pending -> contact_sync_failed | missing_first_name | obsolete | event_submitting
--   event_submitting -> event_submitting | event_accepted | event_submission_unknown
-- Sweeper only: expired event_submitting -> event_submission_unknown.
-- historic and obsolete have no outbound transition.

create or replace function public.insert_application_email_pending(
  p_application_id uuid,
  p_recipient_email text,
  p_event_key text,
  p_application_status text,
  p_resend_event_name text,
  p_submission_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.application_email_log;
  existing public.application_email_log;
begin
  insert into public.application_email_log (
    application_id,
    recipient_user_id,
    recipient_email,
    event_key,
    application_status,
    delivery_status,
    error_message,
    resend_email_id,
    provider_event,
    processing_state,
    attempt_count,
    next_attempt_at,
    submission_version,
    resend_event_name
  )
  values (
    p_application_id,
    p_application_id,
    p_recipient_email,
    p_event_key,
    p_application_status,
    'queued',
    null,
    null,
    jsonb_build_object('event', p_resend_event_name, 'stage', 'claimed'),
    'contact_sync_pending',
    0,
    now(),
    p_submission_version,
    p_resend_event_name
  )
  returning * into inserted;

  return jsonb_build_object('inserted', true, 'row', to_jsonb(inserted));
exception
  when unique_violation then
    select *
    into existing
    from public.application_email_log
    where application_id = p_application_id
      and event_key = p_event_key;
    return jsonb_build_object('inserted', false, 'row', to_jsonb(existing));
end;
$$;

create or replace function public.acquire_application_email_lease(
  p_id uuid,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.application_email_log;
begin
  if p_lease_seconds is null or p_lease_seconds <= 0 or p_lease_seconds > 120 then
    raise exception 'invalid lease';
  end if;

  -- Count this attempt in the same update that installs the new owner.
  -- Reaching 5 clears the schedule so expiry cannot start a sixth attempt.
  update public.application_email_log
  set
    claim_token = gen_random_uuid(),
    claimed_until = now() + make_interval(secs => p_lease_seconds),
    attempt_count = attempt_count + 1,
    next_attempt_at = case
      when attempt_count + 1 >= 5 then null
      else next_attempt_at
    end
  where id = p_id
    and processing_state = any (
      array[
        'contact_sync_pending',
        'contact_sync_failed',
        'missing_first_name'
      ]::text[]
    )
    and attempt_count < 5
    and next_attempt_at is not null
    and next_attempt_at <= now()
    and (claimed_until is null or claimed_until <= now())
  returning * into updated;

  if updated.id is null then
    return jsonb_build_object('row', null);
  end if;

  return jsonb_build_object('row', to_jsonb(updated));
end;
$$;

create or replace function public.acquire_next_application_email_lease(
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen uuid;
  updated public.application_email_log;
begin
  if p_lease_seconds is null or p_lease_seconds <= 0 or p_lease_seconds > 120 then
    raise exception 'invalid lease';
  end if;

  select id
  into chosen
  from public.application_email_log
  where processing_state = any (
      array[
        'contact_sync_pending',
        'contact_sync_failed',
        'missing_first_name'
      ]::text[]
    )
    and attempt_count < 5
    and next_attempt_at is not null
    and next_attempt_at <= now()
    and (claimed_until is null or claimed_until <= now())
  order by next_attempt_at, created_at
  for update skip locked
  limit 1;

  if chosen is null then
    return jsonb_build_object('row', null);
  end if;

  update public.application_email_log
  set
    claim_token = gen_random_uuid(),
    claimed_until = now() + make_interval(secs => p_lease_seconds),
    attempt_count = attempt_count + 1,
    next_attempt_at = case
      when attempt_count + 1 >= 5 then null
      else next_attempt_at
    end
  where id = chosen
    and processing_state = any (
      array[
        'contact_sync_pending',
        'contact_sync_failed',
        'missing_first_name'
      ]::text[]
    )
    and attempt_count < 5
    and next_attempt_at is not null
    and next_attempt_at <= now()
    and (claimed_until is null or claimed_until <= now())
  returning * into updated;

  if updated.id is null then
    return jsonb_build_object('row', null);
  end if;

  return jsonb_build_object('row', to_jsonb(updated));
end;
$$;

create or replace function public.transition_application_email_attempt(
  p_id uuid,
  p_claim_token uuid,
  p_expected_state text,
  p_next_state text,
  p_attempt_count integer,
  p_next_attempt_at timestamptz,
  p_error_message text,
  p_delivery_status text,
  p_resend_email_id text,
  p_provider_event jsonb,
  p_lease_seconds integer,
  p_clear_lease boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.application_email_log;
  allowed boolean;
begin
  allowed := (
    (p_expected_state = 'contact_sync_failed' and p_next_state = 'contact_sync_pending')
    or (p_expected_state = 'missing_first_name' and p_next_state = 'contact_sync_pending')
    or (
      p_expected_state = 'contact_sync_pending'
      and p_next_state = any (
        array[
          'contact_sync_failed',
          'missing_first_name',
          'obsolete',
          'event_submitting'
        ]::text[]
      )
    )
    or (
      p_expected_state = 'event_submitting'
      and p_next_state = any (
        array[
          'event_submitting',
          'event_accepted',
          'event_submission_unknown'
        ]::text[]
      )
    )
  );

  if not allowed then
    return jsonb_build_object('row', null);
  end if;

  update public.application_email_log
  set
    processing_state = p_next_state,
    attempt_count = p_attempt_count,
    next_attempt_at = p_next_attempt_at,
    error_message = p_error_message,
    delivery_status = p_delivery_status,
    resend_email_id = p_resend_email_id,
    provider_event = p_provider_event,
    claimed_until = case
      when p_clear_lease then null
      when p_lease_seconds is not null then now() + make_interval(secs => p_lease_seconds)
      else claimed_until
    end,
    claim_token = case
      when p_clear_lease then null
      else claim_token
    end
  where id = p_id
    and claim_token = p_claim_token
    and processing_state = p_expected_state
    and attempt_count = p_attempt_count
    and claimed_until > now()
  returning * into updated;

  if updated.id is null then
    return jsonb_build_object('row', null);
  end if;

  return jsonb_build_object('row', to_jsonb(updated));
end;
$$;

create or replace function public.sweep_expired_event_submissions(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  swept integer;
begin
  if p_limit is null or p_limit <= 0 or p_limit > 25 then
    raise exception 'invalid sweep limit';
  end if;

  with picked as (
    select id
    from public.application_email_log
    where processing_state = 'event_submitting'
      and claimed_until is not null
      and claimed_until <= now()
    order by claimed_until
    limit p_limit
    for update skip locked
  )
  update public.application_email_log as log
  set
    processing_state = 'event_submission_unknown',
    claim_token = null,
    claimed_until = null,
    next_attempt_at = null,
    delivery_status = 'unconfirmed',
    error_message = 'event_submission_unknown',
    provider_event = jsonb_build_object('category', 'event_submission_unknown')
  from picked
  where log.id = picked.id;

  get diagnostics swept = row_count;
  return swept;
end;
$$;

create or replace function public.assign_application_email_recipient(
  p_id uuid,
  p_claim_token uuid,
  p_recipient_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.application_email_log;
begin
  if p_recipient_email is null or position('@' in p_recipient_email) = 0 then
    return jsonb_build_object('row', null);
  end if;

  update public.application_email_log
  set recipient_email = p_recipient_email
  where id = p_id
    and claim_token = p_claim_token
    and processing_state = 'contact_sync_pending'
    and claimed_until > now()
  returning * into updated;

  if updated.id is null then
    return jsonb_build_object('row', null);
  end if;

  return jsonb_build_object('row', to_jsonb(updated));
end;
$$;

revoke all on function public.insert_application_email_pending(uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.acquire_application_email_lease(uuid, integer) from public, anon, authenticated;
revoke all on function public.acquire_next_application_email_lease(integer) from public, anon, authenticated;
revoke all on function public.transition_application_email_attempt(uuid, uuid, text, text, integer, timestamptz, text, text, text, jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function public.sweep_expired_event_submissions(integer) from public, anon, authenticated;
revoke all on function public.assign_application_email_recipient(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.insert_application_email_pending(uuid, text, text, text, text, integer) to service_role;
grant execute on function public.acquire_application_email_lease(uuid, integer) to service_role;
grant execute on function public.acquire_next_application_email_lease(integer) to service_role;
grant execute on function public.transition_application_email_attempt(uuid, uuid, text, text, integer, timestamptz, text, text, text, jsonb, integer, boolean) to service_role;
grant execute on function public.sweep_expired_event_submissions(integer) to service_role;
grant execute on function public.assign_application_email_recipient(uuid, uuid, text) to service_role;
