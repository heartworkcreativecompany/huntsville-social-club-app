/**
 * Application-status database webhook → Resend custom event.
 *
 * JWT verification is disabled in config.toml (`verify_jwt = false`) so the
 * trusted database webhook can POST without a Supabase JWT. Authorization is
 * APPLICATION_STATUS_WEBHOOK_SECRET via x-application-status-webhook-secret.
 *
 * Do not deploy or invoke this function from this change set.
 */
import {
  createProductionDeps,
  handleApplicationStatusEmailRequest,
} from "./handler.ts";

Deno.serve((request) =>
  handleApplicationStatusEmailRequest(
    request,
    createProductionDeps((name) => Deno.env.get(name), fetch),
  )
);
