# Marktplaats deals (localhost dashboard)

Date: 2026-09-02

## Problem

Price suggestions compares **your** inventory to Cardmarket. There is no tool to spot **buy** opportunities: Marktplaats listings priced below the Cardmarket market for the same graded card.

The seller already watches a fixed Marktplaats search — new Pokémon PSA listings from today, within €200, near postcode 3562LH. Manually opening each ad and checking Cardmarket is slow.

## Goal

A localhost-only dashboard section **Marktplaats deals**, placed directly under **Price suggestions**. On scan:

1. Crawl the Marktplaats search overview (title + ask price + listing URL).
2. Keep only clear single-card **PSA 9** or **PSA 10** listings with a fixed price ≥ €10.
3. Resolve each candidate to a Cardmarket singles product page.
4. Read Cardmarket slab offers with the same parser and floor logic as Price suggestions.
5. Show listings where **Cardmarket floor − Marktplaats ask ≥ €15**.

Out of scope: production deploy, auto-buy, Marktplaats login, persisting deals in D1, notifications, BGS-only ads, PSA 8 / 9.5, lots, inventory-only matching (may come later).

## User decisions (locked)

| Setting | Value |
| --- | --- |
| Deal threshold | Marktplaats ask at least **€15 below** Cardmarket floor |
| Minimum ask | **€10** (skip cheaper listings) |
| Listing filter | **Single-card PSA 9/10 only** — skip lots, holders, “various sets”, Catawiki, “Bieden” |
| Market reference | **Same floor** as Price suggestions (lowest same-grade PSA cluster on Cardmarket) |
| Visibility | **Dashboard, localhost only** (`import.meta.env.DEV` + scan API needs Playwright fetcher) |

## Architecture

```
[Scan] → POST /dashboard/marktplaats-deals/scan
              ↓
       Playwright (reuse Cardmarket Chrome CDP fetcher)
              ↓
    1. GET Marktplaats search page (fixed URL below)
    2. Parse gallery rows → title, ask, listing URL, first image
    3. filterMarktplaatsCandidates()
    4. Fetch first photo → Tesseract OCR of PSA label
    5. Build Google query: `{row1} {row2} {row3} #{n} cardmarket`
    6. Google search → first cardmarket.com Singles link
    7. GET Cardmarket offers page → parseArticleListings()
    8. marketFloorPrice() → floor for matching PSA grade
    9. Keep if floor − ask ≥ 15
              ↓
    .cache/marktplaats-deals-report.json
              ↓
    GET /dashboard/marktplaats-deals/report → dashboard UI
```

**Why Google, not Cardmarket search:** Cardmarket’s own product search is unreliable for graded slabs. The PSA label’s three left rows + top-right `#` (e.g. `2016 POKEMON XY` / `MEWTWO-REV.FOIL` / `EVOLUTIONS` / `#51`) plus `cardmarket` usually put the right Singles page first in Google.
**Marktplaats search URL** (constant):

`https://www.marktplaats.nl/q/pokemon+psa/#offeredSince:Vandaag|PriceCentsTo:20000|sortBy:SORT_INDEX|sortOrder:DECREASING|postcode:3562LH|view:gallery-view`

**Localhost guard:** Mirror Cardmarket scan — `handleDashboardRequest` returns `{ error: '… only available locally.' }` with 404 when `runtime.fetchCardmarketPage` is missing. Reuse that fetcher for both Marktplaats and Cardmarket page loads during the deals scan.

**Report store:** `fileMarktplaatsDealsStore` → `.cache/marktplaats-deals-report.json`, same pattern as `fileCardmarketStore`.

## Marktplaats parsing

### Overview HTML

New `app/services/marktplaats-deals/html.ts`:

- Parse gallery/list rows from the search results page.
- Extract per row: **title**, **numeric ask** (skip “Bieden”), **listing URL** (absolute `marktplaats.nl` link).
- Unit-test against saved HTML fixtures (including fragments from real overview pages).

### Candidate filter

New `app/services/marktplaats-deals/titles.ts` — `filterMarktplaatsCandidates()`:

**Include when all true:**

- Title matches `\bPSA\s+(9|10)\b` (case-insensitive).
- Parsed ask ≥ €10.
- Ask is a fixed price (not auction / “Bieden”).

**Exclude when any true:**

- Lot / multi-card signals: `\d+\s+graded`, `various sets`, `meerdere`, `\bset\b` (when not a set name context — conservative), multiple Pokémon names heuristic optional.
- Accessories: `houder`, `lijstje`, `frame`, `display`.
- Seller/platform: `catawiki` in title or seller chunk.
- No PSA 9/10 in title after normalization.

### Title parse

`parseMarktplaatsTitle(title)` → `{ pokemonName, cardNumber?, grade: 9 | 10 } | null`

- **Grade:** first `PSA 9` or `PSA 10` in title.
- **Card number** (first match wins, optional):
  - Fraction: `\d{1,3}/\d{1,3}` (e.g. `015/113`, `194/182`, `RC5/RC32`).
  - Promo / set code: `\b[A-Z]{2,4}\d{1,4}\b` (e.g. `SM211`, `SIT185`).
  - Hash number: `#\d{1,4}`.
- **Pokémon name:** text before `PSA`, card number, or common suffixes (`Mint`, `Pokémon`, `Kaart`, set names). Trim noise; allow multi-word names (`Mr. Mime`, `Jessie & James` — rare but do not crash).

Return `null` when grade cannot be parsed.

## Cardmarket matching (PSA label → Google)

1. Take the listing’s **first photo** (large Marktplaats image URL from overview JSON).
2. Run **Tesseract** OCR on the image (`ocr.ts` shells out to system `tesseract`).
3. Parse the PSA label (`psa-label.ts`) into:
   - three left rows (e.g. `2016 POKEMON XY`, `MEWTWO-REV.FOIL`, `EVOLUTIONS`)
   - top-right `#` number (e.g. `51`)
   - flags: reverse holo / Japanese when present in the label text
4. Google query: `{row1} {row2} {row3} #{n} cardmarket` via Playwright `fetchPage`.
5. Take the **first** `cardmarket.com/.../Pokemon/Products/Singles/...` link (`google-search.ts`).
6. Open that product’s offers page with language + reverse-holo filters when detected.

If OCR fails, no image, or Google has no Cardmarket link → `skipped` (never guess a deal).

Requires local `tesseract` on PATH (already common via Homebrew).

## Market floor (reuse Price suggestions)

Extract from `app/services/cardmarket/grades.ts`:

```typescript
marketFloorPrice({ grader: 'psa', grade, listings }): { floor: number; basis: MarketListing[] } | null
```

Same rules as `suggestListedPrice`: anchors = same grader + grade; floor = min anchor price; basis includes 15% cluster around floor.

**Deal test:**

```typescript
ask >= 10 && floor - ask >= 15
```

Report **edge** = `floor - ask` (rounded euros for display).

## API & runtime

### Routes (`worker/dashboard-api.ts`)

| Method | Path | Response |
| --- | --- | --- |
| GET | `/dashboard/marktplaats-deals/report` | `{ report: MarktplaatsDealsReport \| null }` |
| POST | `/dashboard/marktplaats-deals/scan` | `{ report: MarktplaatsDealsReport }` or 404 locally |

Admin aliases under `/api/admin/marktplaats-deals/…` same as Cardmarket.

### Types (`app/services/marktplaats-deals/scan.ts`)

```typescript
type MarktplaatsDealRow = {
  title: string
  ask: number
  marktplaatsUrl: string
  cardmarketUrl: string
  grade: 9 | 10
  marketFloor: number
  edge: number
  basis: MarketListing[]
  matchConfidence: 'high' | 'medium'
  psaQuery: string | null
}

type MarktplaatsDealsReport = {
  scannedAt: string
  searchUrl: string
  deals: MarktplaatsDealRow[]
  skipped: { title: string; ask: number | null; reason: string }[]
  errors: string[] // global e.g. Marktplaats blocked
}
```

### Vite middleware (`vite/dashboard-api.ts`)

- Add paths to `isCmsDevPath`.
- On POST scan for marktplaats-deals, attach `fetchCardmarketPage` from Playwright (same as Cardmarket scan).
- Pass `marktplaatsDealsStore: fileMarktplaatsDealsStore(root)` on runtime.

Scan loop: ~1s delay between Cardmarket product fetches to reduce block risk; Marktplaats overview is one fetch.

## Dashboard UI

`app/components/dashboard/DashboardChart.tsx`:

- New section **Marktplaats deals** below **Price suggestions**, same `import.meta.env.DEV && onScanDeals` guard.
- Refresh button → POST scan; spinner while running.
- Empty: “Scan Marktplaats to find underpriced PSA listings.”
- Each deal row:
  - Title (truncated)
  - Ask · Floor · Edge (edge in positive green, e.g. `−€22` meaning you save vs market)
  - Links: Marktplaats listing (new tab), Cardmarket product (new tab)
  - Small note: match confidence + count of basis listings
- Optional collapsed “Skipped (N)” for transparency during tuning — not required for v1 if noisy.

`app/admin/AdminApp.tsx`: load report on mount in dev, wire scan handler parallel to Cardmarket.

## Error handling

| Situation | Behaviour |
| --- | --- |
| Marktplaats challenge / empty results | Global `errors[]`; no deals |
| Unparseable title | `skipped` with reason |
| No Cardmarket match | `skipped` — “No Cardmarket match” |
| Low match confidence | `skipped` — do not guess |
| No PSA {grade} listings on Cardmarket | `skipped` — “No PSA N comps” |
| Cardmarket Cloudflare | `skipped` per row or global if search blocked |
| Ask ≥ floor or edge < €15 | Omit from `deals` (silent — not a deal) |

Never treat a failed match as a deal.

## Tests

Pure unit tests (no Playwright):

- `marktplaats-deals/html.test.ts` — parse overview fixture rows.
- `marktplaats-deals/titles.test.ts` — filter includes/excludes (Vaporeon PSA 9 yes; “3 Graded PSA 10” no; “Bieden” no; holder no).
- `marktplaats-deals/cardmarket-search.test.ts` — parse search HTML, scoring.
- `marktplaats-deals/scan.test.ts` — end-to-end with mocked `fetchPage` returning fixture HTML; assert deals, edges, skips.
- `cardmarket-grades.test.ts` — `marketFloorPrice` matches existing suggestion floor cases.
- `dashboard-api.test.ts` — report GET, scan 404 without fetcher, scan stores report with mocked fetcher.

## Non-goals

- Deploying deals scan to production Worker.
- Cardmarket API / paid data feeds.
- Automatic Marktplaats messaging or purchase.
- PSA cert number lookup.
- Pagination beyond first overview page in v1 (today’s feed ≈ 85 items — one page enough to start).

## Future (not v1)

- Inventory-assisted matching before Cardmarket search.
- PSA 8 / 9.5 / BGS grades.
- Saved search URL in env / dashboard settings.
- Second page of Marktplaats results.
