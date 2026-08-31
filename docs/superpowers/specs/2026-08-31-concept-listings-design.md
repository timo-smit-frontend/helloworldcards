# Concept listings

Date: 2026-08-31

## Problem

Cards can live on the shop before they are listed on Marktplaats. Today that gap still looks buyable: a product without `marktplaatsUrl` gets **Email us about this**. Arceus V, Mega Latias ex, and Zekrom are already in that state. There is no inventory flag for “on the site, not for sale yet”.

Marktplaats has no self-serve API for a free seller account. Browser login automation is not a product feature (no stored credentials, no Worker-side session, no scraping).

## Goal

Shop visitors can see a concept card (photos, copy, price) but cannot buy it. Inventory records that status explicitly. Going live later is adding a Marktplaats listing URL and clearing concept — by hand, not by posting from the site.

Out of scope: Marktplaats API or partner feeds, Playwright/browser posting, a product CMS, changing sold/ledger maths, badges on shop grid cards.

## Listing states

A card is in exactly one of:

| State   | Shop                         | Buy CTA                         | Inventory                         |
| ------- | ---------------------------- | ------------------------------- | --------------------------------- |
| Concept | Visible                      | Disabled, not a link            | `concept: true`, no listing URL   |
| Live    | Visible                      | **View on Marktplaats**         | `marktplaatsUrl` set, no concept  |
| Sold    | Hidden (`sold: true` as now) | —                               | Unchanged                         |

`sold` still wins: a sold card is off the shop even if it has leftover concept or URL fields.

## Data

Keep `Product` public fields as they are. Add inventory-only `concept?: boolean` next to `sold` on `InventoryProduct` / `ProductRecord`.

- Strip `concept` from the public shop bundle, same as `cost` / `sold` / `soldAt` / `acquiredAt`.
- Shop CTA does **not** read `concept`. It reads `marktplaatsUrl`: set → live button; missing → concept button.
- Invariant: `concept: true` means no `marktplaatsUrl`. A listing URL means omit `concept`. Never both.
- `isShopListed` stays sold-only. Concept cards remain in `getAllProducts`.

**This pass:** set `concept: true` on ids 6–8 (Arceus V, Mega Latias ex, Zekrom). They already have no `marktplaatsUrl`. Leave ids 1–5 live.

**Publishing later:** add `marktplaatsUrl`, remove `concept`. Creating a new card that should not be for sale yet: add the record with `concept: true` and no URL.

## Product page CTA

`app/routes/product.tsx` drops the mailto fallback.

- Live: `{ url: product.marktplaatsUrl, title: 'View on Marktplaats', target: '_blank' }` as today (noreferrer, sr-only “opens in a new tab”).
- Concept: no `url`. Title **Not yet available to buy**. Render a disabled control, not an `<a>` and not a mailto.

`BannerCarousel` must render that disabled control. Extend `link` so `title` can exist without `url`: `{ title: string; url?: string; target?: string }`. No `url` → `<button type="button" disabled className="button-green …">`. `url` set → existing `<a>` path.

Disabled look: not clickable, `cursor-not-allowed`, muted (same idea as dashboard/contact `disabled:opacity-60`). Prefer a `[disabled]` rule on `button-green` so the product CTA is not a one-off.

Price still shows on concept pages. The **We sell on Marktplaats** `ContentText` block (seller profile, not the product listing) stays.

`Mailing` only rewrites existing `mailto:` clicks. With no product mailto, it does not need a concept branch.

Shop grid cards stay links to the product page (title, price, photos). No extra “concept” badge.

## Copy

FAQ **How do I buy a card?** must not say to email when there is no listing.

Replace that answer with: browse the shop; **View on Marktplaats** is the buy path; if the button says it is not yet available, the card is on the site but not for sale yet. Email and the contact form stay for questions, not as checkout for concept cards.

Do not rewrite every “listed here and on Marktplaats” line. Concept is a delay before the listing, not a second shop.

## Tests

- Inventory: ids 6–8 have `concept: true`; ids 1–5 do not.
- Public products never include a `concept` field.
- Ids 6–8 have no `marktplaatsUrl`; ids 1–5 keep their current URLs.
- `isShopListed` / sold behaviour unchanged.
- Product route: no mailto when `marktplaatsUrl` is missing.
- BannerCarousel: disabled button with **Not yet available to buy** when `link` has a title and no url; live link unchanged when url is set.

## Non-goals (explicit)

- Do not log into Marktplaats from the app or from a stored session.
- Do not add a dashboard “publish to Marktplaats” action in this pass.
- Do not hide concept cards from `/products` or similar-product rails.
