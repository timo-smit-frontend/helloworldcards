# Concept Listings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shop visitors can see concept cards (Arceus, Latias, Zekrom) but cannot buy them until a Marktplaats listing URL exists.

**Architecture:** Inventory-only `concept?: boolean`, stripped from public `Product` like `sold`. The buy CTA reads `marktplaatsUrl` only: set → **View on Marktplaats**; missing → disabled **Not yet available to buy**. No Marktplaats API, login, or browser posting.

**Tech Stack:** React 19, React Router 7, TypeScript, Tailwind 4 (`button-green`), Vitest (node, `test/**/*.test.ts`). No new test runner, no RTL/jsdom.

**Spec:** `docs/superpowers/specs/2026-08-31-concept-listings-design.md`

## Global Constraints

- English (`en-GB`). Button copy is exactly **Not yet available to buy** and **View on Marktplaats**.
- Concept cards stay in the public shop (`isShopListed` stays sold-only). Sold still wins.
- Invariant: `concept: true` means no `marktplaatsUrl`. A listing URL means omit `concept`. Never both.
- Shop CTA does not read `concept`; it reads `marktplaatsUrl`.
- No Marktplaats login, stored session, scraping, dashboard publish action, grid badges, or ledger changes.
- Do not add `@testing-library/react` or jsdom. CTA behaviour is tested via `productBuyLink`; BannerCarousel is a render of that object.
- Verify with `npx vitest run` on touched tests, `npx eslint` on touched files, then `npm test` and `npm run build` at the end.

## File structure

- Modify: `app/database/products.ts` — `concept` on inventory, flags on ids 6–8, strip from public, `productBuyLink`
- Modify: `app/routes/product.tsx` — drop mailto; use `productBuyLink`
- Modify: `app/components/flex/banner/BannerCarousel.tsx` — disabled button when `link.title` has no `url`
- Modify: `app/global.css` — `[disabled]` on `button-green`
- Modify: `app/database/faq.ts` — How do I buy a card?
- Modify: `test/products.test.ts` — concept / public strip / buy CTA
- Create: `test/faq.test.ts` — buy FAQ copy
- Existing: `docs/superpowers/specs/2026-08-31-concept-listings-design.md` (include in the first commit if still untracked)

---

### Task 1: Inventory `concept` flag

**Files:**

- Modify: `app/database/products.ts`
- Modify: `test/products.test.ts`
- Existing: `docs/superpowers/specs/2026-08-31-concept-listings-design.md`

**Interfaces:**

- Consumes: existing `InventoryProduct`, `ProductRecord`, `withSlug`, `withInventory`
- Produces: `concept?: boolean` on inventory records; public `Product` never has `concept`; ids 6–8 `concept: true` and no `marktplaatsUrl`; ids 1–5 unchanged live URLs

- [ ] **Step 1: Write the failing tests**

In `test/products.test.ts`, extend the existing “keeps purchase cost and sale status off the public product records” test so it also asserts `concept` is absent:

```ts
it('keeps purchase cost and sale status off the public product records', () => {
  expect(
    getAllProducts().every(
      (product) =>
        !('cost' in product) &&
        !('sold' in product) &&
        !('soldAt' in product) &&
        !('acquiredAt' in product) &&
        !('concept' in product)
    )
  ).toBe(true)
})
```

Add a new test after the sold-cards test:

```ts
it('marks Arceus, Latias, and Zekrom as concept inventory without listing URLs', () => {
  const inventory = getInventory()
  const liveIds = [1, 2, 3, 4, 5]
  const conceptIds = [6, 7, 8]

  for (const id of liveIds) {
    const item = inventory.find((product) => product.id === id)
    expect(item?.concept).toBeUndefined()
    expect(item?.marktplaatsUrl).toMatch(/^https:\/\/www\.marktplaats\.nl\//)
  }

  for (const id of conceptIds) {
    const item = inventory.find((product) => product.id === id)
    expect(item?.concept).toBe(true)
    expect(item?.marktplaatsUrl).toBeUndefined()
    expect(getAllProducts().some((product) => product.id === id)).toBe(true)
  }

  expect(inventory.every((item) => !(item.concept && item.marktplaatsUrl))).toBe(true)
})
```

Also add `expect(sample.every((product) => !('concept' in product))).toBe(true)` next to the existing `!('sold' in product)` assertion in “picks a random sample of available shop cards”.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/products.test.ts`

Expected: FAIL — `concept` is undefined on ids 6–8 (not `true`).

- [ ] **Step 3: Add `concept` to types, strip it from public products, flag ids 6–8**

On `InventoryProduct`, next to `sold`:

```ts
/** On the shop but not listed on Marktplaats yet. Stripped from the public shop bundle. */
concept?: boolean
```

On `ProductRecord`, next to `sold?: boolean`:

```ts
concept?: boolean
```

On the Arceus V, Mega Latias ex, and Zekrom records (ids 6–8), after `acquiredAt` (or `year` / `cost` — keep field order consistent with neighbours: after `acquiredAt` if present, else after `cost`):

```ts
concept: true
```

Do not add `concept` to ids 1–5. Do not add `marktplaatsUrl` to ids 6–8.

In `withSlug`, delete `concept` with the other inventory fields:

```ts
function withSlug(product: ProductRecord): Product {
  const publicProduct = { ...product, images: product.images ?? [], slug: productSlug(product) }
  delete publicProduct.cost
  delete publicProduct.sold
  delete publicProduct.soldAt
  delete publicProduct.acquiredAt
  delete publicProduct.concept
  return publicProduct
}
```

In `withInventory`, re-attach `concept` the same way as `sold`:

```ts
function withInventory(product: ProductRecord): InventoryProduct {
  const publicProduct = withSlug(product)
  return {
    ...publicProduct,
    ...(product.cost != null ? { cost: product.cost } : {}),
    ...(product.sold ? { sold: true } : {}),
    ...(product.soldAt ? { soldAt: product.soldAt } : {}),
    ...(product.acquiredAt ? { acquiredAt: product.acquiredAt } : {}),
    ...(product.concept ? { concept: true } : {})
  }
}
```

Leave `isShopListed` as `product.sold !== true`. Do not change `stripProductCosts` (cost-only, same as `sold`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/products.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/database/products.ts test/products.test.ts docs/superpowers/specs/2026-08-31-concept-listings-design.md
git commit -m "$(cat <<'EOF'
Add concept inventory status for cards not yet on Marktplaats.

EOF
)"
```

---

### Task 2: Buy CTA — live listing vs disabled concept

**Files:**

- Modify: `app/database/products.ts`
- Modify: `test/products.test.ts`
- Modify: `app/routes/product.tsx`
- Modify: `app/components/flex/banner/BannerCarousel.tsx`
- Modify: `app/global.css`

**Interfaces:**

- Consumes: `Product.marktplaatsUrl`; BannerCarousel `link?: { url?: string; target?: string; title?: string }`
- Produces: `export type ProductBuyLink = { title: string; url?: string; target?: '_blank' }` and `export function productBuyLink(product: Pick<Product, 'marktplaatsUrl'>): ProductBuyLink`

- [ ] **Step 1: Write the failing buy-CTA tests**

In `test/products.test.ts`, import `productBuyLink` from `~/database/products` (add it to the existing import). Add:

```ts
it('uses a Marktplaats buy link when the listing URL is set', () => {
  const product = getProductBySlug('mewtwo-2016-evolutions-51')
  expect(productBuyLink(product!)).toEqual({
    url: 'https://www.marktplaats.nl/seller/view/m2436737465',
    title: 'View on Marktplaats',
    target: '_blank'
  })
})

it('uses a disabled concept CTA when there is no listing URL', () => {
  const product = getProductBySlug('arceus-v-2022-brilliant-stars-165')
  expect(product?.marktplaatsUrl).toBeUndefined()
  expect(productBuyLink(product!)).toEqual({ title: 'Not yet available to buy' })
  expect(productBuyLink(product!).url).toBeUndefined()
})
```

Do not add React component tests. Vitest is node-only; `productBuyLink` is the CTA contract BannerCarousel renders.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/products.test.ts`

Expected: FAIL — `productBuyLink` is not exported.

- [ ] **Step 3: Add `productBuyLink`**

In `app/database/products.ts`, after the `InventoryProduct` type (before `ProductRecord`):

```ts
export type ProductBuyLink = {
  title: string
  url?: string
  target?: '_blank'
}

export function productBuyLink(product: Pick<Product, 'marktplaatsUrl'>): ProductBuyLink {
  if (product.marktplaatsUrl) {
    return { url: product.marktplaatsUrl, title: 'View on Marktplaats', target: '_blank' }
  }

  return { title: 'Not yet available to buy' }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/products.test.ts`

Expected: PASS.

- [ ] **Step 5: Wire the product page**

In `app/routes/product.tsx`:

- Import `productBuyLink` from `~/database/products` (same import as `getProductBySlug`).
- Remove `CONTACT_EMAIL` from the `~/services/contact` import (keep `MARKTPLAATS_URL`).
- Replace the mailto fallback with:

```ts
const buyLink = productBuyLink(product)
```

`BannerCarousel` still receives `link={buyLink}`. Leave the **We sell on Marktplaats** `ContentText` block unchanged.

- [ ] **Step 6: Render a disabled button in BannerCarousel**

In `app/components/flex/banner/BannerCarousel.tsx`, replace the `{link?.url && link?.title && (` block with:

```tsx
{link?.title && (
  <Animated delay={400}>
    <div>
      {link.url ? (
        <a
          href={link.url}
          target={link.target}
          rel={link.target === '_blank' ? 'noreferrer noopener' : undefined}
          className="button-green mt-auto"
        >
          {link.title}
          {link.target === '_blank' ? <span className="sr-only"> (opens in a new tab)</span> : null}
        </a>
      ) : (
        <button type="button" disabled className="button-green mt-auto">
          {link.title}
        </button>
      )}
    </div>
  </Animated>
)}
```

Do not change `BannerFigcaption` or other CTAs.

- [ ] **Step 7: Disabled styles on `button-green`**

In `app/global.css`, inside `@utility button-green`, after the `&:not([disabled]) { ... }` block (still inside the utility), add:

```css
  &[disabled] {
    @apply cursor-not-allowed opacity-60;
  }
```

Do not restyle dashboard/contact submit buttons beyond this shared rule.

- [ ] **Step 8: Lint touched files and re-run tests**

Run:

```bash
npx eslint app/database/products.ts app/routes/product.tsx app/components/flex/banner/BannerCarousel.tsx app/global.css test/products.test.ts
npx vitest run test/products.test.ts
```

Expected: eslint clean, tests PASS. `CONTACT_EMAIL` must not remain unused in `product.tsx`.

- [ ] **Step 9: Commit**

```bash
git add app/database/products.ts app/routes/product.tsx app/components/flex/banner/BannerCarousel.tsx app/global.css test/products.test.ts
git commit -m "$(cat <<'EOF'
Disable product buy CTA until a Marktplaats listing exists.

EOF
)"
```

---

### Task 3: Buy FAQ copy

**Files:**

- Modify: `app/database/faq.ts`
- Create: `test/faq.test.ts`

**Interfaces:**

- Consumes: `getFaqsByPage('contact')`, FAQ id 6 **How do I buy a card?**
- Produces: that answer no longer tells people to email when there is no listing; `CONTACT_EMAIL` unused in this file is removed

- [ ] **Step 1: Write the failing FAQ test**

Create `test/faq.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getFaqsByPage } from '~/database/faq'

describe('buy FAQ', () => {
  it('sends people to Marktplaats when listed and does not use email as checkout for concept cards', () => {
    const item = getFaqsByPage('contact').find((faq) => faq.question === 'How do I buy a card?')

    expect(item?.answer).toContain('View on Marktplaats')
    expect(item?.answer).toContain('not yet available to buy')
    expect(item?.answer).not.toMatch(/email us/i)
    expect(item?.answer).not.toContain('@')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/faq.test.ts`

Expected: FAIL — current answer still says to email.

- [ ] **Step 3: Replace the answer and drop the unused import**

In `app/database/faq.ts`, remove `import { CONTACT_EMAIL } from '../services/contact'`.

Replace the id 6 answer with:

```ts
{
  id: 6,
  page: 'contact',
  question: 'How do I buy a card?',
  answer:
    'Browse the shop on this site. If a product has a View on Marktplaats button, that is the listing — you buy it there. If the button says it is not yet available to buy, the card is on the site but not for sale yet. Email and the contact form are for questions, not for buying those cards.'
},
```

Do not rewrite other FAQ items.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/faq.test.ts test/products.test.ts`

Expected: PASS.

- [ ] **Step 5: Full verify**

Run:

```bash
npx eslint app/database/faq.ts test/faq.test.ts
npm test
npm run build
```

Expected: eslint clean, all tests PASS, build succeeds.

In the browser (dev server): open a live card (e.g. Mewtwo) and confirm **View on Marktplaats** still opens a new tab. Open Arceus, Mega Latias ex, and Zekrom and confirm the disabled **Not yet available to buy** button, visible price, and the seller-profile **Visit us on Marktplaats** block. Confirm `/products/` still lists those three. Confirm Contact FAQ **How do I buy a card?** matches the new copy.

- [ ] **Step 6: Commit**

```bash
git add app/database/faq.ts test/faq.test.ts
git commit -m "$(cat <<'EOF'
Stop treating email as checkout when a card is not on Marktplaats.

EOF
)"
```
