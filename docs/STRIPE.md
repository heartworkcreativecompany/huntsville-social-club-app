## Stripe subscriptions

Paid memberships use **Stripe Checkout** (subscription mode), **webhooks** for access grants, and the **Stripe Customer Portal** for self-service billing.

### Environment variables

Copy `.env.example` to `.env.local` and set:

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Server-side Stripe API key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client publishable key (reserved for future Elements use) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret from Stripe CLI or Dashboard |
| `STRIPE_PRICE_ID_INNER_CIRCLE` | Monthly price ID for Inner Circle ($39/mo) |
| `STRIPE_PRICE_ID_ELITE_CIRCLE` | Monthly price ID for Elite Circle ($89/mo) |
| `NEXT_PUBLIC_APP_URL` | App base URL for Checkout success/cancel and Portal return URLs |
| `STRIPE_CHECKOUT_TRIAL_DAYS` | Optional default trial length for new checkouts |

`SUPABASE_SERVICE_ROLE_KEY` is required for webhook processing and idempotency ledger writes.

### Stripe Dashboard setup

1. Create products **Inner Circle** and **Elite Circle** with recurring **monthly** prices ($39 and $89).
2. Copy each **Price ID** into the env vars above.
3. Enable the **Customer Portal** (Settings → Billing → Customer portal).
4. Create **Coupons / Promotion codes** for beta testers as needed.
5. Add webhook endpoint: `https://<your-domain>/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`

### Local webhook testing

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the signing secret printed by the CLI as `STRIPE_WEBHOOK_SECRET`.

### Access grants

Paid messaging, Circle Socials, and event registration entitlements are granted **only after webhook-confirmed subscription state** is synced to `profiles.membership_billing`. The Checkout success page does not unlock access by itself.

### Promotion codes & trials

- Checkout has `allow_promotion_codes: true` — beta users can enter Stripe promotion codes at checkout.
- Optional `STRIPE_CHECKOUT_TRIAL_DAYS` applies a default trial to new subscriptions created via Checkout.
