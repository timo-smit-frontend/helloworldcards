# Deal finder

Date: 2026-09-04 · replaces the 2026-09-02 "Marktplaats deals" design

> Pricing, the top-100 scope and the buckets changed on 2026-10-07: see
> [Deal finder v2](2026-10-07-deal-finder-v2-design.md). Reading the slab, matching
> Cardmarket, its bot check and the scan's speed are still as described here.

## Goal

Find PSA 9 and PSA 10 Pokémon singles on Marktplaats and Vinted that are priced
at least **€15 under the Cardmarket floor** for the same card, same grade and same
language. English and Japanese cards only.

The previous version guessed too often. Its failures were all identification
failures, not pricing ones: Tesseract merged two slabs in one photo into a single
query, `PSA 10` was read as card number `10`, and Dutch/French words for Japanese
(`Japans`, `jap`) were missed so Japanese cards were priced against English comps.

## Pipeline

```
Marktplaats search ─┐
                    ├─► screen ─► listing page ─► read the slab ─► PSA cert lookup
Vinted search ──────┘  (scope)   (description,      (vision)         (optional)
                                  full photos)            │
                                                          ▼
                                                   card identity
                                                          │
                                              Google "… cardmarket"
                                                          │
                                              Cardmarket offers page
                                                          │
                                                 floor − ask = edge
```

## Reading the card

Three signals, in order of authority:

1. **PSA cert lookup** — when a certification number is readable, PSA's public API
   returns the authoritative year, set, subject, card number and grade.
   Free tier, 100 lookups a day, `PSA_API_TOKEN` in `.dev.vars`.
2. **The PSA label** — read from the listing photos by Apple's own text recogniser
   (Vision, the engine behind Live Text), through a small Swift helper
   (`vite/deal-finder-vision.swift`) that the dev server compiles once into
   `.cache/deal-finder-vision/` and keeps running for the length of a scan. It costs
   nothing, needs no API key, reads a photo in under a tenth of a second, and turns a
   photo that is on its side until it finds a label row. Where Swift is missing the
   reader falls back to Tesseract (`vite/deal-finder-ocr.ts`), which is several
   seconds a photo and misreads most slabs. Rows, as PSA prints them:

   | Row | Left                                                                                     | Right                          |
   | --- | ---------------------------------------------------------------------------------------- | ------------------------------ |
   | 1   | year, `POKEMON`, set/era code, language token (`EN`, `JPN.`, `IT`; absent means English) | `#` card number                |
   | 2   | card name, with variety prefixes (`FA/`, `REV.FOIL`, `N'S`)                              | grade word (`GEM MT`, `MINT`)  |
   | 3   | set, subset or rarity                                                                    | numeric grade                  |
   | 4   | barcode                                                                                  | 8–9 digit certification number |

3. **The listing title and description** — parsed after masking the grade, the
   year and any prices, so none of them can be mistaken for a card number.

Where signals disagree about something that changes the price — the grade, the
language — the listing is reported as a problem rather than guessed at.
More than one certification number in the photos means a lot, which cannot be priced.

## Matching Cardmarket

Cardmarket's own search does not find graded singles reliably, so the scan searches
**Google** with the word `cardmarket` in the query, built from the label rows in the
order PSA prints them, then scores the results: the card name must appear in the
product slug, the card number adds to the score, the set the card came from adds more,
Chinese reprints are never taken, and Japanese-only products are pushed down for
English cards. Japanese printings are recognised by their lowercase expansion code
(`s12a215`, `m2a230`, `smL032`), the dash in their promo codes (`S-P229`, `SV-P142`
against the English `SVP176`), a `PCG` number, or an expansion Cardmarket only sells in
Japanese (`Tag-Bolt`, `…-JP`) — Cardmarket serves a Japanese product page whatever
language filter is asked for, so matching one for an English card silently prices the
wrong printing.

When the label's query finds nothing, a plainer one — name, set, number — is tried
before the card is given up on. And the offers page itself is asked which card it is:
Cardmarket prints the card number on it, and a page for another number is reported as
a failed match rather than priced.

## Cardmarket's bot check

It fires on load _and_ on "Show more", where the page drops into a spinner that never
resolves. The fetcher then reloads the page, waits for the check to be cleared in the
Chrome window, and re-expands the offer list from the top — three attempts. A card
still blocked at the end of the run is retried once more after every other listing has
been checked, and only then reported as "Cardmarket bot check blocked this card".
Offers are sorted by price ascending, so the first same-grade PSA row reached while
expanding is the floor.

## Guards on the text-only path

Without a label reader the scan has nothing but the seller's words, and that path has
its own failure modes. Four rules keep it from producing confident nonsense:

- The **card name and number come from the title**, never the description. The
  description may still supply a number it states outright (`168/165`, `#176`, `no.022`),
  but never a loose digit — "gegradeerd als mint 9 door psa" is not card 9.
- A **bare 10 is never a card number**, and bare numbers must be two digits. A real
  card 10 still reads as `#10`, `010` or `10/102`.
- A listing **written in** French, German, Spanish or Italian is that language's card
  even when the title names no language: "Vends Amphinobi GX" is a French Greninja.
  Only unambiguous words count — bare `de` and `it` are ordinary Dutch and English.
- Two named cards joined in a title (`Pikachu V & Wigglytuff GX`) is a lot, whatever
  the seller ticked on the form.

And one guard that applies whatever identified the card: a floor at least **4× the ask
and €200 above it** is treated as a mismatched card and sent to the dropdown with both
numbers, not shown as a spectacular deal. A €190 ask against a €1800 floor is a
different art variant, not a bargain.

## What the dashboard shows

| Bucket                  | Rule                                            |
| ----------------------- | ----------------------------------------------- |
| **Deals**               | `floor − ask ≥ €15`, biggest edge first         |
| _(hidden)_              | Priced, but a smaller edge — counted only       |
| **No Cardmarket price** | Card identified, no PSA comps — under the deals |
| **Could not check**     | A dropdown grouped by what went wrong           |
| _(hidden)_              | Not a PSA 9/10 single in range — counted only   |

## Speed

A scan is one piece of work per listing, all started together. Photo reads are held to
a few at a time; Google and Cardmarket each get a tab of their own in the scan's Chrome
window and answer one request after another, paced per site. So while Cardmarket loads
the offers for one card, Google is already finding the page for the next — where the
scan used to do the two strictly in turn. Each listing writes only to its own outcome,
and the report is assembled in listing order, so the order the work finished in never
shows. A page that loaded without a bot check is not waited on for rows it does not
have, and a tab with a bot check on it is brought to the front, where it can be ticked.

The dev log ends every scan with where its time went: how many listing pages, photo
reads, Google searches and Cardmarket cards it took, and how long each averaged.

## Remembering between scans

`.cache/deal-finder-cache.json` keyed by listing id. A card identity is reused for
30 days (the slab in the photo does not change), a Cardmarket floor for 12 hours and
only at the same ask. Anything that failed is always retried, so a re-scan only does
real work on new listings.

The same file also remembers **cards**, whichever listing they came from: the product
page Google found for a card (a month; a search that found nothing, a week) and its
Cardmarket floor per grade (12 hours). A card two listings show — on one marketplace or
both, today or tomorrow — costs one search and one Cardmarket load, and a second listing
of a card that is still being looked up waits for that answer instead of asking again.

## While a scan runs

The dev server keeps what each running scan has found so far, and the report route
folds it in. The dashboard asks for it every few seconds while a scan runs, so deals
appear as they are priced, with how many listings have been checked; a page opened
mid-scan — or on the phone — sees the scan going. Once done, each marketplace's line
says when it ran, how many listings it read and checked, and how long it took.

## Routes

| Method | Path                            | Response                               |
| ------ | ------------------------------- | -------------------------------------- |
| GET    | `/dashboard/deal-finder/report` | `{ report: DealFinderReport \| null }` |
| POST   | `/dashboard/deal-finder/scan`   | `{ report }`, or 404 off localhost     |

Admin aliases under `/api/admin/deal-finder/…`.

## Not in scope

PSA 8 / 9.5, BGS and CGC slabs, lots, languages other than English and Japanese,
running the scan on the deployed Worker, buying or messaging sellers.
