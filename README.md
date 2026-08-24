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

## Dashboard (`/dashboard/`)

The dashboard is unlinked from the public site, blocked in `robots.txt`, and served with `noindex`. After login it shows spendings (sum of `cost`) against potential gain (listed price minus cost).

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

## Deploy to Cloudflare

Pushes to `main` are built by Cloudflare Workers Builds. In the project’s build settings:

| Field             | Value                    |
| ----------------- | ------------------------ |
| Build command     | `npm run build`          |
| Deploy command    | `npx wrangler deploy`    |
| Version command   | `npx wrangler --version` |
| Root directory    | `/`                      |
| Production branch | `main`                   |

Set a build variable `NODE_VERSION` to `22`, and select a Cloudflare API token with permission to deploy Workers. You need Node 22 locally as well (`nvm use`).

To publish from your machine after `npx wrangler login`:

```bash
npm run deploy
```

### Custom domain

In the Worker: **Settings → Domains & Routes → Custom domain** → `helloworldcards.com`.

If the domain’s DNS is on Cloudflare, that is enough. If it still points at GitHub Pages, add the zone to Cloudflare (or update the registrar records Cloudflare shows) and disable GitHub Pages once the new site is live.
