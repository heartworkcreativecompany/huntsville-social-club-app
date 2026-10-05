# Meta Pixel

Website events read `NEXT_PUBLIC_META_PIXEL_ID`. Browser events do not include names, emails, phones, user IDs, application IDs, profile content, photos, verification data, questionnaire answers, interests, values, relationship or dating preferences, messages, age, or location.

The same pixel bootstrap used for PageView sends these application events. Do not add a second pixel or enable Meta automatic event tracking for them.

## PageView

Fires once on the initial page load, after the pixel bootstrap defines `fbq`, and again when the path or query string changes. The first URL is not sent twice.

## ViewContent

Fires once per browser session when a visitor views `/signup`, the public application start page.

Parameters:

- `content_name`: `HSC Application`
- `content_category`: `Membership Application`

It does not fire on login, profile, verification, or other pages. Refresh, back navigation, and React remounts in the same session do not send it again.

## Lead

Fires once per browser session only after `supabase.auth.signUp` succeeds in `app/signup/page.tsx`. A button click, a failed signup, or a validation error does not send it. The event has no parameters. Refresh, redirect, retry, back navigation, and React remounts in the same session do not send it again.

## CompleteRegistration

Fires once per browser session only after `submitApplication` in `app/(club)/application/actions.ts` persists the application and returns success. The call is made from the application form after that success, before the redirect to `/application/status?submitted=1`. A click, loading state, validation failure, or failed save does not send it. Revisiting or refreshing the status page does not send it.

Parameters:

- `content_name`: `HSC Application`
- `content_category`: `Membership Application`

## Verify in Meta Test Events

1. Confirm `NEXT_PUBLIC_META_PIXEL_ID` is set in Vercel Production and Preview. Next.js inlines it at build time.
2. Open Meta Events Manager, then HSC Pixel, then Test Events.
3. Visit `/signup` and confirm one ViewContent event. Refresh the page and confirm it does not arrive again.
4. Create an account successfully and confirm one Lead event. A failed attempt must not create a Lead. Refresh the success state and confirm Lead does not arrive again.
5. Submit a complete membership application and confirm one CompleteRegistration event. Refresh `/application/status?submitted=1` and confirm it does not arrive again.
6. Use the Meta Pixel Helper browser extension as an additional check.

Conversions API, subscription events, approval events, and Purchase events are not implemented.
