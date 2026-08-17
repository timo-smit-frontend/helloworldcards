# Site Copy and Selling Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shop voice across the site, Marktplaats-or-email product CTAs, unique readable product slugs, and reused flex blocks for cards vs event-only binders.

**Architecture:** Copy stays on routes and data files. Add `MARKTPLAATS_URL` next to Instagram. Products gain optional `marktplaatsUrl` and slugs from `title + subtitle`. Reuse `ContentText` / `ContentCta` with optional section `id`s. SEO/llms inherit the same strings.

**Tech Stack:** React 19, React Router 7, Vite 7, TypeScript, Tailwind 4, existing flex blocks, `eslint-plugin-jsx-a11y`.

**Spec:** `docs/superpowers/specs/2026-08-17-site-copy-voice-design.md`

## Global Constraints

- Voice: professional, welcoming, Pokémon-first. English (`en-GB`). No hype (“impressive”, “popular set”, “you’re in the right place”). No employer or extra life detail.
- Cards sell online (site + Marktplaats). Binders are Sam’s event-table work, not sold online.
- Seller profile `https://www.marktplaats.nl/u/hello-world-cards/25399885/` is chrome (footer, Contact, FAQ), never a product buy button.
- Dummy catalog and filler events stay. Product 1 facts stay. Samantha’s images stay.
- Treat site stock and Marktplaats as synced in copy. All `marktplaatsUrl` values empty this pass.
- No new pages, checkout, binder products, Dutch copy, or nav label changes.
- No new test runner. Verify with `npx eslint` on touched files, then `npm run lint` and `npm run build` at the end.
- Follow existing flex patterns. Do not invent new components.

## File structure

- Modify: `app/services/contact.ts` — `MARKTPLAATS_URL`
- Modify: `app/components/layout/Footer.tsx` — Marktplaats under Follow us
- Modify: `app/components/flex/content/ContentContact.tsx` — Marktplaats next to Instagram
- Modify: `app/components/flex/content/ContentText.tsx` — optional `id`
- Modify: `app/components/flex/content/ContentCta.tsx` — optional `id`
- Modify: `app/components/flex/banner/BannerImage.tsx` — new-tab a11y on external buy links
- Modify: `app/database/products.ts` — descriptions, `marktplaatsUrl`, slug from title+subtitle
- Modify: `app/routes/product.tsx` — Marktplaats vs email CTA
- Modify: `app/routes/home.tsx` — copy + second `ContentText`
- Modify: `app/routes/products.tsx` — copy + events `ContentCta`
- Modify: `app/routes/about.tsx` — copy + events `ContentText`
- Modify: `app/routes/agenda.tsx` — copy
- Modify: `app/routes/contact.tsx` — copy
- Modify: `app/routes/privacy.tsx` — voice pass
- Modify: `app/database/faq.ts` — FAQ answers
- Modify: `app/seo/site.ts` — `SITE_DESCRIPTION`
- Modify: `app/seo/pages.ts` — titles, descriptions, `sameAs`, Person bios
- Modify: `app/seo/llms.ts` — intro

---

### Task 1: Marktplaats URL in chrome

**Files:**

- Modify: `app/services/contact.ts`
- Modify: `app/components/layout/Footer.tsx`
- Modify: `app/components/flex/content/ContentContact.tsx`

**Interfaces:**

- Consumes: existing `INSTAGRAM_URL` / `CONTACT_EMAIL` pattern
- Produces: `export const MARKTPLAATS_URL = 'https://www.marktplaats.nl/u/hello-world-cards/25399885/'`

- [ ] **Step 1: Add the constant**

In `app/services/contact.ts`, next to `INSTAGRAM_URL`:

```ts
export const CONTACT_EMAIL = 'helloworldcards@outlook.com'
export const INSTAGRAM_URL = 'https://www.instagram.com/helloworldcards/'
export const MARKTPLAATS_URL = 'https://www.marktplaats.nl/u/hello-world-cards/25399885/'
```

- [ ] **Step 2: Footer — Marktplaats beside Instagram**

Import `MARKTPLAATS_URL` from `~/services/contact` (already imports `CONTACT_EMAIL`, `INSTAGRAM_URL`).

In the Follow us `<ul>`, after the Instagram `<li>`, add:

```tsx
<li>
  <a
    href={MARKTPLAATS_URL}
    target="_blank"
    rel="noreferrer noopener"
    className="flex w-fit items-center gap-2 transition-colors hover:text-site-envy hover:underline"
  >
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
      <path d="M3 9 12 3l9 6" />
    </svg>
    <span>Marktplaats</span>
    <span className="sr-only"> (opens in a new tab)</span>
  </a>
</li>
```

- [ ] **Step 3: Contact list — same Marktplaats row**

In `ContentContact.tsx`, import `MARKTPLAATS_URL` (file already imports `CONTACT_EMAIL`, `INSTAGRAM_URL`). After the Instagram `<li>`, add the same Marktplaats `<li>` as the footer (same classes, same svg, same sr-only).

- [ ] **Step 4: Lint touched files**

Run: `npx eslint app/services/contact.ts app/components/layout/Footer.tsx app/components/flex/content/ContentContact.tsx`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/services/contact.ts app/components/layout/Footer.tsx app/components/flex/content/ContentContact.tsx
git commit -m "$(cat <<'EOF'
Add Marktplaats seller profile next to Instagram.

EOF
)"
```

---

### Task 2: Unique section ids on reused blocks

**Files:**

- Modify: `app/components/flex/content/ContentText.tsx`
- Modify: `app/components/flex/content/ContentCta.tsx`

**Interfaces:**

- Consumes: existing `ContentText` / `ContentCta` props
- Produces: optional `id?: string` defaulting to `'content-text'` / `'content-cta'`

- [ ] **Step 1: ContentText optional `id`**

Add `id = 'content-text'` to the destructured props and the props type (`id?: string`). Use it on the `<section>`:

```tsx
export default function ContentText({
  title,
  description,
  image,
  alt = '',
  link,
  heading = 'h2',
  sections,
  updated,
  id = 'content-text'
}: {
  title?: string
  description?: string
  image?: string
  alt?: string
  link?: { url: string; title: string }
  heading?: 'h1' | 'h2'
  sections?: ContentTextSection[]
  updated?: string
  id?: string
}) {
  const { ref, isFirst } = useLocationFinder()
  const Title = heading
  const hasSections = Boolean(sections?.length)

  return (
    <section id={id} ref={ref} className={cn('section', isFirst && 'lg:mt-16! mt-12!')}>
```

Leave the rest of the file unchanged. Existing callers omit `id`.

- [ ] **Step 2: ContentCta optional `id`**

Same pattern:

```tsx
export default function ContentCta({
  title,
  description,
  image,
  link,
  id = 'content-cta'
}: {
  title?: string
  description?: string
  image?: string
  link?: { url?: string; title?: string }
  id?: string
}) {
  const { ref, isFirst } = useLocationFinder()

  return (
    <section id={id} ref={ref} className={cn('section', isFirst && 'lg:mt-16! mt-12!')}>
```

Leave the rest unchanged.

- [ ] **Step 3: Lint**

Run: `npx eslint app/components/flex/content/ContentText.tsx app/components/flex/content/ContentCta.tsx`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/flex/content/ContentText.tsx app/components/flex/content/ContentCta.tsx
git commit -m "$(cat <<'EOF'
Allow unique section ids when reusing content blocks.

EOF
)"
```

---

### Task 3: Product slugs, copy, and buy CTA

**Files:**

- Modify: `app/database/products.ts`
- Modify: `app/routes/product.tsx`
- Modify: `app/components/flex/banner/BannerImage.tsx`

**Interfaces:**

- Consumes: `slugify` from `~/services/utils`; `MARKTPLAATS_URL` is not used on product buttons
- Produces: `Product` with optional `marktplaatsUrl?: string`; `slug` from title+subtitle; `getProductBySlug` matches that slug

- [ ] **Step 1: Product type, slug helper, and copy**

Replace `app/database/products.ts` with:

```ts
import { slugify } from '../services/utils'

export type Product = {
  id: number
  title: string
  subtitle: string
  description: string
  images: string[]
  price?: string | number
  marktplaatsUrl?: string
  slug: string
}

type ProductRecord = Omit<Product, 'slug'>

const products: ProductRecord[] = [
  {
    id: 1,
    title: 'Mewtwo Reverse Holo',
    subtitle: '2016 XY Evolutions - 51/108',
    description: 'Reverse holo Mewtwo from the 2016 XY Evolutions set, number 51/108. Graded PSA 9 Mint.',
    images: ['/images/148651617_front.jpg', '/images/148651617_back.jpg'],
    price: '€99'
  },
  {
    id: 2,
    title: 'Blastoise Holo',
    subtitle: 'Base Set - Reverse Holo - 10/102',
    description: 'A reverse holo Blastoise from Base Set. Classic art, the kind of card that still earns a page in the binder.',
    images: ['/images/pokemon-card-front.png', '/images/pokemon-card-back.png'],
    price: '€189'
  },
  {
    id: 3,
    title: 'Venusaur Holo',
    subtitle: 'Base Set - 10/102',
    description: 'Holo Venusaur from Base Set. Grass-type staple with the original full-art energy.',
    images: ['/images/pokemon-card-front.png', '/images/pokemon-card-back.png'],
    price: '€159'
  },
  {
    id: 4,
    title: 'Pikachu Illustrator',
    subtitle: 'Base Set - 10/102',
    description: 'Pikachu Illustrator — a display piece. Ask us if you want a closer look.',
    images: ['/images/pokemon-card-front.png', '/images/pokemon-card-back.png'],
    price: '€1.200'
  },
  {
    id: 5,
    title: 'Mewtwo GX',
    subtitle: 'Base Set - 10/102',
    description: 'Mewtwo GX from the shop. A later-era hit that still pulls focus in a binder.',
    images: ['/images/pokemon-card-front.png', '/images/pokemon-card-back.png'],
    price: '€79'
  },
  {
    id: 6,
    title: 'Eevee Promo',
    subtitle: 'Base Set - 10/102',
    description: 'An Eevee promo with the soft art people pick up and don’t put back.',
    images: ['/images/pokemon-card-front.png', '/images/pokemon-card-back.png']
  }
]

function baseSlug(product: ProductRecord): string {
  return slugify(`${product.title} ${product.subtitle}`)
}

function productSlug(product: ProductRecord): string {
  const base = baseSlug(product)
  const takenByEarlier = products.some((other) => other.id < product.id && baseSlug(other) === base)
  return takenByEarlier ? `${base}-${product.id}` : base
}

function withSlug(product: ProductRecord): Product {
  return { ...product, slug: productSlug(product) }
}

export function getAllProducts(): Product[] {
  return products.map(withSlug)
}

export function getProductsByIds(ids: Array<string | number>): Product[] {
  const byId = new Map(products.map((product) => [String(product.id), product]))

  return ids
    .map((id) => byId.get(String(id)))
    .filter((product): product is ProductRecord => product != null)
    .map(withSlug)
}

export function getProductBySlug(slug: string): Product | undefined {
  const product = products.find((item) => productSlug(item) === slug)
  return product ? withSlug(product) : undefined
}

export function getSimilarProducts(excludeId: number, count = 4): Product[] {
  const pool = products.filter((product) => product.id !== excludeId)
  const shuffled = [...pool]

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled.slice(0, count).map(withSlug)
}
```

Do not set `marktplaatsUrl` on any record this pass.

Confirm product 1 slug is `mewtwo-reverse-holo-2016-xy-evolutions-51-108` (from `slugify`).

- [ ] **Step 2: BannerImage new-tab a11y**

In `app/components/flex/banner/BannerImage.tsx`, replace the buy `<a>` with:

```tsx
<a
  href={link.url}
  target={link.target}
  rel={link.target === '_blank' ? 'noreferrer noopener' : undefined}
  className="button-green mt-auto"
>
  {link.title}
  {link.target === '_blank' ? <span className="sr-only"> (opens in a new tab)</span> : null}
</a>
```

- [ ] **Step 3: Product route CTA**

Replace the `BannerImage` `link` and similar-products title in `app/routes/product.tsx`:

```tsx
const buyLink = product.marktplaatsUrl
  ? { url: product.marktplaatsUrl, title: 'View on Marktplaats', target: '_blank' as const }
  : { url: `mailto:${CONTACT_EMAIL}`, title: 'Email us about this' }

return (
  <Layout>
    <BannerImage
      title={product.title}
      subtitle={product.subtitle}
      description={product.description}
      price={product.price != null ? String(product.price) : undefined}
      link={buyLink}
      images={product.images}
    />
    <ContentProducts title="More from the shop" id={similarIds} />
  </Layout>
)
```

Leave the not-found `ContentText` unchanged. `Mailing` still only intercepts `mailto:` — do not change it.

- [ ] **Step 4: Lint**

Run: `npx eslint app/database/products.ts app/routes/product.tsx app/components/flex/banner/BannerImage.tsx`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/database/products.ts app/routes/product.tsx app/components/flex/banner/BannerImage.tsx
git commit -m "$(cat <<'EOF'
Rewrite product listings and switch buy CTAs to Marktplaats or email.

EOF
)"
```

---

### Task 4: Home copy and stall block

**Files:**

- Modify: `app/routes/home.tsx`

**Interfaces:**

- Consumes: `ContentText` `id` from Task 2; `MARKTPLAATS_URL` not required on Home (mention Marktplaats in copy only)
- Produces: Home stack Banner → Hello World `ContentText` → stall `ContentText` → products → contact CTA

- [ ] **Step 1: Replace `app/routes/home.tsx`**

```tsx
import BannerFigcaption from '~/components/flex/banner/BannerFigcaption'
import ContentCta from '~/components/flex/content/ContentCta'
import ContentProducts from '~/components/flex/content/ContentProducts'
import ContentText from '~/components/flex/content/ContentText'
import { CONTACT_EMAIL } from '~/services/contact'

export default function Home() {
  return (
    <>
      <BannerFigcaption
        title="Hello World Cards"
        description="Pokémon cards listed here and on Marktplaats, plus handpainted binders we bring to events."
        image="/images/hero.jpg"
        link={{ url: '/products', title: 'See our products' }}
        figcaption="This is our little corner of the world"
      />
      <ContentText
        title="<Hello world />"
        description="We're Sam and Timo, a couple of programmers who never quite grew out of Pokémon. That's why the shop is called Hello World."
        image="/images/wooper.png"
        alt="Pokémon card back"
        link={{ url: '/about', title: 'Learn more about us' }}
      />
      <ContentText
        id="content-text-stall"
        title="Cards in the shop, binders at the stall"
        description="We list Pokémon cards here and on Marktplaats. Sam paints custom binders for the event table — you'll see those when we have a stall, not in the checkout."
        image="/images/hero.jpg"
        alt=""
        link={{ url: '/agenda', title: 'See upcoming events' }}
      />
      <ContentProducts title="Our newest products" description="A few cards from the shop. The same stock lives on Marktplaats." id={[1, 2, 3, 4]} />
      <ContentCta
        title="Want to get in touch?"
        description="Questions about a card, an event, or anything else? Send us an email."
        image="/images/hero.jpg"
        link={{
          url: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Question from Hello World Cards')}`,
          title: 'Get in touch'
        }}
      />
    </>
  )
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint app/routes/home.tsx`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/home.tsx
git commit -m "$(cat <<'EOF'
Rewrite home copy and split cards vs event binders into two blocks.

EOF
)"
```

---

### Task 5: Shop copy and events CTA

**Files:**

- Modify: `app/routes/products.tsx`

**Interfaces:**

- Consumes: `ContentCta` from Task 2; `SITE_IMAGE` from `~/seo/site`
- Produces: products grid then events CTA (`id` can stay default — only CTA on the page)

- [ ] **Step 1: Replace `app/routes/products.tsx`**

```tsx
import ContentCta from '~/components/flex/content/ContentCta'
import ContentProducts from '~/components/flex/content/ContentProducts'
import { SITE_IMAGE } from '~/seo/site'

export default function Products() {
  return (
    <>
      <ContentProducts
        title="All the products we currently have in stock"
        description="Pokémon cards we have right now, listed here and on Marktplaats."
      />
      <ContentCta
        title="Looking for a binder?"
        description="Sam's handpainted binders aren't in the shop. We bring them to events."
        image={SITE_IMAGE}
        link={{ url: '/agenda', title: 'See upcoming events' }}
      />
    </>
  )
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint app/routes/products.tsx`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/products.tsx
git commit -m "$(cat <<'EOF'
Point the shop at events for binders instead of mixing that into the grid intro.

EOF
)"
```

---

### Task 6: About copy and stall block

**Files:**

- Modify: `app/routes/about.tsx`

**Interfaces:**

- Consumes: `ContentText` from Task 2; `SITE_IMAGE`; existing `ContentAbout` / `ContentFaq` / `ContentCta`
- Produces: Banner → ContentAbout → events `ContentText` → FAQ → contact CTA

- [ ] **Step 1: Replace `app/routes/about.tsx`**

```tsx
import BannerFigcaption from '~/components/flex/banner/BannerFigcaption'
import ContentAbout from '~/components/flex/content/ContentAbout'
import ContentCta from '~/components/flex/content/ContentCta'
import ContentFaq from '~/components/flex/content/ContentFaq'
import ContentText from '~/components/flex/content/ContentText'
import { getFaqsByPage } from '~/database/faq'
import { SITE_IMAGE } from '~/seo/site'

export default function About() {
  return (
    <>
      <BannerFigcaption
        title="We're Sam and Timo"
        description="We're a couple who turned a Pokémon hobby into this little shop. Cards online, events on the agenda, and a stall when we're out."
        image={SITE_IMAGE}
        figcaption="From our little corner of the hobby."
        alt="Pokémon cards and art from the Hello World Cards shop."
      />
      <ContentAbout
        title="A hobby that turned into a little shop"
        description="Hello World Cards is us: Sam and Timo. We never quite grew out of Pokémon, and we both write software — which is why the shop is called Hello World. We list cards here and on Marktplaats, and we write up the events we're heading to."
        people={[
          {
            name: 'Sam',
            description:
              'Backend developer, and a die-hard Wooper and Quagsire collector. The muddy, dopey Water-types are a forever chase. Psyduck and Slowpoke live in the same pile, Mew shows up whenever the art is too pretty to skip, and cute or pretty full arts almost never get walked past at a table. Sam also paints the binders we bring to events.'
          },
          {
            name: 'Timo',
            description:
              'Frontend developer who has been after Gengar and Ralts for years. Ghosts, psychics, and a few odd frogs: Mewtwo still stops a scroll, Shroomish is an easy yes, and Flygon and Politoed are the ones that make an event stall last a little longer than it should.'
          }
        ]}
        peopleCaption="Two nerds who never quite outgrew Pokémon."
      />
      <ContentText
        title="What we bring to a stall"
        description="Cards from the shop, and Sam's custom handpainted binders. The binders aren't listed online — they come with us to the next event."
        image={SITE_IMAGE}
        alt=""
        link={{ url: '/agenda', title: 'See upcoming events' }}
      />
      <ContentFaq items={getFaqsByPage('about')} />
      <ContentCta
        title="Want to get in touch?"
        description="Questions about a card, an event, or anything else? Send us a message."
        image={SITE_IMAGE}
        link={{ url: '/contact', title: 'Get in touch' }}
      />
    </>
  )
}
```

About has one `ContentText` and one `ContentCta`, so default ids are fine.

- [ ] **Step 2: Lint**

Run: `npx eslint app/routes/about.tsx`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/routes/about.tsx
git commit -m "$(cat <<'EOF'
Tighten About copy and give binders their own events block.

EOF
)"
```

---

### Task 7: Agenda, Contact, FAQ, Privacy

**Files:**

- Modify: `app/routes/agenda.tsx`
- Modify: `app/routes/contact.tsx`
- Modify: `app/database/faq.ts`
- Modify: `app/routes/privacy.tsx`

**Interfaces:**

- Consumes: `MARKTPLAATS_URL` and `CONTACT_EMAIL` in FAQ strings
- Produces: updated FAQ answers used by About, Contact, JSON-LD, and llms.txt

- [ ] **Step 1: Agenda copy**

```tsx
import ContentAgenda from '~/components/flex/content/ContentAgenda'

export default function Agenda() {
  return (
    <>
      <h1 className="sr-only">Agenda</h1>
      <ContentAgenda
        title="Upcoming events"
        description="We'll be at these Pokémon events. Come say hi, browse the stall, and have a look at Sam's binders."
      />
    </>
  )
}
```

Keep `app/database/events.ts` unchanged.

- [ ] **Step 2: Contact page copy**

```tsx
import ContentContact from '~/components/flex/content/ContentContact'
import ContentFaq from '~/components/flex/content/ContentFaq'
import { getFaqsByPage } from '~/database/faq'

export default function Contact() {
  return (
    <>
      <ContentContact
        title="Get in touch"
        description="Questions about a card, an event, a binder at a stall, or anything else? Send us a message."
      />
      <ContentFaq items={getFaqsByPage('contact')} />
    </>
  )
}
```

- [ ] **Step 3: Replace FAQ data**

Replace `app/database/faq.ts` with:

```ts
import { CONTACT_EMAIL, MARKTPLAATS_URL } from '../services/contact'

export type FaqPage = 'about' | 'contact'

export type FaqItem = {
  id: number
  page: FaqPage
  question: string
  answer: string
}

const faqs: FaqItem[] = [
  {
    id: 1,
    page: 'about',
    question: 'What is Hello World Cards?',
    answer: 'A small Pokémon shop run by Sam and Timo. We list cards here and on Marktplaats, and we bring handpainted binders to events.'
  },
  {
    id: 2,
    page: 'about',
    question: 'Who runs Hello World Cards?',
    answer:
      'Sam and Timo, a couple of programmers who collect Pokémon. Sam collects Wooper and Quagsire and paints the binders. Timo chases Gengar and Ralts.'
  },
  {
    id: 3,
    page: 'about',
    question: 'Do you have a physical shop?',
    answer: 'No walk-in storefront. We sell cards online and on Marktplaats, and in person at Pokémon events in the Netherlands and Belgium.'
  },
  {
    id: 4,
    page: 'about',
    question: 'What do you sell?',
    answer: "Pokémon cards, including graded cards, listed here and on Marktplaats. Sam's custom handpainted binders come with us to events."
  },
  {
    id: 5,
    page: 'contact',
    question: 'How do I buy a card?',
    answer: `Cards are listed here and on Marktplaats (${MARKTPLAATS_URL}). If the product page has a Marktplaats link, that's the listing. If it doesn't, email us at ${CONTACT_EMAIL}. You can always email about anything.`
  },
  {
    id: 6,
    page: 'contact',
    question: 'How can I get in touch?',
    answer: 'Email, the contact form, Instagram @helloworldcards, or our Marktplaats page.'
  },
  {
    id: 7,
    page: 'contact',
    question: 'Where can I meet you in person?',
    answer: "At the events on the agenda. We bring a stall with cards and Sam's handpainted binders."
  }
]

export function getAllFaqs(): FaqItem[] {
  return [...faqs]
}

export function getFaqsByPage(page: FaqPage): FaqItem[] {
  return faqs.filter((item) => item.page === page)
}
```

Leave `ContentFaq` as plain text (Contact already has the clickable Marktplaats link).

- [ ] **Step 4: Privacy voice pass**

In `app/routes/privacy.tsx`, change only:

- `ContentText` `description` to: `Hello World Cards is a small Pokémon shop run by Sam and Timo. We are not a company. This page says what happens when you visit the site or send us a message.`
- “Who we are” body paragraph to: `Hello World Cards is Sam and Timo. We list Pokémon cards here and on Marktplaats, and we write about events we go to. You can reach us at ` + existing mailto link.

Do not add Marktplaats as a processor. Leave GTM, Clarity, cookies, and messages sections unchanged.

- [ ] **Step 5: Lint**

Run: `npx eslint app/routes/agenda.tsx app/routes/contact.tsx app/database/faq.ts app/routes/privacy.tsx`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/routes/agenda.tsx app/routes/contact.tsx app/database/faq.ts app/routes/privacy.tsx
git commit -m "$(cat <<'EOF'
Align agenda, contact, FAQ, and privacy with the shop voice.

EOF
)"
```

---

### Task 8: SEO, JSON-LD, and llms.txt

**Files:**

- Modify: `app/seo/site.ts`
- Modify: `app/seo/pages.ts`
- Modify: `app/seo/llms.ts`

**Interfaces:**

- Consumes: `MARKTPLAATS_URL` from `~/services/contact`; product/FAQ strings from Tasks 3 and 7
- Produces: matching meta, `sameAs`, Person bios, llms intro

- [ ] **Step 1: Site description**

In `app/seo/site.ts`:

```ts
export const SITE_DESCRIPTION =
  'Pokémon cards from Sam and Timo — listed here and on Marktplaats. Handpainted binders come with us to events.'
```

- [ ] **Step 2: pages.ts — import, sameAs, Person, page copy**

Add `MARKTPLAATS_URL` to the existing contact import:

```ts
import { CONTACT_EMAIL, INSTAGRAM_URL, MARKTPLAATS_URL } from '../services/contact'
```

In `organizationNode()`:

```ts
sameAs: [INSTAGRAM_URL, MARKTPLAATS_URL],
```

In `aboutNodes`, set Sam `description` to:

`Backend developer, and a die-hard Wooper and Quagsire collector. The muddy, dopey Water-types are a forever chase. Psyduck and Slowpoke live in the same pile, Mew shows up whenever the art is too pretty to skip, and cute or pretty full arts almost never get walked past at a table. Sam also paints the binders we bring to events.`

Timo description stays as in About (already matches). Only Sam’s JSON-LD needs the binder sentence.

In `getSeoForPath`:

- `/` title: `` `${SITE_NAME} | Pokémon cards and events` ``
- `/products` description: `Browse Pokémon cards listed here and on Marktplaats.`
- `/agenda` description: `We'll be at these Pokémon events. Come say hi, browse the stall, and have a look at Sam's binders.`
- `/about` description: `We're Sam and Timo, a couple of programmers who turned a Pokémon hobby into Hello World Cards.`
- `/contact` description: `Questions about a card, an event, or anything else? Send us a message.`

Leave privacy title/structure. Product meta still uses `product.description` + price.

- [ ] **Step 3: llms intro**

In `app/seo/llms.ts`, import `MARKTPLAATS_URL` and replace `introMarkdown`:

```ts
function introMarkdown(): string {
  return [
    `# ${SITE_NAME}`,
    `> ${SITE_DESCRIPTION}`,
    '',
    `${SITE_NAME} is a small Pokémon shop run by Sam and Timo. We list cards here and on Marktplaats (${MARKTPLAATS_URL}), and we bring handpainted binders to events. Email ${CONTACT_EMAIL} about a card, an event, or anything else.`
  ].join('\n')
}
```

- [ ] **Step 4: Lint**

Run: `npx eslint app/seo/site.ts app/seo/pages.ts app/seo/llms.ts`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/seo/site.ts app/seo/pages.ts app/seo/llms.ts
git commit -m "$(cat <<'EOF'
Match SEO and llms.txt to the shop voice and Marktplaats profile.

EOF
)"
```

---

### Task 9: Full verification

**Files:** none new — check the spec’s verification list.

- [ ] **Step 1: Lint and build**

Run:

```bash
npm run lint
npm run build
```

Expected: lint clean; `tsc -b && vite build` succeeds.

- [ ] **Step 2: Spec checklist (browser or built HTML)**

- Product 1 URL is `/products/mewtwo-reverse-holo-2016-xy-evolutions-51-108`.
- Product pages show **Email us about this** (no `marktplaatsUrl` yet), not **Buy the …**.
- Footer, Contact, and buy FAQ include the seller profile URL. Product buttons do not use that profile URL.
- Home has two `ContentText` sections (`content-text` and `content-text-stall`).
- Shop has the binders `ContentCta` after the grid.
- About has “What we bring to a stall” before FAQ.
- No leftover “impressive PSA 9” dummy template or “two friends sharing a hobby” site description.

- [ ] **Step 3: Commit only if Step 1–2 required fixes**

If verification found issues, fix them, lint, and commit with a message that says what was wrong. If clean, do not make an empty commit.

---

## Spec coverage

| Spec section | Task |
| --- | --- |
| Voice | 4–8 (copy), 9 (grep leftovers) |
| Buying / seller profile / binders | 1, 3, 7 |
| Product data + slugs | 3 |
| Reused blocks + unique ids | 2, 4, 5, 6 |
| Home / shop / product / about / agenda / contact / privacy / footer | 1, 3–7 |
| FAQ | 7 |
| SEO / llms / JSON-LD | 8 |
| Verification | 9 |
| Out of scope (no dummy removal, no listing URLs, no new pages) | honored |
