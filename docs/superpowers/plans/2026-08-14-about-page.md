# About Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a full `/about` page for Hello World Cards — couple story, Sam & Timo named cards, how the shop works, shop + contact CTAs — with header/footer nav, accessibility, and `AboutPage` SEO.

**Architecture:** Thin route `app/routes/about.tsx` composed like Home: `BannerFigcaption` + new `ContentAbout` + `ContentCta`. SEO lives in `getSeoForPath` / `getIndexableSeoPages` so prerender emits `/about/index.html` and the sitemap. Nav is updated in the three existing Header/Footer places (no shared nav refactor).

**Tech Stack:** React 19, React Router 7, Vite 7, TypeScript, Tailwind 4, existing flex blocks (`BannerFigcaption`, `ContentCta`, `Animated`), `eslint-plugin-jsx-a11y`.

**Spec:** `docs/superpowers/specs/2026-08-14-about-page-design.md`

## Global Constraints

- Voice is a couple, not two friends; no split bios; stand-in image is a shop photo, never described as Sam and Timo.
- One `h1` on the page (banner). `ContentAbout` uses `h2`/`h3` only. Named cards are not links or buttons.
- Follow existing flex patterns (`section`, `container-full`, `button-leaf`, `rounded-panel`, `Animated`). Do not invent a second layout system.
- No new test runner. Verify with `npx eslint` on touched files, then `npm run lint` and `npm run build`.
- Do not change homepage body copy. Do not add founders to the global `organizationNode()`.
- Do not extract a shared nav config. Add About in Header desktop, Header mobile, and Footer separately.
- `og:type` stays `website`. JSON-LD webpage type for About is `AboutPage` via a new optional `webPageType` on `page()`.
- Single `ContentCta` on About (avoid duplicate `id="content-cta"`).

## File structure

- Create: `app/components/flex/content/ContentAbout.tsx` — origin, named cards, how-it-works, shop link
- Create: `app/routes/about.tsx` — page composition and copy
- Modify: `app/components/flex/banner/BannerFigcaption.tsx` — optional `alt`
- Modify: `app/main.tsx` — register `path="about"`
- Modify: `app/seo/pages.ts` — `/about` SEO, `webPageType`, Person + breadcrumb graph
- Modify: `public/sitemap.xml` — include `/about`
- Modify: `app/components/layout/Header.tsx` — About link + `aria-current`
- Modify: `app/components/layout/Footer.tsx` — About link + `aria-current`

---

### Task 1: Optional image alt on BannerFigcaption

**Files:**
- Modify: `app/components/flex/banner/BannerFigcaption.tsx`

**Interfaces:**
- Consumes: existing `Image` (`alt: string` required)
- Produces: `BannerFigcaption` accepts optional `alt?: string`; default `""` so Home stays decorative

- [ ] **Step 1: Add optional `alt` and pass it to `Image`**

Replace the props and `Image` usage. Leave every other caller unchanged (they omit `alt`).

```tsx
import { Animated } from '~/components/elements/Animated'
import Image from '~/components/elements/Image'

export default function BannerFigcaption({
  title,
  description,
  image,
  link,
  figcaption,
  alt = ''
}: {
  title?: string
  description?: string
  image?: string
  link?: { url?: string; target?: string; title?: string }
  figcaption?: string
  alt?: string
}) {
  return (
    <section id="banner-figcaption" className="lg:border-b border-site-mulled-wine bg-site-dark">
      <div className="container-full pt-12 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="flex flex-col gap-3 lg:gap-6">
            {title && (
              <Animated delay={200}>
                <h1 className="title-xl text-balance">{title}</h1>
              </Animated>
            )}
            {description && (
              <Animated delay={300}>
                <p className="content-l max-w-xl text-site-lemon-grass">{description}</p>
              </Animated>
            )}
            {link?.url && link?.title && (
              <Animated delay={400}>
                <div>
                  <a href={link.url} className="button-leaf">
                    {link.title}
                  </a>
                </div>
              </Animated>
            )}
          </div>
          {image && (
            <Animated delay={500}>
              <figure className="mat">
                <Image src={image} alt={alt} width={1280} height={960} className="aspect-3/2 w-full rounded-[0.9rem] object-cover" />
                {figcaption && <figcaption className="mt-3 px-1 text-sm text-site-lemon-grass">{figcaption}</figcaption>}
              </figure>
            </Animated>
          )}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Lint the file**

Run: `npx eslint app/components/flex/banner/BannerFigcaption.tsx`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/flex/banner/BannerFigcaption.tsx
git commit -m "Allow BannerFigcaption images to take an accessible alt."
```

---

### Task 2: ContentAbout block

**Files:**
- Create: `app/components/flex/content/ContentAbout.tsx`

**Interfaces:**
- Consumes: `Animated` from `~/components/elements/Animated`
- Produces: `ContentAbout` with props `{ title, description, people, peopleCaption, howItWorks, link }` as specified below

- [ ] **Step 1: Create `ContentAbout`**

`people` cards are static (no `<a>`, no `<button>`). How-it-works is an `<ol>` with `list-none` so titles carry the meaning; order is still in the DOM. Shop link is `<a href>` + `button-leaf`, same as `ContentText`.

```tsx
import { Animated } from '~/components/elements/Animated'

export default function ContentAbout({
  title,
  description,
  people,
  peopleCaption,
  howItWorks,
  link
}: {
  title: string
  description: string
  people: Array<{ name: string }>
  peopleCaption: string
  howItWorks: Array<{ title: string; description: string }>
  link: { url: string; title: string }
}) {
  return (
    <section id="content-about" className="section">
      <div className="container-full">
        <div className="flex flex-col gap-12 lg:gap-16">
          <div className="flex max-w-4xl flex-col gap-3 lg:gap-6">
            <Animated delay={100}>
              <h2 className="title-l">{title}</h2>
            </Animated>
            <Animated delay={200}>
              <p className="content-l text-site-lemon-grass">{description}</p>
            </Animated>
          </div>

          <div className="flex flex-col gap-4">
            <Animated delay={200}>
              <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2">
                {people.map((person) => (
                  <li
                    key={person.name}
                    className="rounded-panel bg-site-gunmetal px-6 py-8 shadow-card ring-1 ring-site-mulled-wine sm:px-8 sm:py-10"
                  >
                    <h3 className="title-xs">{person.name}</h3>
                  </li>
                ))}
              </ul>
            </Animated>
            <Animated delay={300}>
              <p className="content-s text-site-lemon-grass">{peopleCaption}</p>
            </Animated>
          </div>

          <div className="flex flex-col gap-8">
            <Animated delay={200}>
              <h2 className="title-l">How the shop works</h2>
            </Animated>
            <ol className="m-0 flex list-none flex-col gap-8 p-0">
              {howItWorks.map((item, index) => (
                <li key={item.title} className="max-w-4xl">
                  <Animated delay={((index + 3) * 100) as 300 | 400 | 500}>
                    <div className="flex flex-col gap-2">
                      <h3 className="title-xs">{item.title}</h3>
                      <p className="content-s text-site-lemon-grass">{item.description}</p>
                    </div>
                  </Animated>
                </li>
              ))}
            </ol>
          </div>

          <Animated delay={400}>
            <div>
              <a href={link.url} className="button-leaf">
                {link.title}
              </a>
            </div>
          </Animated>
        </div>
      </div>
    </section>
  )
}
```

The delay cast (`300 | 400 | 500`) matches `Animated`'s `Delay` union. Do not pass a computed `number` that TypeScript cannot narrow.

- [ ] **Step 2: Lint the file**

Run: `npx eslint app/components/flex/content/ContentAbout.tsx`

Expected: no errors. If jsx-a11y flags the heading-only cards, keep them as `<h3>` inside `<li>` (that is the intended accessible name).

- [ ] **Step 3: Commit**

```bash
git add app/components/flex/content/ContentAbout.tsx
git commit -m "Add ContentAbout for the couple story, names, and how the shop works."
```

---

### Task 3: About route and router

**Files:**
- Create: `app/routes/about.tsx`
- Modify: `app/main.tsx`

**Interfaces:**
- Consumes: `BannerFigcaption` with `alt`, `ContentAbout` from Task 2, `ContentCta`, `SITE_IMAGE`
- Produces: `/about` renders under `Root` / `Layout` (skip-to-main and `#main` already exist)

- [ ] **Step 1: Create the About route with spec copy**

Use `SITE_IMAGE` for both the banner and the contact CTA. No banner `link`. Contact CTA goes to `/contact`, not mailto.

```tsx
import BannerFigcaption from '~/components/flex/banner/BannerFigcaption'
import ContentAbout from '~/components/flex/content/ContentAbout'
import ContentCta from '~/components/flex/content/ContentCta'
import { SITE_IMAGE } from '~/seo/site'

export default function About() {
  return (
    <>
      <BannerFigcaption
        title="We're Sam and Timo."
        description="We're a couple who turned a Pokémon hobby into this little shop. Cards, art, and the events we show up at — that's what you'll find here."
        image={SITE_IMAGE}
        figcaption="From our little corner of the hobby."
        alt="Pokémon cards and art from the Hello World Cards shop."
      />
      <ContentAbout
        title="A hobby that turned into a little shop"
        description="Hello World Cards is us: Sam and Timo, a couple who never quite grew out of Pokémon. What started as a hobby — pulling packs, chasing art, lingering too long at events — turned into this small shop. We list what we have in stock, write up the events we're heading to, and keep the door open if you want to talk cards."
        people={[{ name: 'Sam' }, { name: 'Timo' }]}
        peopleCaption="A couple who never quite grew out of Pokémon."
        howItWorks={[
          {
            title: "What's in stock",
            description: "Pokémon cards, art, and a few extras we pick up along the way. Browse what's here now."
          },
          {
            title: 'Events',
            description: "When we go to a Pokémon event, we post it on the agenda. Come say hi and see what's on the stall."
          },
          {
            title: 'Get in touch',
            description: "There's no checkout cart. If something catches your eye, send us a message and we'll take it from there."
          }
        ]}
        link={{ url: '/products', title: 'Visit the shop' }}
      />
      <ContentCta
        title="Want to get in touch?"
        description="Questions about a card, an event, or something in the shop? Send us a message — we'd love to hear from you."
        image={SITE_IMAGE}
        link={{ url: '/contact', title: 'Get in touch' }}
      />
    </>
  )
}
```

- [ ] **Step 2: Register the route in `app/main.tsx`**

Add the import next to the other route imports:

```tsx
import About from '~/routes/about'
```

Inside the `Root` layout routes, after agenda and before contact:

```tsx
<Route path="agenda" element={<Agenda />} />
<Route path="about" element={<About />} />
<Route path="contact" element={<Contact />} />
```

- [ ] **Step 3: Lint the new route and `main.tsx`**

Run: `npx eslint app/routes/about.tsx app/main.tsx`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/routes/about.tsx app/main.tsx
git commit -m "Add the About route and register it under the site layout."
```

---

### Task 4: Header and footer nav with current-page state

**Files:**
- Modify: `app/components/layout/Header.tsx`
- Modify: `app/components/layout/Footer.tsx`

**Interfaces:**
- Consumes: existing `Link`, `useLocation`
- Produces: Products → Agenda → About → Contact; `aria-current="page"` when `pathname` equals the link `to`

- [ ] **Step 1: Add About + `aria-current` in the header**

Add constants after the agenda ones:

```tsx
const ABOUT_URL = '/about'
const ABOUT_TITLE = 'About'
```

Pass `pathname` into `MobileMenuSheet` (Header already calls `useLocation`). Extend its props:

```tsx
function MobileMenuSheet({
  open,
  onOpenChange,
  pathname
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pathname: string
}) {
```

In the mobile `<nav>`, insert About after Agenda and before Contact. Add `aria-current` to every primary link:

```tsx
<Link
  to={PRODUCTS_URL}
  className="mobile-menu-hover title-base flex w-full items-center px-0 py-2 text-2xl sm:text-3xl lg:text-4xl"
  aria-current={pathname === PRODUCTS_URL ? 'page' : undefined}
  onClick={() => onOpenChange(false)}
>
  {PRODUCTS_TITLE}
</Link>
<Link
  to={AGENDA_URL}
  className="mobile-menu-hover title-base flex w-full items-center px-0 py-2 text-2xl sm:text-3xl lg:text-4xl"
  aria-current={pathname === AGENDA_URL ? 'page' : undefined}
  onClick={() => onOpenChange(false)}
>
  {AGENDA_TITLE}
</Link>
<Link
  to={ABOUT_URL}
  className="mobile-menu-hover title-base flex w-full items-center px-0 py-2 text-2xl sm:text-3xl lg:text-4xl"
  aria-current={pathname === ABOUT_URL ? 'page' : undefined}
  onClick={() => onOpenChange(false)}
>
  {ABOUT_TITLE}
</Link>
<Link
  to={CONTACT_URL}
  className="mobile-menu-hover title-base flex w-full items-center px-0 py-2 text-2xl sm:text-3xl lg:text-4xl"
  aria-current={pathname === CONTACT_URL ? 'page' : undefined}
  onClick={() => onOpenChange(false)}
>
  {CONTACT_TITLE}
</Link>
```

Desktop nav (keep the Contact label as `Contact`, not `CONTACT_TITLE`):

```tsx
<nav aria-label="Primary" className="hidden items-center gap-12 xl:flex">
  <Link to={PRODUCTS_URL} className={navLinkClass} aria-current={location.pathname === PRODUCTS_URL ? 'page' : undefined}>
    {PRODUCTS_TITLE}
  </Link>
  <Link to={AGENDA_URL} className={navLinkClass} aria-current={location.pathname === AGENDA_URL ? 'page' : undefined}>
    {AGENDA_TITLE}
  </Link>
  <Link to={ABOUT_URL} className={navLinkClass} aria-current={location.pathname === ABOUT_URL ? 'page' : undefined}>
    {ABOUT_TITLE}
  </Link>
  <Link to={CONTACT_URL} className={navLinkClass} aria-current={location.pathname === CONTACT_URL ? 'page' : undefined}>
    Contact
  </Link>
</nav>
```

Update the sheet usage:

```tsx
<MobileMenuSheet key={location.key} open={menuOpen} onOpenChange={setMenuOpen} pathname={location.pathname} />
```

- [ ] **Step 2: Add About + `aria-current` in the footer**

Import `useLocation`:

```tsx
import { Link, useLocation } from 'react-router'
```

Insert About in `FOOTER_MENU` after Agenda:

```tsx
const FOOTER_MENU = [
  { title: 'Products', to: '/products' },
  { title: 'Agenda', to: '/agenda' },
  { title: 'About', to: '/about' },
  { title: 'Contact', to: '/contact' }
]
```

Inside `Footer`:

```tsx
export default function Footer() {
  const location = useLocation()

  return (
    <footer className="max-lg:border-t border-site-mulled-wine max-lg:pt-8 pb-16 text-site-pearl-bush lg:pb-24">
      {/* ...existing markup... */}
      <Link
        to={item.to}
        className="transition-colors hover:text-site-ginger-brown hover:underline"
        aria-current={location.pathname === item.to ? 'page' : undefined}
      >
        {item.title}
      </Link>
      {/* ...rest unchanged... */}
    </footer>
  )
}
```

- [ ] **Step 3: Lint header and footer**

Run: `npx eslint app/components/layout/Header.tsx app/components/layout/Footer.tsx`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/layout/Header.tsx app/components/layout/Footer.tsx
git commit -m "Add About to site nav and mark the current page for assistive tech."
```

---

### Task 5: About SEO, JSON-LD, and sitemap

**Files:**
- Modify: `app/seo/pages.ts`
- Modify: `public/sitemap.xml`

**Interfaces:**
- Consumes: existing `page()`, `webPageNode()`, `canonicalUrl()`, `ORGANIZATION_ID`, `titleWithBrand()`
- Produces: `getSeoForPath('/about')` is indexable; `webPageType: 'AboutPage'`; extra graph is breadcrumbs + Sam/Timo `Person` nodes; `getIndexableSeoPages()` includes `/about`

- [ ] **Step 1: Add `webPageType` to `page()`**

In the `page()` parameter list, add `webPageType?: string`. Use it when calling `webPageNode`, falling back to the current OG-derived types:

```ts
function page({
  path,
  title,
  description,
  image = SITE_IMAGE,
  type = 'website',
  robots = 'index, follow',
  extraGraph = [],
  webPageType
}: {
  path: string
  title: string
  description: string
  image?: string
  type?: 'website' | 'product'
  robots?: string
  extraGraph?: Array<Record<string, unknown>>
  webPageType?: string
}): SeoPage {
  return {
    path,
    title,
    description,
    image,
    type,
    robots,
    canonical: robots.includes('noindex') ? null : canonicalUrl(path),
    jsonLd: serializeJsonLdGraph(
      robots.includes('noindex')
        ? [organizationNode(), websiteNode()]
        : [
            organizationNode(),
            websiteNode(),
            webPageNode({
              path,
              title,
              description,
              type: webPageType ?? (type === 'product' ? 'ItemPage' : 'WebPage')
            }),
            ...extraGraph
          ]
    )
  }
}
```

Do not change `organizationNode()`. Do not change other `page()` call sites except About.

- [ ] **Step 2: Add About helpers and the `/about` branch**

Place after `eventNodes` (before `page()`):

```ts
function aboutNodes(path: string): Array<Record<string, unknown>> {
  const url = canonicalUrl(path)

  return [
    {
      '@type': 'Person',
      '@id': `${url}#sam`,
      name: 'Sam',
      jobTitle: 'Co-founder',
      worksFor: { '@id': ORGANIZATION_ID }
    },
    {
      '@type': 'Person',
      '@id': `${url}#timo`,
      name: 'Timo',
      jobTitle: 'Co-founder',
      worksFor: { '@id': ORGANIZATION_ID }
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'About', item: url }
      ]
    }
  ]
}
```

In `getSeoForPath`, after the `/agenda` branch and before `/contact`:

```ts
if (path === '/about') {
  return page({
    path,
    title: titleWithBrand('About'),
    description:
      "We're Sam and Timo, a couple who turned a Pokémon hobby into Hello World Cards — a small shop for cards, art, and the events we go to.",
    webPageType: 'AboutPage',
    extraGraph: aboutNodes(path)
  })
}
```

In `getIndexableSeoPages`, insert About after agenda and before contact:

```ts
export function getIndexableSeoPages(): SeoPage[] {
  return [
    getSeoForPath('/'),
    getSeoForPath('/products'),
    getSeoForPath('/agenda'),
    getSeoForPath('/about'),
    getSeoForPath('/contact'),
    ...getAllProducts().map((product) => productPage(product))
  ]
}
```

- [ ] **Step 3: Add `/about` to `public/sitemap.xml`**

Insert after agenda, before contact:

```xml
  <url>
    <loc>https://helloworldcards.com/agenda</loc>
  </url>
  <url>
    <loc>https://helloworldcards.com/about</loc>
  </url>
  <url>
    <loc>https://helloworldcards.com/contact</loc>
  </url>
```

- [ ] **Step 4: Lint SEO**

Run: `npx eslint app/seo/pages.ts`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/seo/pages.ts public/sitemap.xml
git commit -m "Add AboutPage SEO, founders JSON-LD, and sitemap entry."
```

---

### Task 6: Lint, typecheck, and prerender verification

**Files:** none new — verify the feature

- [ ] **Step 1: Full lint**

Run: `npm run lint`

Expected: exit 0. No jsx-a11y failures on About, Header, Footer, or BannerFigcaption.

- [ ] **Step 2: Production build (tsc + prerender)**

Run: `npm run build`

Expected: exit 0. Then confirm:

```bash
grep -l "About | Hello World Cards" dist/about/index.html
grep -l "AboutPage" dist/about/index.html
grep -l "helloworldcards.com/about" dist/sitemap.xml
```

`dist/about/index.html` must contain:

- `<title>About | Hello World Cards</title>`
- meta description with “couple who turned a Pokémon hobby”
- `<link rel="canonical" href="https://helloworldcards.com/about" />`
- `"@type":"AboutPage"`
- `"name":"Sam"` and `"name":"Timo"` Person nodes
- `"@type":"BreadcrumbList"`

`dist/sitemap.xml` must contain `https://helloworldcards.com/about`.

- [ ] **Step 3: Manual browser checks** (dev server `npm run dev`)

- `/about` is not 404; one `h1` (“We're Sam and Timo.”); origin `h2`; Sam/Timo `h3`s; how-it-works `h3`s
- Header (desktop + mobile) and footer list About between Agenda and Contact
- On `/about`, About links have `aria-current="page"`
- Skip-to-main still focuses `#main`
- Shop button goes to `/products`; contact CTA goes to `/contact`
- Homepage “Learn more about us” still goes to `/about`
- Banner `img` alt is the shop-photo sentence, not names

- [ ] **Step 4: Commit any verification fixes only if files changed**

If lint/build required edits, commit those files with a message that names the fix. If nothing changed, do not create an empty commit.
