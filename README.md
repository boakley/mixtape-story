# mixtapestory.com

**Share the music, share the stories.**

A web app for making and sharing **mixtape stories** — a curated collection of songs, each accompanied by writing about why that song matters. Mixtapes are made *for* people: the v1 audience is a small contemplative-writing group, geographically scattered, using it to get to know one another.

Live at [mixtapestory.com](https://mixtapestory.com).

## Why this repo is public

This codebase doubles as a working example of AI-collaborative quality engineering. It was built by an experienced SDET directing Claude Code, and the interesting part isn't that AI wrote code — it's the judgment trail: which things to ask AI to do, in what order, with what verification step.

The headline numbers: a 100× stress run of the Playwright E2E suite passes 3,000 for 3,000 — zero flakes — re-verified after every framework change. With retries disabled entirely, every residual failure classified as local infrastructure: zero product bugs, zero test bugs.

The full write-up lives at [developer.mixtapestory.com](https://developer.mixtapestory.com): the flake story end to end, plus 26 specific judgment calls that built the framework.

If you came for the testing story, start here:

- [`docs/TESTING.md`](docs/TESTING.md) — philosophy, page-object design, and the deliberate omissions
- [`testing/e2e/tests/`](testing/e2e/tests/) — numbered specs that read top-to-bottom as the v1 user journey
- [`testing/e2e/helpers/hydration.ts`](testing/e2e/helpers/hydration.ts) — the hydration fence that took one spec's 14% flake rate to zero, suite-wide
- [`testing/e2e/pages/`](testing/e2e/pages/) — page objects that speak the product's vocabulary, doubling as scripts for demo videos

Product context:

- [`CLAUDE.md`](CLAUDE.md) — operative product decisions
- [`docs/design-notes.md`](docs/design-notes.md) — rationale and open questions
- [`docs/design-language.md`](docs/design-language.md) — visual conventions
- [`docs/mixtapestories-vision.md`](docs/mixtapestories-vision.md) — the longer-form vision
- [`docs/archive/`](docs/archive/) — the build plans and design explorations for v1 and v1.5, kept for historical context

## Stack

SvelteKit 2 (Svelte 5, TypeScript strict) · Tailwind v4 · `@sveltejs/adapter-cloudflare` · Cloudflare Pages (hosting) · Supabase (Postgres + Auth) · Resend (transactional email).

## Local development

Prerequisites: Node 22 (pinned in `.nvmrc`), pnpm, and Docker Desktop (for the local Supabase stack).

```sh
pnpm install
pnpm exec supabase start    # local Postgres + Auth, ~5 min first time
pnpm dev                    # http://localhost:5173
pnpm check                  # type-check + Svelte check
pnpm build                  # production build → .svelte-kit/cloudflare/
```

Env: `.env.local` (gitignored) holds dev-only values (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_SITE_URL`). See `.env.example` for the keys. Get the local stack's anon key with `pnpm exec supabase status -o env`.

Auth flow locally: sign-in emails are caught by **Mailpit** at http://127.0.0.1:54324 (not your real inbox). Open it to find the magic link.

## Seed data

The POC's mixtape lives at `src/lib/seed/bryan.csv`. Six columns:

```
year, song, album, artist, link, story
```

- Lines starting with `#` are comments; blank lines are skipped.
- Stories may contain commas — the parser splits on the first 5 only, so the story field captures everything after.
- `link` is a [song.link / Odesli](https://song.link) URL, resolved by hand: paste your Spotify/Apple URL into song.link, copy the resulting `https://song.link/...` URL into the CSV.
- Editing the CSV hot-reloads in dev.

## Deploying

Production lives on **Cloudflare Pages**, project name `mixtapestory`. Available at:

- https://mixtapestory.com — canonical custom domain
- https://www.mixtapestory.com — alias
- https://mixtapestory.pages.dev — Cloudflare alias for the production branch
- `https://<deployment-hash>.mixtapestory.pages.dev` — unique URL for every deploy

### To deploy a change

```sh
pnpm build
pnpm exec wrangler pages deploy \
  --project-name=mixtapestory \
  --branch=main \
  --commit-dirty=true
```

Wrangler reads settings from [`wrangler.toml`](wrangler.toml) — notably `compatibility_flags = ["nodejs_compat"]`, which SvelteKit's runtime requires — uploads the build, and prints the new URL. Because we deploy to `--branch=main` (the production branch), this refreshes both `mixtapestory.com` and `mixtapestory.pages.dev`.

`--commit-dirty=true` lets us deploy without first committing every change. Useful while iterating; remember to commit anything worth keeping.

### Production env vars

`pnpm build` reads `.env.production.local` (gitignored) and bakes the `PUBLIC_*` values into the bundle. To deploy against the production Supabase project, that file must contain `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, and `PUBLIC_SITE_URL=https://mixtapestory.com`. Anon key is recoverable any time via `pnpm exec supabase projects api-keys --project-ref kudxongbgeaylfpcmick`.

### One-time setup (already configured; here for the record)

**Hosting & DNS**

- Cloudflare account.
- A Cloudflare API token with **Cloudflare Pages: Edit** permission, exported as `CLOUDFLARE_API_TOKEN` in `~/.zshenv` (so non-interactive shells — including this `wrangler` invocation — pick it up). Create tokens at https://dash.cloudflare.com/profile/api-tokens.
- Cloudflare Pages project named `mixtapestory`, production branch `main`. Created once with `pnpm exec wrangler pages project create mixtapestory --production-branch=main`.
- Custom domains (`mixtapestory.com`, `www.mixtapestory.com`) attached in **Workers & Pages → mixtapestory → Custom domains**. DNS lives on Cloudflare; registrar is Porkbun.

**Supabase (auth + database)**

- Production project `mixtapestory`, ref `kudxongbgeaylfpcmick`, region East US.
- CLI linked locally via `pnpm exec supabase link --project-ref kudxongbgeaylfpcmick`. Push schema changes with `pnpm exec supabase db push`.
- Migrations live in [`supabase/migrations/`](supabase/migrations/) — source of truth for the schema. Local stack applies them via `supabase db reset`.
- Auth → URL Configuration in the dashboard: **Site URL** is `https://mixtapestory.com`, **Redirect URLs** includes `https://mixtapestory.com/auth/callback`. Mismatching either of these will reject the magic-link redirect after the user clicks the email.

**Email (Resend)**

- Supabase's default mail service is replaced with custom SMTP via **Resend**. Configured at **Project Settings → Auth → SMTP Settings** in the Supabase dashboard.
- SMTP host `smtp.resend.com`, port `465`, username `resend`, password = Resend API key.
- Sender: `noreply@mixtapestory.com` (display name set in the same screen).
- The `mixtapestory.com` domain is verified with Resend (SPF/DKIM records in Cloudflare DNS). When merging SPF entries, remember to combine into one `v=spf1 …` record — multiple SPF records cause silent verification failures.
- Email templates ([`email-templates/`](email-templates/)) are the source of truth — paste them into **Authentication → Email Templates** in the Supabase dashboard. Templates aren't pushed by `supabase db push`; if we change them, re-paste manually.

### Troubleshooting

- **"The network connection was lost"** or **"this is insecure"** on a deployed URL → the SSR worker is crashing. Most common cause: `nodejs_compat` missing from `wrangler.toml`, or the build is stale. Rebuild + redeploy.
- **`Project not found` from wrangler** → the API token isn't loaded in the current shell, or it lacks the right scope. Run `pnpm exec wrangler whoami` to verify.
- **`*.pages.dev` works but `mixtapestory.com` doesn't** → DNS or custom-domain attachment hasn't fully propagated. Check **Workers & Pages → mixtapestory → Custom domains** for status; SSL provisioning takes 1–5 minutes after first attaching.

## What this isn't (yet)

Phase 1a (magic-link auth) and Phase 1b (editor, songs/stories schema, Apple Music
adapter, Odesli queue worker, admin queue dashboard, DB-backed `/{handle}` read path)
both live. What's still missing: Phase 1d polish — OG mosaic image generator, Ask
flow, PWA. The build plans for each phase live in [`docs/archive/`](docs/archive/) if
you want the historical sequence.

## Phase 1b operational notes

- **Seed migration**: one-shot script at `scripts/migrate-seeds.ts`. Reads each seed
  CSV, finds the matching profile (must have signed in once to exist), and inserts
  `songs` + `stories` rows with `link_status='done'` (the CSVs already carry
  `song.link/...` URLs). Run dry-first, then with `--apply`:

  ```sh
  SUPABASE_SERVICE_ROLE_KEY=… PUBLIC_SUPABASE_URL=… pnpm tsx scripts/migrate-seeds.ts
  SUPABASE_SERVICE_ROLE_KEY=… PUBLIC_SUPABASE_URL=… pnpm tsx scripts/migrate-seeds.ts --apply
  ```

- **Local demo group**: `scripts/seed-group.ts` populates the local DB with a
  ready-made group (`writing-meditation`) holding 4 personas — bryan as
  steward, tim/diane/jack as members — each with their own mixtape from
  `src/lib/seed/<handle>.csv`. The CSVs share three songs ("The Toast",
  "Taxi", "Tea for One") so the group landing page has real overlap to show.
  Re-runnable; refuses to run unless `PUBLIC_SUPABASE_URL` points at
  localhost.

  ```sh
  # Nuclear: drops the local DB, re-applies migrations, seeds the demo
  # group. All four personas become fake `<handle>@e2e.local` accounts.
  pnpm reset:demo

  # Just the seed step (dry-run first; --apply writes):
  node --env-file=.env.local --experimental-strip-types scripts/seed-group.ts
  node --env-file=.env.local --experimental-strip-types scripts/seed-group.ts --apply
  ```

  Want `bryan` to be your *real* magic-link account instead of a fake?
  Don't use `pnpm reset:demo`. Do the long flow: `pnpm exec supabase db
  reset` → sign in as bryan via the dev server → `pnpm tsx
  scripts/migrate-seeds.ts --apply` → then the seed-group `--apply`
  command above. It detects bryan's existing profile + songs, skips the
  CSV import for him, and just adds diane/jack and wires up the group.

  Visit `http://localhost:5173/g/writing-meditation` (signed in as any of
  the four) to see the result.

- **Resolution worker**: Edge Function at `supabase/functions/resolve-queue/`,
  triggered every minute by `pg_cron`. Migration 0006 scheduled the first version
  of the job; migration 0009 rewrote it to read its secrets from **Supabase
  Vault**. Before the cron job can call the function, two secrets must exist in
  `vault.secrets`. Paste the snippet at
  [`supabase/snippets/set_cron_secrets.sql`](supabase/snippets/set_cron_secrets.sql)
  into the dashboard SQL editor (substituting the service-role JWT) and run it.
  Verify with:

  ```sql
  select name, length(decrypted_secret) as len from vault.decrypted_secrets
  where name in ('project_url', 'service_role_key');
  ```

  (Note: `ALTER DATABASE postgres SET app.settings.*` does **not** work on
  hosted Supabase — permission denied — and the "Custom Postgres Config"
  dashboard panel only accepts well-known GUCs. Vault is the supported pattern
  for SQL-readable secrets.)

  Deploy the function with:

  ```sh
  pnpm exec supabase functions deploy resolve-queue --no-verify-jwt
  ```

  Monitor recent invocations via the dashboard SQL editor:

  ```sql
  select runid, status, return_message, start_time
  from cron.job_run_details
  where command like '%resolve-queue%'
  order by start_time desc limit 5;
  ```

- **Admin queue**: `/admin/queue` (page) and `/api/admin/queue` (JSON). Access is
  gated by the `ADMIN_EMAILS` env var — comma-separated, lowercase-compared. Set it
  via `wrangler pages secret put ADMIN_EMAILS` for production and in `.env.local`
  for dev.

## Testing

The test suite is organized as the executable version of the v1 user journey —
read top-to-bottom, the `e2e/` directory is a narrated tour of the product.

The architecture in brief: a thin E2E layer of numbered journey specs; one real
magic-link auth test against the local Supabase stack, with all other journeys
using seeded sessions injected as cookies; worker-scoped handle prefixes so five
parallel workers never collide; a `data-hydrated` body marker replacing
`networkidle` waits; and admin-client seed helpers that fake third-party state
when the integration isn't the thing under test. Every framework change is
re-verified with a 100× stress run before it lands.

```sh
pnpm run test:unit       # Vitest: fast, no browser
pnpm run test:e2e        # Playwright (headed locally so you can watch)
pnpm run test:e2e:ui     # Playwright UI mode for debugging
```

Philosophy, page-object design, fixtures, and the deliberate omissions live in
[`docs/TESTING.md`](docs/TESTING.md).

## License

There isn't one, deliberately. The source is public to read and learn from — the
testing architecture in particular — but it is not currently licensed for reuse
or redistribution. It may be open-sourced later; until then, all rights reserved.

## Author

Bryan Oakley — [LinkedIn](https://www.linkedin.com/in/bryan-oakley-8689155/)
