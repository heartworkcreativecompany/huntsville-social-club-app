# Supabase CLI setup

This repo includes Supabase CLI scaffolding so database schema changes can be tracked as migrations. **No remote schema changes have been applied from this setup yet.**

## 1. Install the Supabase CLI (if needed)

Pick one:

```bash
# macOS (Homebrew)
brew install supabase/tap/supabase

# Or run via npx without a global install (used below)
npx supabase --version
```

Docs: https://supabase.com/docs/guides/cli

## 2. Initialize the local Supabase folder (already done in this repo)

If you clone this repo on a new machine and `supabase/` is missing, run:

```bash
npx supabase init
```

This repo already has `supabase/config.toml` and `supabase/migrations/` from a prior init.

## 3. Log in to Supabase

```bash
npx supabase login
```

This opens a browser flow and stores credentials for CLI commands.

## 4. Find your project ref

In the [Supabase dashboard](https://supabase.com/dashboard), open your project. The project ref is the ID in the URL:

```text
https://supabase.com/dashboard/project/<YOUR_PROJECT_REF>/...
```

Example: if the URL is `https://supabase.com/dashboard/project/abcdefghijklmnop/...`, then `abcdefghijklmnop` is your project ref.

You can also find it under **Project Settings → General → Reference ID**.

## 5. Link this repo to your remote project

From the project root:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

Replace `YOUR_PROJECT_REF` with your actual ref. You will be prompted for your database password (from **Project Settings → Database**).

This creates `supabase/.temp/` metadata locally (gitignored). It does **not** change your remote database.

## 6. Pull the current remote schema into migrations

After linking, capture schema that already exists in the dashboard (tables, RLS, triggers, etc.):

```bash
npx supabase db pull
```

**What `db pull` does:** Reads your **linked remote** database and writes SQL migration file(s) under `supabase/migrations/` so the repo matches production. Use this when you (or the dashboard) already created objects remotely and you want version control to catch up.

**What it does not do:** It does not run `db reset` or wipe data. Review the generated migration files before committing.

## 7. Day-to-day workflow (future schema changes)

1. Create a new migration file:

   ```bash
   npx supabase migration new describe_your_change
   ```

2. Edit the SQL in `supabase/migrations/<timestamp>_describe_your_change.sql`.

3. Apply to the linked remote project:

   ```bash
   npx supabase db push
   ```

Prefer migrations + `db push` over one-off dashboard edits once this workflow is in place, so schema stays in Git.

## 8. Commands to avoid unless you mean it

- `npx supabase db reset` — resets **local** dev database; destructive for local data.
- `npx supabase migration repair` — fixes migration history; only use when you understand drift.
- Do not run `db push` until you have reviewed migration files.

## 9. Commit to Git

Commit the `supabase/` folder (especially `config.toml` and `supabase/migrations/*.sql` after `db pull` or new migrations). Do **not** commit secrets, `.env.local`, or `supabase/.temp/`.

## 10. Optional: regenerate TypeScript types

After schema is in sync:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_REF > lib/database.types.ts
```

Replace the temporary manual types in `lib/database.types.ts` when ready.
