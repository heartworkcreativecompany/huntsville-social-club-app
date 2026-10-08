# Application email lease integration tests

`npm test` and `npm run test:watch` do not run this suite. The destructive
setup lives in `lease.integration.test.ts` and is excluded from the default
Vitest config.

## Safety checks

The suite throws before opening a connection unless all three are true:

1. `APPLICATION_EMAIL_LEASE_DESTRUCTIVE_TEST=1`
2. `LEASE_TEST_DATABASE_URL` uses a loopback host (`127.0.0.1`, `localhost`, or `::1`)
3. That URL's database name is exactly `hsc_application_email_lease_test`

Loopback and port 55432 do not authorize any other database. The error text
does not include the connection string. Destructive statements are fixed SQL
for `hsc_application_email_lease_test` only, and they run only after
`current_database()` on the maintenance connection is `postgres`.

## Setup

Use a disposable local Postgres, not a shared or production server:

```bash
docker run --name hsc-lease-pg \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -p 55432:5432 \
  -d postgres:16
```

Port 55432 is the local example. It is not a safety check.

## Run

```bash
npm run test:integration:application-email-lease
```

That command sets the opt-in and:

`postgres://postgres@127.0.0.1:55432/hsc_application_email_lease_test`

The suite then:

1. Connects to the maintenance database `postgres`.
2. Terminates sessions on `hsc_application_email_lease_test` and replaces that database.
3. Connects to the new database, checks `current_database()`, and builds the pre-migration `application_email_log` fixture there.
4. Applies `supabase/migrations/20261007120000_application_email_attempt_lease.sql`.

It does not drop schema `public` on the maintenance database.

If `anon`, `authenticated`, or `service_role` is missing, the suite creates
that cluster role. Those roles are cluster-wide, so teardown does not drop
them.

## Teardown

When the suite finishes, including after a failed test, it disconnects and
drops `hsc_application_email_lease_test`.

Remove the disposable server when you are done:

```bash
docker rm -f hsc-lease-pg
```

If the process is killed before teardown, drop only the test database:

```bash
docker exec hsc-lease-pg \
  psql -U postgres -c 'drop database if exists hsc_application_email_lease_test'
```
