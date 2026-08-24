-- Document that existing sms_marketing_* columns now store optional
-- account-notification SMS consent (non-promotional). Column names are kept
-- so STOP/HELP webhook lookups and prior consent records continue to work.

comment on column public.profiles.phone_verified_at is
  'When the member last completed one-time SMS phone verification (account security). Separate from account-notification SMS consent.';

comment on column public.profiles.sms_marketing_opt_in is
  'True only after affirmative optional consent for non-promotional account-notification SMS (application/account updates, RSVP confirmations, and reminders for events the member registers to attend). Default false. Historical column name.';

comment on column public.profiles.sms_marketing_opt_in_at is
  'Timestamp of the current affirmative account-notification SMS opt-in. Preserved across resends unless newly granted or consent version changes.';

comment on column public.profiles.sms_marketing_consent_version is
  'Version id of the account-notification SMS consent copy the member agreed to (e.g. 2026-08-24).';

comment on column public.profiles.sms_marketing_consent_source is
  'Form/page source for account-notification SMS consent (e.g. membership_phone_verification_web).';

comment on column public.profiles.sms_marketing_consent_phone_e164 is
  'E.164 mobile number associated with the account-notification SMS consent record at opt-in time.';

comment on column public.profiles.sms_marketing_opted_out_at is
  'When the member opted out of account-notification SMS (e.g. STOP). Null while opted in.';
