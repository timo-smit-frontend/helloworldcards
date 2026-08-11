# Hello World Cards

Personal multi-page React site, deployed to GitHub Pages on [helloworldcards.com](https://helloworldcards.com).

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

| Command           | Description                                        |
| ----------------- | -------------------------------------------------- |
| `npm run dev`     | Local dev server                                   |
| `npm run build`   | Typecheck + production build (+ SPA `404.html`)    |
| `npm run preview` | Preview the production build                       |
| `npm run lint`    | ESLint                                             |
| `npm run deploy`  | Build and publish `dist/` to the `gh-pages` branch |

## Deploy to GitHub Pages

1. Create a GitHub repo and push this project.
2. Run `npm run deploy` (publishes to the `gh-pages` branch).
3. In the repo: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: `gh-pages` / `/ (root)`
4. Under **Custom domain**, set `helloworldcards.com` (the `CNAME` file in `public/` is included in the build).

### DNS

At your domain registrar, point the domain at GitHub Pages as documented by GitHub (typically A records to GitHub’s IPs for an apex domain, or a CNAME for `www`). Enable HTTPS in the Pages settings once DNS has propagated.
