-- Event sponsorship customer-facing price is $499 per event (one-time).
-- Historical paid rows keep their recorded amount_cents.
-- Live Stripe Price ID is unchanged (price_1Tw4UjBei7W40myBOG1mkxQ5).

comment on column public.events.sponsorship_eligible is
  'When true, businesses may purchase a $499 per-event sponsorship (Circle Socials / Premium).';

alter table public.event_sponsorships
  alter column amount_cents set default 49900;

comment on column public.event_sponsorships.amount_cents is
  'One-time event sponsorship amount in cents. Default 49900 ($499 per event).';
