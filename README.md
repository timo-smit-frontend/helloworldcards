# Hello World Cards

Personal multi-page React site, deployed to Cloudflare on [helloworldcards.com](https://helloworldcards.com).

## Stack

- Vite + React 19 + TypeScript
- React Router (client-side)
- Tailwind CSS v4
- Cloudflare Worker for the private dashboard at `/dashboard/`
- Product copy lives in `app/database/products.ts`, including a `cost` field (what you paid)

## Develop

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

`.dev.vars` holds dashboard login secrets locally. It is gitignored. Do not prefix those names with `VITE_` — Vite would bake them into the public JavaScript.

## Scripts

| Command           | Description                             |
| ----------------- | --------------------------------------- |
| `npm run dev`     | Local dev server                        |
| `npm run build`   | Typecheck + production build            |
| `npm run preview` | Preview the production build            |
| `npm run lint`    | ESLint                                  |
| `npm test`        | Vitest                                  |
| `npm run deploy`  | Build and publish `dist/` with Wrangler |

See [CMS sync](#cms-sync) for the commands that move content and images between your machine and production.

## Dashboard (`/dashboard/`)

The dashboard is unlinked from the public site, blocked in `robots.txt`, and served with `noindex`. After login it shows spent, sold, and remaining potential, plus margin stats and a recently-sold list. Mark a card sold with `sold: true` and `soldAt: 'YYYY-MM-DD'` in `app/cms/seed-products.ts` — it leaves the shop and stays on the books. A card that has sold but is still on its way, with the money not paid out yet, is `reserved: true` instead (with `soldAt` and the sale `price`): it stays in the shop without a price or buy link, saying **This card is reserved**, and leaves the Vinted relist tab and the price suggestions. Switch it to `sold: true` once the money is in.

Set these as **Worker secrets** (Cloudflare dashboard or `wrangler secret put`), never in source or `wrangler.jsonc`:

| Secret                     | Purpose                  |
| -------------------------- | ------------------------ |
| `DASHBOARD_USERNAME`       | Dashboard login          |
| `DASHBOARD_PASSWORD`       | Dashboard login          |
| `DASHBOARD_SESSION_SECRET` | Signs the session cookie |

```bash
npx wrangler secret put DASHBOARD_USERNAME
npx wrangler secret put DASHBOARD_PASSWORD
npx wrangler secret put DASHBOARD_SESSION_SECRET
```

Use a long random value for `DASHBOARD_SESSION_SECRET` (for example `openssl rand -base64 32`).

Update purchase costs on each product in `app/database/products.ts`. Those numbers are stripped from the public shop bundle; the dashboard reads them on the Worker after login.

## CMS sync

The CMS runs on the same code locally and in production, but on two separate D1 databases
and two separate R2 buckets. Content and images travel between them through files in this
repo, so every change is a reviewable diff:

| What                               | Lives in                            |
| ---------------------------------- | ----------------------------------- |
| Settings, nav, pages, FAQs, events | `seed/cms-content.json`             |
| Products                           | `app/cms/seed-products.ts`          |
| Seed images                        | `seed/media/` (R2 holds every size) |

```bash
npm run cms:status          # what a local push would change, without writing
npm run cms:status:remote   # the same against production
npm run cms:pull            # local database  -> seed files
npm run cms:pull:remote     # production      -> seed files
npm run cms:push            # seed files      -> local database and local R2
npm run cms:push:remote     # seed files      -> production database and R2
```

While `npm run dev` is running none of this is a step to remember: the dev server keeps
both sides in step on its own. It looks at production at startup and every five minutes,
and each part of the CMS — content, products, media — is settled on its own:

- An edit in the **local admin** is written to the seed file and pushed to production a
  moment later. If the push fails (production behind on a migration, no network), the
  file goes back to what production has and the edit is sent again on the next try — it
  is never lost, and never mistaken for a production edit.
- An edit in the **production admin** is taken into the local database and the seed file.
- A seed file **edited by hand** while the server runs is applied to both databases within
  seconds and rewritten in the form a pull writes.
- A seed file that **git** changed (a checkout, a pull) is left alone, with a line in the
  dev log saying so — switching branches must never rewrite the live site. Run
  `npm run cms:push:remote` to apply such a file; the local database follows.
- Both admins edited the same part since the last sync: the local version wins and the
  overwritten production edit is named in the dev log.

Each local database keeps its own record of what it last settled on (in `cms_sync_state`),
so a database with no such record — a fresh checkout, a wiped `.wrangler/state`, a copy
from another machine — is never taken to be ahead of production; production is adopted
instead. `HWC_CMS_AUTOSYNC=0` turns the automatic sync off.

The sync is not allowed to fail quietly. The sync runs `vite-node` and Wrangler in a
child process, so `npm run dev` first installs anything `package-lock.json` names that
`node_modules` lacks, and refuses to start if a tool the sync needs is still missing. A
failed attempt (production unreachable, a migration not yet applied) is shown above every
admin screen until one succeeds, with a button to try again. The Cardmarket scan and the
Vinted relist settle the local database with production before they read it, and do not
run when that fails — so neither ever acts on a card that was sold or reserved elsewhere.

The commands are for when the dev server is not running. Add `--content`, `--products`,
or `--media` to any of them to sync just that part; `npm run media:sync` and
`npm run media:sync:remote` are shorthand for the media half.

A push is authoritative: a page, FAQ, event, or product that the seed files still carry is
restored in the target even if it was trashed there. Pull first if that is not what you
want — and if production was edited in its admin while no dev server was running, pull
before editing a seed file by hand, or the push will overwrite that edit.

### How media stays in step

Every image is stored in R2 as the original plus a WebP and an AVIF at each build width.
A media push reconciles the whole set: a new or changed image is re-encoded and all of its
sizes uploaded, sizes that are no longer built are deleted, and so are the leftovers of an
image that is gone. Images uploaded through the admin are covered too — their original is
read back out of the bucket and re-encoded — so a card photo added on the live site gets
its full set of sizes on the next push.

The sync tracks what it put in the bucket in `_media-variants-manifest.json` on R2, and
only ever deletes objects it recorded there, so nothing it did not upload can be removed by
accident.

### How a request is served

A page or `/api/public` read fetches everything it needs from D1 in **one batched round
trip** — settings, navigation, products, events, FAQs, media copy and the page or product
itself — and the seed/migration check rides on the settings row in that batch, so a database
that is up to date costs no extra query and no write. The built `index.html` is read from
the asset store once per Worker isolate.

Images under `/media/` are answered by the cached `CachedMedia` entrypoint: the platform
cache sits in front of it (kept across deploys, since a replaced image always gets a new
key) and the per-location cache inside it. Objects stream straight from R2 with an `ETag`,
so a revalidation is a 304. An exact file is cached for a week at the edge and a year in
browsers. While a size is still missing — an admin upload only gets its AVIF and larger
widths on the next media push — the closest smaller WebP stands in, and stand-ins are
cached for minutes rather than a week so the real file takes over as soon as it lands.
Replacing or deleting an image removes the original and every size with one bucket call
and one cache purge.

`seed/media` is the source for the committed images. After adding, replacing, or removing a
file there, run `npm run cms:seed-media` to regenerate `app/cms/seed-media.ts` (a `cms:push`
does this for you). `npm test` fails if that file, `seed/cms-content.json`, or
`app/cms/seed-products.ts` drifts from what a fresh generate would write.

### Schema

`npm run migrate:remote` applies `migrations/` to production, and Workers Builds runs it for
`main`. The local database is caught up by the sync scripts and the dev server, which apply
any migration files they have not recorded yet — adding a migration needs no other change.

## Deploy to Cloudflare

Pushes to `main` are built by Cloudflare Workers Builds. `npm run build` typechecks and compiles; on Workers Builds for `main` it then applies pending D1 migrations before Wrangler publishes. Preview-branch builds skip that so they cannot change production schema.

Seed media variants (CMS images in R2) are **not** uploaded during Workers Builds — a full upload takes ~30 minutes and hits the build timeout. Run `npm run cms:push:remote` locally after `npx wrangler login` instead. A local `npm run build` still uploads changed seed images as a convenience; `HWC_SKIP_MEDIA_UPLOAD=1` turns that off.

| Field             | Value                    |
| ----------------- | ------------------------ |
| Build command     | `npm run build`          |
| Deploy command    | `npx wrangler deploy`    |
| Version command   | `npx wrangler --version` |
| Root directory    | `/`                      |
| Production branch | `main`                   |

Set a build variable `NODE_VERSION` to `22`. The Builds API token needs Workers Scripts (edit) **and Cloudflare D1 (edit)** so migrations can run. You need Node 22 locally as well (`nvm use`).

To publish from your machine after `npx wrangler login`:

```bash
npm run deploy
```

### Custom domain

In the Worker: **Settings → Domains & Routes → Custom domain** → `helloworldcards.com`.

If the domain’s DNS is on Cloudflare, that is enough. If it still points at GitHub Pages, add the zone to Cloudflare (or update the registrar records Cloudflare shows) and disable GitHub Pages once the new site is live.
