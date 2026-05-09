# mixtapestory.com

A web app for making and sharing **mixtape stories** — a curated collection of songs, each accompanied by writing about why that song matters.

**In private testing.** v1 audience is a small contemplative-writing group.

- [`CLAUDE.md`](CLAUDE.md) — operative product decisions
- [`docs/design-notes.md`](docs/design-notes.md) — rationale and open questions
- [`docs/PLAN.md`](docs/PLAN.md) — POC scope and v1 scaffold plan
- [`docs/mixtapestories-vision.md`](docs/mixtapestories-vision.md) — the longer-form vision

## Stack

SvelteKit 2 (Svelte 5, TypeScript strict) · Tailwind v4 · `@sveltejs/adapter-cloudflare` · Cloudflare Pages.

## Local development

Prerequisites: Node 22 (pinned in `.nvmrc`), pnpm.

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm check        # type-check + Svelte check
pnpm build        # production build → .svelte-kit/cloudflare/
```

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

### One-time setup (already configured; here for the record)

- Cloudflare account.
- A Cloudflare API token with **Cloudflare Pages: Edit** permission, exported as `CLOUDFLARE_API_TOKEN` in `~/.zshenv` (so non-interactive shells — including this `wrangler` invocation — pick it up). Create tokens at https://dash.cloudflare.com/profile/api-tokens.
- Cloudflare Pages project named `mixtapestory`, production branch `main`. Created once with `pnpm exec wrangler pages project create mixtapestory --production-branch=main`.
- Custom domains (`mixtapestory.com`, `www.mixtapestory.com`) attached in **Workers & Pages → mixtapestory → Custom domains**. DNS lives on Cloudflare; registrar is Porkbun.

### Troubleshooting

- **"The network connection was lost"** or **"this is insecure"** on a deployed URL → the SSR worker is crashing. Most common cause: `nodejs_compat` missing from `wrangler.toml`, or the build is stale. Rebuild + redeploy.
- **`Project not found` from wrangler** → the API token isn't loaded in the current shell, or it lacks the right scope. Run `pnpm exec wrangler whoami` to verify.
- **`*.pages.dev` works but `mixtapestory.com` doesn't** → DNS or custom-domain attachment hasn't fully propagated. Check **Workers & Pages → mixtapestory → Custom domains** for status; SSL provisioning takes 1–5 minutes after first attaching.

## What this isn't (yet)

No auth, no database, no Songlink API integration, no editor UI. The POC is read-only and CSV-driven by design. See [`docs/PLAN.md`](docs/PLAN.md) for what comes next.
