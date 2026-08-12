# ContentProducts + products database

## Goal

Add a products data file, a reusable `ContentProducts` flex block (Pokemon-style optional IDs), a `/products` listing page, and full stub detail pages at `/products/:slug`. Filters come later.

## Decisions

- **Data approach:** Flat typed list in `app/database/products.ts` with thin helpers beside the data.
- **Selection API:** Optional `id` prop — omit → all products; one or many IDs → those products only (ID order preserved). Same idea as `Pokemon` (`id` optional).
- **URLs:** `/products` for the catalog; `/products/:slug` for detail (slug on each product).
- **Product fields:** `id`, `slug`, `title`, `description`, `image`, `imageHover`; optional `price`, `category` (for later filters).
- **Detail page:** Full stub — title, description, both images, optional price/category; unknown slug → not-found + link back to `/products`.
- **Links:** Use `react-router` `Link` to `/products/:slug`. Card shows title as link text; hover swaps default image → `imageHover`.
- **All props optional** on `ContentProducts` (title, description, id), matching `ContentText` / `BannerImage`.

## Files

| Path | Role |
|------|------|
| `app/database/products.ts` | Product type, seed data, `getAllProducts`, `getProductsByIds`, `getProductBySlug` |
| `app/components/flex/content/ContentProducts.tsx` | Flex section: optional title/description + product grid |
| `app/routes/products.tsx` | Listing page — `ContentProducts` with no `id` |
| `app/routes/product.tsx` | Detail stub by slug (`/products/:slug`) |
| `app/main.tsx` | Register `/products` and `/products/:slug` |
| `app/routes/home.tsx` | Example highlight: `ContentProducts` with three IDs |

## Product type

```ts
type Product = {
  id: string | number
  slug: string
  title: string
  description: string
  image: string
  imageHover: string
  price?: string | number
  category?: string
}
```

## ContentProducts API

```tsx
<ContentProducts
  title="Featured cards"
  description="A few picks from the shop."
  id={[1, 2, 3]}
/>

<ContentProducts title="All products" description="Browse the full catalog." />
```

Props (all optional):

- `title?: string`
- `description?: string`
- `id?: string | number | Array<string | number>`

## Behavior

- Resolve products via database helpers; unknown IDs skipped silently.
- Empty product list → render nothing for the grid (title/description still show if provided).
- Section structure mirrors `ContentText`: `section` + `container-full` + `Animated` where appropriate.
- Responsive product grid; each card is linked to detail via slug.
- Seed a small readable set of placeholder products in the database file.

## Routes

- `GET /products` → listing (`ContentProducts`, no `id`)
- `GET /products/:slug` → detail stub from `getProductBySlug(slug)`

## Out of scope

- Product filters / search UI on `/products`
- Header/nav link to Products
- Real commerce (cart, checkout, inventory)
- CMS or remote API — local typed file only for now
