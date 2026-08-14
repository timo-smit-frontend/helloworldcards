# About page design

Date: 2026-08-14

## Problem

The homepage already links to `/about` (“Learn more about us”), but the route does not exist, so that link 404s. About is also missing from the header, footer, SEO map, and sitemap.

## Goal

Ship a full `/about` page that tells the Hello World Cards story, introduces Sam and Timo as a couple (shared voice, not split bios), explains how the shop works, and sends people to the shop and to contact. Accessibility and SEO must match or beat the rest of the site.

## Audience and job

- **Subject:** Hello World Cards — Sam and Timo, a couple who sell Pokémon cards and art and show up at events.
- **Audience:** Collectors and hobby people who already like the shop’s tone.
- **Page job:** Answer “who are you and how does this work?” then point to stock or a message.

## Approach

Reuse existing flex blocks like Home. Add one about-specific block, `ContentAbout`. Do not invent a second layout system.

## Page stack

Route: `app/routes/about.tsx`, registered in `app/main.tsx` as `path="about"` under the same `Root` layout as Home, Products, Agenda, and Contact.

1. **`BannerFigcaption`** — page `h1`, short intro, together-photo stand-in (current shop image), figcaption. No banner CTA.
2. **`ContentAbout`** — origin story, Sam & Timo named cards, how the shop works, shop link.
3. **`ContentCta`** — contact closer, linking to `/contact`.

Homepage copy stays the teaser. “Learn more about us” keeps pointing to `/about`.

## Navigation

Add **About** to desktop header, mobile menu, and footer.

Order: Products → Agenda → **About** → Contact.

Label is “About” everywhere (mobile currently says “Contact us” for contact; do not change that).

Active route uses `aria-current="page"` on matching header and footer links, including About.

## ContentAbout

New file: `app/components/flex/content/ContentAbout.tsx`.

Section `id="content-about"` with the existing `section` / `container-full` utilities.

The page `h1` lives on the banner. `ContentAbout` uses `h2` / `h3` only.

### Props (copy lives on the route, same as Home)

```ts
{
  title: string
  description: string
  people: Array<{ name: string }>
  peopleCaption: string
  howItWorks: Array<{ title: string; description: string }>
  link: { url: string; title: string }
}
```

- `title` / `description` — origin story (`h2` + paragraph).
- `people` — exactly two names (Sam, Timo). Cards are not links or buttons.
- `peopleCaption` — one shared line under the pair. No per-person bios.
- `howItWorks` — three items, in order, rendered as an `<ol>` (sequence matters). Each item: `h3` + paragraph.
- `link` — shop CTA, `button-leaf`, `url: '/products'`.

Use `Animated` delays in the same spirit as `ContentText` / `ContentCta`.

### Named cards

Two side-by-side cards (stack on small screens). Name as `h3`. No portraits. Shared caption sits under the grid, not duplicated inside each card.

Visual language: existing `rounded-panel`, `bg-site-gunmetal`, `ring-site-mulled-wine`, `shadow-card` — same family as product cards and `ContentCta`, not a new chrome.

## Copy

Voice: couple, not “two friends.” Same register as the homepage. Do not claim the stand-in image is a portrait.

**Banner**

- Title: `We're Sam and Timo.`
- Description: `We're a couple who turned a Pokémon hobby into this little shop. Cards, art, and the events we show up at — that's what you'll find here.`
- Image: existing site image (`SITE_IMAGE` / current homepage banner URL).
- Figcaption: `From our little corner of the hobby.`
- Image `alt`: `Pokémon cards and art from the Hello World Cards shop.` (atmospheric shop photo, not “Sam and Timo”.)

**Origin (`ContentAbout`)**

- Title: `A hobby that turned into a little shop`
- Description: `Hello World Cards is us: Sam and Timo, a couple who never quite grew out of Pokémon. What started as a hobby — pulling packs, chasing art, lingering too long at events — turned into this small shop. We list what we have in stock, write up the events we're heading to, and keep the door open if you want to talk cards.`

**People**

- Names: `Sam`, `Timo`
- Caption: `A couple who never quite grew out of Pokémon.`

**How the shop works**

1. **What's in stock** — `Pokémon cards, art, and a few extras we pick up along the way. Browse what's here now.`
2. **Events** — `When we go to a Pokémon event, we post it on the agenda. Come say hi and see what's on the stall.`
3. **Get in touch** — `There's no checkout cart. If something catches your eye, send us a message and we'll take it from there.`

**Shop link**

- Title: `Visit the shop`
- URL: `/products`

**Contact CTA**

- Title: `Want to get in touch?`
- Description: `Questions about a card, an event, or something in the shop? Send us a message — we'd love to hear from you.`
- Link title: `Get in touch`
- URL: `/contact`
- Image: same stand-in as the banner.

## BannerFigcaption change

Add optional `alt?: string`. Pass it through to `Image`. Default remains `""` so existing callers stay decorative unless they opt in. About passes the shop-photo alt above.

## Accessibility

- One `h1` on the page (banner). Origin `h2`, people names `h3`, how-it-works items `h3`.
- Skip-to-main already in `Layout`; do not duplicate.
- Named cards are static text, not fake controls.
- Shop and contact are real links. Existing `:focus-visible` outline on `a` applies.
- `prefers-reduced-motion` already handled by `Animated` / global scroll; do not add extra motion.
- `eslint-plugin-jsx-a11y` must stay clean on new files.
- Banner image alt must not identify the stand-in as Sam and Timo.
- Duplicate `id="content-cta"` is avoided: About uses a single `ContentCta`.

## SEO

Add `/about` to `getSeoForPath` and `getIndexableSeoPages` in `app/seo/pages.ts`. Prerender (`seo-prerender.ts` via Vite build) then writes `dist/about/index.html` and includes the URL in `sitemap.xml`. Also update `public/sitemap.xml` so local/dev matches.

- Document title: `About | Hello World Cards` via `titleWithBrand('About')`.
- Meta description: `We're Sam and Timo, a couple who turned a Pokémon hobby into Hello World Cards — a small shop for cards, art, and the events we go to.`
- `og:type` stays `website`. Canonical: `https://helloworldcards.com/about`.
- JSON-LD webpage `@type` is `AboutPage`, not `WebPage`.

Extend `page()` with an optional JSON-LD page type (e.g. `webPageType: 'AboutPage'`) so Open Graph type and schema type can differ. Do not overload the existing `'website' | 'product'` OG field.

**About extra graph**

1. `BreadcrumbList`: Home → About.
2. Two `Person` nodes, about-page only:

```json
{
  "@type": "Person",
  "@id": "https://helloworldcards.com/about#sam",
  "name": "Sam",
  "jobTitle": "Co-founder",
  "worksFor": { "@id": "https://helloworldcards.com/#organization" }
}
```

Same for Timo (`#timo`). Do not add founders to the global `organizationNode()` used on every page.

## Errors and data

No fetching. About is static. Unknown paths still use the existing 404 route. No new error UI.

## Out of scope

- Real couple photograph (stand-in until one exists).
- Per-person bios or portrait cards.
- Shared nav config refactor (add About in the three existing places).
- Changing homepage body copy beyond the existing `/about` link.
- New test runner (the repo has lint, `tsc`, and build only).

## Verification

1. `npm run lint` — no jsx-a11y or TypeScript issues.
2. `npm run build` — `dist/about/index.html` exists with About title, description, canonical, `AboutPage` JSON-LD; `dist/sitemap.xml` lists `/about`.
3. In the browser: `/about` renders the stack; header and footer show About; `aria-current="page"` on About; skip link still reaches `#main`; keyboard focus is visible on shop and contact links; `/about` is not a 404.
4. Homepage “Learn more about us” still goes to `/about`.
