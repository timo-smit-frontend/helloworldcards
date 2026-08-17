# Hello World Cards

Personal multi-page React site, deployed to Cloudflare on [helloworldcards.com](https://helloworldcards.com).

## Stack

- Vite + React 19 + TypeScript
- React Router (client-side)
- Tailwind CSS v4
- No backend — content is hardcoded

## Develop

```bash
npm install
npm run dev
```

## Scripts

| Command           | Description                                     |
| ----------------- | ----------------------------------------------- |
| `npm run dev`     | Local dev server                                |
| `npm run build`   | Typecheck + production build                    |
| `npm run preview` | Preview the production build                    |
| `npm run lint`    | ESLint                                          |
| `npm run deploy`  | Build and publish `dist/` with Wrangler         |

## Deploy to Cloudflare

Pushes to `main` are built by Cloudflare Workers Builds. In the project’s build settings:

| Field            | Value                     |
| ---------------- | ------------------------- |
| Build command    | `npm run build`           |
| Deploy command   | `npx wrangler deploy`     |
| Version command  | `npx wrangler --version`  |
| Root directory   | `/`                       |
| Production branch| `main`                    |

Set a build variable `NODE_VERSION` to `22`, and select a Cloudflare API token with permission to deploy Workers. You need Node 22 locally as well (`nvm use`).

To publish from your machine after `npx wrangler login`:

```bash
npm run deploy
```

### Custom domain

In the Worker: **Settings → Domains & Routes → Custom domain** → `helloworldcards.com`.

If the domain’s DNS is on Cloudflare, that is enough. If it still points at GitHub Pages, add the zone to Cloudflare (or update the registrar records Cloudflare shows) and disable GitHub Pages once the new site is live.
