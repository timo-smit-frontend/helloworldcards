# ContentProducts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a typed products database, a reusable `ContentProducts` flex block (optional IDs → subset, omit → all), a `/products` listing page, and stub detail pages at `/products/:slug`.

**Architecture:** Products live in `app/database/products.ts` with thin helpers. `ContentProducts` resolves products from that file (Pokemon-style optional `id`), renders an optional title/description plus a hover-image grid linking to detail. Routes in `main.tsx` compose the listing and detail pages; home mounts a 3-ID highlight example.

**Tech Stack:** React 19, TypeScript, Vite, React Router 7, Tailwind 4 (existing utilities: `section`, `container-full`, `title-*`, `content-*`, `Animated`).

## Global Constraints

- All `ContentProducts` props optional (`title`, `description`, `id`)
- Product URLs use slug: `/products/:slug`
- No product filters / search UI yet
- Do not add Header/nav Products link
- Do not add new npm dependencies
- No automated unit tests (project has no test runner); verify with `npx tsc -b` and `npm run lint`
- Spec: `docs/superpowers/specs/2026-08-12-content-products-design.md`

## File Structure

| File | Responsibility |
|------|----------------|
| `app/database/products.ts` | `Product` type, seed data, lookup helpers |
| `app/components/flex/content/ContentProducts.tsx` | Flex section: title/description + product grid |
| `app/routes/products.tsx` | Listing page (all products) |
| `app/routes/product.tsx` | Detail stub by slug |
| `app/main.tsx` | Register routes |
| `app/routes/home.tsx` | Highlight example with three IDs |

---

### Task 1: Products database

**Files:**
- Create: `app/database/products.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export type Product = { id: number; slug: string; title: string; description: string; image: string; imageHover: string; price?: string | number; category?: string }`
  - `export function getAllProducts(): Product[]`
  - `export function getProductsByIds(ids: Array<string | number>): Product[]`
  - `export function getProductBySlug(slug: string): Product | undefined`

- [ ] **Step 1: Create `app/database/products.ts`**

```ts
export type Product = {
  id: number
  slug: string
  title: string
  description: string
  image: string
  imageHover: string
  price?: string | number
  category?: string
}

const products: Product[] = [
  {
    id: 1,
    slug: 'charizard-holo',
    title: 'Charizard Holo',
    description: 'A classic holographic Charizard card from the Base Set era.',
    image: 'https://picsum.photos/seed/charizard/600/800',
    imageHover: 'https://picsum.photos/seed/charizard-hover/600/800',
    price: '€249',
    category: 'Pokemon'
  },
  {
    id: 2,
    slug: 'blastoise-holo',
    title: 'Blastoise Holo',
    description: 'Powerful Water-type evolution with a deep blue holographic finish.',
    image: 'https://picsum.photos/seed/blastoise/600/800',
    imageHover: 'https://picsum.photos/seed/blastoise-hover/600/800',
    price: '€189',
    category: 'Pokemon'
  },
  {
    id: 3,
    slug: 'venusaur-holo',
    title: 'Venusaur Holo',
    description: 'Grass-type powerhouse with a rich green holographic pattern.',
    image: 'https://picsum.photos/seed/venusaur/600/800',
    imageHover: 'https://picsum.photos/seed/venusaur-hover/600/800',
    price: '€159',
    category: 'Pokemon'
  },
  {
    id: 4,
    slug: 'pikachu-illustrator',
    title: 'Pikachu Illustrator',
    description: 'An ultra-rare promotional Pikachu card for serious collectors.',
    image: 'https://picsum.photos/seed/pikachu/600/800',
    imageHover: 'https://picsum.photos/seed/pikachu-hover/600/800',
    price: '€1.200',
    category: 'Pokemon'
  },
  {
    id: 5,
    slug: 'mewtwo-gx',
    title: 'Mewtwo GX',
    description: 'Psychic-type GX card with striking artwork and playability.',
    image: 'https://picsum.photos/seed/mewtwo/600/800',
    imageHover: 'https://picsum.photos/seed/mewtwo-hover/600/800',
    price: '€79',
    category: 'Pokemon'
  },
  {
    id: 6,
    slug: 'eevee-promo',
    title: 'Eevee Promo',
    description: 'Cute promo Eevee — a friendly starter for any collection.',
    image: 'https://picsum.photos/seed/eevee/600/800',
    imageHover: 'https://picsum.photos/seed/eevee-hover/600/800',
    category: 'Pokemon'
  }
]

export function getAllProducts(): Product[] {
  return products
}

export function getProductsByIds(ids: Array<string | number>): Product[] {
  const byId = new Map(products.map((product) => [String(product.id), product]))

  return ids
    .map((id) => byId.get(String(id)))
    .filter((product): product is Product => product != null)
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug)
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: exit 0, no errors mentioning `products.ts`

- [ ] **Step 3: Commit (only if the user asked to commit)**

```bash
git add app/database/products.ts
git commit -m "$(cat <<'EOF'
Add typed products database with lookup helpers.

EOF
)"
```

---

### Task 2: ContentProducts component

**Files:**
- Create: `app/components/flex/content/ContentProducts.tsx`

**Interfaces:**
- Consumes: `getAllProducts`, `getProductsByIds`, `Product` from `~/database/products`; `Animated` from `~/components/elements/Animated`; `Link` from `react-router`
- Produces: `default function ContentProducts({ title?, description?, id? }: { title?: string; description?: string; id?: string | number | Array<string | number> })`

- [ ] **Step 1: Create `app/components/flex/content/ContentProducts.tsx`**

```tsx
import { Link } from 'react-router'
import { Animated } from '~/components/elements/Animated'
import { getAllProducts, getProductsByIds } from '~/database/products'

function normalizeIds(id?: string | number | Array<string | number>): Array<string | number> | undefined {
  if (id == null) return undefined
  return Array.isArray(id) ? id : [id]
}

export default function ContentProducts({
  title,
  description,
  id
}: {
  title?: string
  description?: string
  id?: string | number | Array<string | number>
}) {
  const ids = normalizeIds(id)
  const products = ids ? getProductsByIds(ids) : getAllProducts()

  return (
    <section id="content-products" className="section">
      <div className="container-full">
        <div className="flex flex-col gap-10">
          {(title || description) && (
            <div className="flex flex-col gap-4 max-w-3xl">
              {title && (
                <Animated delay={100}>
                  <h2 className="title-l">{title}</h2>
                </Animated>
              )}
              {description && (
                <Animated delay={200}>
                  <p className="content-l text-site-deep-green">{description}</p>
                </Animated>
              )}
            </div>
          )}

          {products.length > 0 && (
            <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
              {products.map((product, index) => (
                <li key={product.id}>
                  <Animated delay={100 + index * 75}>
                    <Link to={`/products/${product.slug}`} className="group flex flex-col gap-3">
                      <div className="relative aspect-3/4 overflow-hidden bg-neutral-100">
                        <img
                          src={product.image}
                          alt={product.title}
                          className="absolute inset-0 size-full object-cover transition-opacity duration-300 group-hover:opacity-0"
                        />
                        <img
                          src={product.imageHover}
                          alt=""
                          aria-hidden
                          className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                        />
                      </div>
                      <span className="title-xs">{product.title}</span>
                      {product.price != null && (
                        <span className="content-s text-site-deep-green">{product.price}</span>
                      )}
                    </Link>
                  </Animated>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: exit 0, no errors mentioning `ContentProducts.tsx`

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exit 0 (or only pre-existing issues unrelated to this file)

- [ ] **Step 4: Commit (only if the user asked to commit)**

```bash
git add app/components/flex/content/ContentProducts.tsx
git commit -m "$(cat <<'EOF'
Add ContentProducts flex block with optional product IDs.

EOF
)"
```

---

### Task 3: Products listing + detail routes

**Files:**
- Create: `app/routes/products.tsx`
- Create: `app/routes/product.tsx`
- Modify: `app/main.tsx`

**Interfaces:**
- Consumes: `ContentProducts`; `getProductBySlug` from `~/database/products`; `useParams`, `Link` from `react-router`
- Produces: listing at `/products`, detail at `/products/:slug`

- [ ] **Step 1: Create `app/routes/products.tsx`**

```tsx
import ContentProducts from '~/components/flex/content/ContentProducts'

export default function Products() {
  return (
    <ContentProducts
      title="All products"
      description="Browse our full collection of cards. Filters coming soon."
    />
  )
}
```

- [ ] **Step 2: Create `app/routes/product.tsx`**

```tsx
import { Link, useParams } from 'react-router'
import { Animated } from '~/components/elements/Animated'
import { getProductBySlug } from '~/database/products'

export default function Product() {
  const { slug } = useParams()
  const product = slug ? getProductBySlug(slug) : undefined

  if (!product) {
    return (
      <section className="section">
        <div className="container-full flex flex-col gap-4 max-w-3xl">
          <h1 className="title-l">Product not found</h1>
          <p className="content-l text-site-deep-green">
            We could not find a product at this address.
          </p>
          <Link to="/products" className="button-deep-green w-fit">
            Back to products
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="section">
      <div className="container-full">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-start">
          <Animated delay={100}>
            <div className="relative aspect-3/4 overflow-hidden bg-neutral-100 group">
              <img
                src={product.image}
                alt={product.title}
                className="absolute inset-0 size-full object-cover transition-opacity duration-300 group-hover:opacity-0"
              />
              <img
                src={product.imageHover}
                alt=""
                aria-hidden
                className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
            </div>
          </Animated>

          <div className="flex flex-col gap-4">
            <Animated delay={200}>
              <h1 className="title-l">{product.title}</h1>
            </Animated>
            {product.category && (
              <Animated delay={250}>
                <p className="content-s text-site-deep-green">{product.category}</p>
              </Animated>
            )}
            {product.price != null && (
              <Animated delay={300}>
                <p className="title-s">{product.price}</p>
              </Animated>
            )}
            <Animated delay={350}>
              <p className="content-l text-site-deep-green">{product.description}</p>
            </Animated>
            <Animated delay={400}>
              <Link to="/products" className="button-deep-green w-fit">
                Back to products
              </Link>
            </Animated>
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Register routes in `app/main.tsx`**

Replace the imports and `Routes` block so they match:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import Root from '~/root'
import Contact from '~/routes/contact'
import Home from '~/routes/home'
import Product from '~/routes/product'
import Products from '~/routes/products'
import '~/global.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Root />}>
          <Route index element={<Home />} />
          <Route path="products" element={<Products />} />
          <Route path="products/:slug" element={<Product />} />
          <Route path="contact" element={<Contact />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
)
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc -b && npm run lint`
Expected: exit 0 (or only pre-existing issues unrelated to these files)

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`  
Visit `/products` — all seed products listed.  
Click a product — detail stub shows title, description, images, optional price/category.  
Visit `/products/not-a-real-slug` — not-found + back link.

- [ ] **Step 6: Commit (only if the user asked to commit)**

```bash
git add app/routes/products.tsx app/routes/product.tsx app/main.tsx
git commit -m "$(cat <<'EOF'
Add products listing and product detail routes.

EOF
)"
```

---

### Task 4: Home highlight example

**Files:**
- Modify: `app/routes/home.tsx`

**Interfaces:**
- Consumes: `ContentProducts` with `id={[1, 2, 3]}`
- Produces: home page shows a three-product highlight below existing content

- [ ] **Step 1: Update `app/routes/home.tsx`**

```tsx
import BannerImage from '~/components/flex/banner/BannerImage'
import ContentProducts from '~/components/flex/content/ContentProducts'
import ContentText from '~/components/flex/content/ContentText'

export default function Home() {
  return (
    <>
      <BannerImage
        title="Hello World Cards"
        description="Currently in development"
        image="https://picsum.photos/1920/1080"
        link={{ url: '/products', target: '_self', title: 'View products' }}
      />
      <ContentText
        title="Welcome to Hello World Cards"
        description="We are currently in development. Please check back soon for updates."
      />
      <ContentProducts
        title="Featured cards"
        description="A few picks from the shop."
        id={[1, 2, 3]}
      />
    </>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc -b && npm run lint`
Expected: exit 0 (or only pre-existing issues unrelated to `home.tsx`)

- [ ] **Step 3: Manual smoke check**

Run: `npm run dev`  
Home shows three featured products. Banner CTA goes to `/products`. Featured cards link to detail pages.

- [ ] **Step 4: Commit (only if the user asked to commit)**

```bash
git add app/routes/home.tsx
git commit -m "$(cat <<'EOF'
Show featured products highlight on the home page.

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `app/database/products.ts` with type + helpers | Task 1 |
| Seed products (readable) | Task 1 |
| Optional `price` / `category` | Task 1 |
| `ContentProducts` optional title/description/id | Task 2 |
| Hover image swap | Task 2 |
| Link to `/products/:slug` | Task 2 |
| Unknown IDs skipped; empty grid ok | Task 2 |
| `/products` listing (all) | Task 3 |
| `/products/:slug` full stub + not-found | Task 3 |
| Home highlight with 3 IDs | Task 4 |
| Filters / nav link out of scope | — (intentionally omitted) |
