# Deal finder v2

Date: 2026-10-07 · builds on the [2026-09-04 deal finder](2026-09-04-deal-finder-design.md),
which still describes reading the slab, matching Cardmarket, its bot check and the scan's speed

## Goal

Judge a listing by everything the shop can know about its card, not by the Cardmarket
floor alone, and spend that effort only on the characters that sell. No AI anywhere:
the PSA cert API, Apple Vision, fixed rules and free APIs do the work.

## Scope: the top 100

`popular.ts` holds the hundred Pokémon the deal finder looks at, most popular first, plus
a dozen popular trainers. Ranks 1–25 are GemRate's count of PSA slabs per Pokémon
(January 2026); the rest is a judgement, meant to be edited.

| Where          | Rule                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Search page    | A title naming only Pokémon off the list (`pokemon-names.ts` has all 1025) is dropped before any page is opened.                       |
| Search page    | A title naming no Pokémon at all goes on: the slab decides.                                                                            |
| After the slab | The card's own name must be a top character. A name Vision ran together (`FAMEWTWOEX`) is put back together.                           |
| After the slab | A name that is a scrap naming no Pokémon, with no PSA cert to correct it, takes the title's name when the title names a top character. |

The candidate search itself is unchanged: today's Marktplaats listings and the newest
Vinted pages.

## Identifying without AI

The PSA cert lookup was in the code all along but never ran: there was no
`PSA_API_TOKEN`. Vision reads a cert number on most slabs (106 of 125 in the 5 October
scan), and PSA's record of it is authoritative. Each cert is looked up once and kept
(`certs` in the cache); the scan stops at 90 lookups a day, under the free tier's 100,
and after three failures in one scan.

## Pricing against everyone

Every card is priced against all of its competition. Each source gives "comps": other
sellers' asks for the same card, grade and language.

| Source      | How                                                                                                                                                   | Price used                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Cardmarket  | The offers page, as before; every same-grade PSA offer in the floor's cluster                                                                         | The seller's price                     |
| Marktplaats | One search per card through the JSON search API — character and number plus `psa`, any age, from €5                                                   | The ask                                |
| Vinted      | **No requests.** Every row of every search page the scans read goes into a SQLite memory (`.cache/deal-finder-memory.sqlite`); the last 30 days count | The seller's ask, before Vinted's fees |
| eBay EU     | The Browse API on ebay.de/.fr/.it/.es/.nl, graded single cards at a fixed price, sellers inside the EU only                                           | Price plus postage to NL               |
| Your shop   | Earlier sales of the same card (same Cardmarket product, or same character, number, grade, language), stock you hold, days to sell per character      | Shown, not priced against              |

A competing listing has to state its character, card number, PSA grade and language to
count (`isSameCard`). A listing that leaves its number out could be any of the
character's cards, and pricing against the wrong one is worse than nothing. On eBay only
a language named outright counts, because a German seller of an English card writes
"Karte". The listing itself and the shop's own ads are never competition.

Marktplaats and eBay searches are remembered per card for 12 hours (`comps` in the
cache), keyed on exactly the facts the matching uses.

## The verdict

**Expected sale** is the cheapest believable competitor across all sources. Believable
means it is not under half the median ask, once there are three asks to take a median
of; anything below that is shown as an outlier, not priced against.

| Bucket                 | Rule                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| **Deals**              | `expected sale − cost ≥ €15`, biggest edge first                             |
| _(hidden)_             | Priced, smaller edge — counted only                                          |
| **Nothing to compare** | Identified, but nobody anywhere sells it                                     |
| **Could not check**    | Unreadable, or Cardmarket's problem when no other source had anything either |
| _(hidden)_             | Out of scope, now including cards off the top list — counted only            |

A card Cardmarket has no page for, no PSA offers on, or that a bot check blocked is
still priced against the other sites. Only when nobody sells it anywhere does
Cardmarket's own verdict stand.

**Confidence** is `strong` when two or more sites have the card, `fair` when one site
has several sellers, and `thin` when there is a single seller.

Every row says where its price came from in one line ("Cardmarket from €95 (4) ·
Marktplaats from €89 · eBay EU from €98 · you sold one for €100 in 5 days"). It also
links eBay's sold listings, which eBay only shows to a logged-in buyer, to check by hand.

## Configuration

| `.dev.vars`                            | Without it                                |
| -------------------------------------- | ----------------------------------------- |
| `PSA_API_TOKEN`                        | Slabs are identified from the photo alone |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | eBay is left out of the comparison        |

The scan says above the deals which of the two is missing.

## Not in scope

eBay sold prices by machine (they are behind a login, and scraping them is against
eBay's terms), Catawiki, US price guides, and searching Vinted for a card.
