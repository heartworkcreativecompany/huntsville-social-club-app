# Meta Pixel

Website PageView tracking reads `NEXT_PUBLIC_META_PIXEL_ID`. Browser events do not include application, dating, identity-verification, questionnaire, profile, or message content.

## Verify after deploy

1. Set `NEXT_PUBLIC_META_PIXEL_ID` in Vercel Production and Preview, then deploy. Next.js inlines this value at build time.
2. Open Meta Events Manager, then HSC Pixel, then Test Events.
3. Visit the production website.
4. Confirm a PageView event is received.
5. Use the Meta Pixel Helper browser extension as an additional check that the pixel loads.

Conversions API is not implemented. Application, subscription, and purchase events are not sent.
