-- Circle Social credits on entitlement cycles.
-- Inner Circle new/renewed cycles receive 2 credits per billing period.
-- NULL granted = unlimited for this cycle (Elite Circle, and Inner Circle
-- cycles already open at rollout — prospective enforcement on the next cycle).
-- Does not modify historical credits_granted / credits_used (premium events).

alter table public.membership_entitlement_cycles
  add column if not exists circle_social_credits_granted integer,
  add column if not exists circle_social_credits_used integer not null default 0;

comment on column public.membership_entitlement_cycles.circle_social_credits_granted is
  'Inner Circle Circle Social credits granted this period (2). Null = unlimited (Elite, or Inner Circle current period at rollout).';

comment on column public.membership_entitlement_cycles.circle_social_credits_used is
  'Circle Social credits consumed this billing period. Unused for Elite (granted is null).';

alter table public.membership_entitlement_cycles
  drop constraint if exists membership_entitlement_cycles_circle_social_nonneg;

alter table public.membership_entitlement_cycles
  add constraint membership_entitlement_cycles_circle_social_nonneg
  check (circle_social_credits_used >= 0);
