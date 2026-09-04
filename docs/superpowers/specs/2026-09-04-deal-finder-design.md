# Deal finder

Date: 2026-09-04 · replaces the 2026-09-02 "Marktplaats deals" design

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
2. **The PSA label** — read from the listing photos by Claude
   (`ANTHROPIC_API_KEY` in `.dev.vars`). Rows, as PSA prints them:

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
and both Chinese reprints and Japanese-only products are pushed down for English cards.
Japanese printings are recognised by their lowercase expansion code (`s12a215`,
`m2a230`, `smL032`) where English ones use an uppercase set code (`MEW168`, `SVP176`) —
Cardmarket serves a Japanese product page whatever language filter is asked for, so
matching one for an English card silently prices the wrong printing.

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

## Remembering between scans

`.cache/deal-finder-cache.json` keyed by listing id. A card identity is reused for
30 days (the slab in the photo does not change), a Cardmarket floor for 12 hours and
only at the same ask. Anything that failed is always retried, so a re-scan only does
real work on new listings.

## Routes

| Method | Path                            | Response                               |
| ------ | ------------------------------- | -------------------------------------- |
| GET    | `/dashboard/deal-finder/report` | `{ report: DealFinderReport \| null }` |
| POST   | `/dashboard/deal-finder/scan`   | `{ report }`, or 404 off localhost     |

Admin aliases under `/api/admin/deal-finder/…`.

## Not in scope

PSA 8 / 9.5, BGS and CGC slabs, lots, languages other than English and Japanese,
running the scan on the deployed Worker, buying or messaging sellers.
