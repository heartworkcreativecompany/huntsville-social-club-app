-- Entitlement cycle counters and registration ledger were SELECT-only for
-- authenticated members. Credit/guest mutations via the user-scoped client
-- silently no-oped (0 rows), so RSVP could report usedCredit while remaining
-- stayed at 2. Allow members to update their own cycle counters and insert
-- their own ledger rows. Server actions still prefer the service-role client.

create policy "Members update own entitlement cycles"
  on public.membership_entitlement_cycles
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  )
  with check (
    user_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

create policy "Members insert own registration ledger"
  on public.event_registration_ledger
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );
