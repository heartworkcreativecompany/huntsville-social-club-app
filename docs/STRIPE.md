## Stripe subscriptions

Paid memberships use **Stripe Checkout** (subscription mode), **webhooks** for access grants, and the **Stripe Customer Portal** for self-service billing.

### Membership → Stripe mapping (live mode)

| App tier | Stripe product | Live price ID | Amount |
|----------|----------------|---------------|--------|
| Member | _(none — free)_ | — | Free |
| Inner Circle | `prod_UqPcL4boAOiMZT` | `price_1TqimnBei7W40myBUKESC7wF` | $29.99/mo |
| Elite Circle | `prod_UqPciS4ul6FhvF` | `price_1TqimyBei7W40myBRnke6fQF` | $69.99/mo |
| Event sponsorship | `prod_UvwN6jDxbT9O28` | `price_1Tw4UjBei7W40myBOG1mkxQ5` | $499 one-time |

Canonical live price IDs are defined in `lib/stripe/config.ts` as `STRIPE_LIVE_PRICE_IDS`.  
**Checkout only requires `STRIPE_SECRET_KEY`.** Missing `STRIPE_PRICE_ID_*` env vars must not block billing — production uses the live IDs from `config.ts`.  
On Vercel production (`VERCEL_ENV=production`), checkout always uses those live IDs (env overrides are ignored).

### Environment variables

Copy `.env.example` to `.env.local` and set:

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Server-side Stripe API key (`sk_live_…` in production) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client publishable key (`pk_live_…` in production) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret from Stripe CLI or Dashboard |
| `STRIPE_PRICE_ID_INNER_CIRCLE` | Override for local **test** mode only |
| `STRIPE_PRICE_ID_ELITE_CIRCLE` | Override for local **test** mode only |
| `STRIPE_PRICE_ID_EVENT_SPONSORSHIP` | Override for local **test** mode only |
| `NEXT_PUBLIC_APP_URL` | **Required in Vercel Production.** Canonical origin for Checkout success/cancel and Portal return URLs (e.g. `https://huntsville-social-club-app.vercel.app`). Never a per-deployment `*.vercel.app` hash URL. |
| `STRIPE_CHECKOUT_TRIAL_DAYS` | Optional default trial length for new checkouts |

`SUPABASE_SERVICE_ROLE_KEY` is required for webhook processing and idempotency ledger writes.

### Stripe Dashboard setup

1. In **live mode**, create products **Inner Circle** and **Elite Circle** with recurring **monthly** prices ($29.99 and $69.99).
2. Confirm the live Price IDs match `STRIPE_LIVE_PRICE_IDS` in `lib/stripe/config.ts` (update that file if you recreate products).
3. Optional: create a one-time **Event Sponsorship** price ($499). Confirm the live Price ID matches `STRIPE_LIVE_PRICE_IDS.event_sponsorship`.
4. Enable the **Customer Portal** (Settings → Billing → Customer portal).
5. Create **Coupons / Promotion codes** for beta testers as needed.
6. Add a **live-mode** webhook endpoint: `https://<your-domain>/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
   - Identity (if enabled): `identity.verification_session.verified`, `identity.verification_session.requires_input`, `identity.verification_session.processing`, `identity.verification_session.canceled`
7. On your host (e.g. Vercel), set `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` to **live** values. Do not deploy `sk_test_` / `pk_test_` to production.

### Local webhook testing

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the signing secret printed by the CLI as `STRIPE_WEBHOOK_SECRET` (with test keys + optional test price ID env overrides).

### Access grants

Paid messaging, Circle Socials, and event registration entitlements are granted **only after webhook-confirmed subscription state** is synced to `profiles.membership_billing`. The Checkout success page does not unlock access by itself.

### Promotion codes & trials

- Checkout has `allow_promotion_codes: true` — beta users can enter Stripe promotion codes at checkout.
- Optional `STRIPE_CHECKOUT_TRIAL_DAYS` applies a default trial to new subscriptions created via Checkout.
