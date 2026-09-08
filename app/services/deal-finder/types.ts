import type { MarketListing } from '../cardmarket/grades'
import type { ListingCost } from './cost'

export type DealSource = 'marktplaats' | 'vinted'

/** PSA only slabs English and Japanese cards under those two labels; anything else is out of scope. */
export type CardLanguage = 'english' | 'japanese'

export type PsaGrade = 9 | 10

/** One listing as scraped from a source overview, before we know what card it is. */
export type SourceListing = {
  /** `marktplaats:m2438948556` — stable across scans, so it doubles as the cache key. */
  id: string
  source: DealSource
  listingId: string
  title: string
  /** Overview descriptions are cut off around 200 characters; the detail page fills this in. */
  description: string | null
  ask: number
  listingUrl: string
  sellerName: string | null
  /** Marktplaats' own id for the seller, which is what its review endpoint is keyed on. */
  sellerId: string | null
  priceType: string
  imageUrls: string[]
  /** Marktplaats "type" attribute: `Losse kaart` (single) or `Meerdere kaarten` (a lot). */
  itemType: string | null
  /** Postage the listing quotes, read off its own page; Marktplaats never quotes one. */
  shipping: number | null
}

/**
 * A PSA label, row by row. The slab prints:
 *   row 1  `YEAR POKEMON <set/era code> <language>`   … and the card `#number` on the right
 *   row 2  `<card name>` (with variety prefixes like `FA/`, `N'S`, `REV.FOIL`)  … `GEM MT` / `MINT`
 *   row 3  `<set / subset / rarity>`                   … the numeric grade
 *   row 4  the barcode and the 8-9 digit certification number
 */
export type PsaLabel = {
  certNumber: string | null
  year: string | null
  /** Row 1 without the year, e.g. `POKEMON SWSH BSP` or `POKEMON M2a JP`. */
  setLine: string | null
  /** Row 2, the card itself, e.g. `FA/PIKACHU V` or `N'S RESHIRAM`. */
  cardName: string | null
  /** Row 3, e.g. `CLBRTNS.ULTRA-PREM.COLL` or `SPECIAL ART RARE`. */
  varietyLine: string | null
  cardNumber: string | null
  /** `other` means the label names a language we do not buy (IT, DE, FR, …). */
  language: CardLanguage | 'other' | null
  /** The raw language token PSA printed, kept so a rejection can say why. */
  languageLabel: string | null
  grade: number | null
  reverseHolo: boolean
  firstEdition: boolean
}

/** What one photo set told us. More than one slab means the listing is a lot. */
export type SlabReading = {
  slabs: PsaLabel[]
  /** Free-text note from the reader, e.g. "label unreadable through glare". */
  note: string | null
}

export type IdentitySignal = 'title' | 'description' | 'psa-label' | 'psa-cert'

/** Everything we need to find the card on Cardmarket. */
export type CardIdentity = {
  name: string
  cardNumber: string | null
  setName: string | null
  setCode: string | null
  language: CardLanguage
  grade: PsaGrade
  reverseHolo: boolean
  firstEdition: boolean
  certNumber: string | null
  /** Which of title / description / label / cert lookup contributed. */
  signals: IdentitySignal[]
  confidence: 'high' | 'medium'
}

/** Shared shape for every row the dashboard renders, whatever bucket it lands in. */
export type ListingRef = {
  id: string
  source: DealSource
  title: string
  /** The price the site shows. What it actually costs to buy is `cost.total`. */
  ask: number
  cost: ListingCost
  listingUrl: string
  imageUrl: string | null
}

export type DealRow = ListingRef & {
  /** `Charizard ex (PAF 234) EN — PSA 10` */
  displayTitle: string
  card: CardIdentity
  cardmarketUrl: string
  marketFloor: number
  edge: number
  comps: MarketListing[]
  googleUrl: string | null
  query: string | null
}

/** Found the card, but Cardmarket has nothing to price it against. */
export type NoCompsRow = ListingRef & {
  displayTitle: string
  card: CardIdentity
  cardmarketUrl: string | null
  reason: string
  googleUrl: string | null
  query: string | null
}

/** Could not check this listing — shown in the dropdown with what went wrong. */
export type ProblemRow = ListingRef & {
  /** Where it broke: reading the listing, identifying the card, or pricing it. */
  stage: 'listing' | 'identify' | 'match' | 'price'
  reason: string
  detail: string | null
  googleUrl: string | null
  query: string | null
  cardmarketUrl: string | null
}

export type SourceSummary = {
  source: DealSource
  url: string
  found: number
  candidates: number
  error: string | null
  /** How many listings the source says match the search, when it tells us. */
  total: number | null
  /** Set when the scan could not reach the end of the results, saying why not. */
  truncated: string | null
}

export type DealFinderReport = {
  scannedAt: string
  sources: SourceSummary[]
  /** Cardmarket beats what the card costs to buy by at least MIN_EDGE, best edge first. */
  deals: DealRow[]
  /** Identified, but unpriceable — shown under the deals. */
  noComps: NoCompsRow[]
  /** Everything that failed, with the reason. */
  problems: ProblemRow[]
  /** Priced fine but the edge was too small to bother with — hidden, counted only. */
  belowEdge: number
  /** Not a PSA 9/10 single in our price range — never shown. */
  outOfScope: number
  /** Listings answered from the cache rather than re-checked. */
  fromCache: number
  errors: string[]
}
