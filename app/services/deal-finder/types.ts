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
  /**
   * What the seller asks before the site's own buyer fees. Vinted's catalogue prints both
   * figures and `ask` is the one with the fees; this is the one another seller's listing
   * competes with. Absent where the site shows only one price — then it is `ask`.
   */
  sellerAsk?: number | null
  /** Marktplaats "type" attribute: `Losse kaart` (single) or `Meerdere kaarten` (a lot). */
  itemType: string | null
  /** Postage the listing quotes, read off its own page; Marktplaats never quotes one. */
  shipping: number | null
  /**
   * When the listing went up, as the overview prints it — Marktplaats says `Vandaag`,
   * `Gisteren`, `Eergisteren` or a date such as `5 sep 26`. Vinted does not say.
   */
  listedOn: string | null
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
type ListingRef = {
  id: string
  source: DealSource
  title: string
  /** The price the site shows. What it actually costs to buy is `cost.total`. */
  ask: number
  cost: ListingCost
  listingUrl: string
  imageUrl: string | null
}

/** Where a competing listing was found. */
export type CompSource = 'cardmarket' | 'marktplaats' | 'vinted' | 'ebay'

/**
 * Someone else selling the same card, in the same grade and language — the competition a
 * card bought here would be sold against.
 */
export type Comp = {
  /** `marktplaats:m123`, `vinted:456`, `ebay:v1|…`, `cardmarket:<article id>`. */
  id: string
  source: CompSource
  /**
   * What a buyer weighs it at: the seller's ask, before any fee the site charges the buyer
   * on top. For eBay it includes the postage to the Netherlands, which from abroad is
   * real money a Dutch buyer pays and a Dutch seller does not ask for.
   */
  price: number
  /** Postage counted in `price`, when there is any. */
  shipping: number | null
  title: string
  url: string | null
  seller: string | null
  /** Where the seller is, when the site says (`DE`, `FR`, …). */
  country: string | null
  /** When it was seen. Live sources are read during the scan; Vinted's are remembered from earlier scans. */
  seenAt: string
}

/** One of your own sales of a card. */
export type OwnSale = {
  title: string
  price: number
  soldAt: string
  /** From buying to selling, when both dates are on the books. */
  daysToSell: number | null
  via: 'marktplaats' | 'vinted' | null
}

/** What your own shop knows about a card. */
export type OwnHistory = {
  /** This very card — same Cardmarket product, or the same character, number, grade and language — sold before. */
  sold: OwnSale[]
  /** This very card, still in your stock, at the price you ask. */
  inStock: Array<{ title: string; price: number }>
  /** How long cards of this character took to sell, median days, and over how many sales. */
  characterDaysToSell: number | null
  characterSales: number
}

/** One source's share in a valuation: what it had, or why it had nothing. */
export type SourceTally = {
  source: CompSource
  count: number
  lowest: number | null
  /** Why the source contributed nothing, when it did not — "page not found", "not configured". */
  note: string | null
}

/**
 * What the card can be sold for, worked out from everyone else who sells it.
 *
 * The expected sale is the cheapest believable competitor across every source: a card
 * bought here has to be sold against all of them, and the buyer it is waiting for looks
 * at the cheapest first.
 */
export type Valuation = {
  expectedSale: number | null
  /** The competitor that set it. */
  basis: Comp | null
  /** Every believable competitor, cheapest first. */
  comps: Comp[]
  /** Set aside as too cheap to be the same thing — a raw card, a wrong grade, a scam. */
  outliers: Comp[]
  perSource: SourceTally[]
  own: OwnHistory
  /** `strong`: two or more sources agree. `fair`: one source, several sellers. `thin`: a single seller. */
  confidence: 'strong' | 'fair' | 'thin' | 'none'
  /** Where the number came from, in one line. */
  summary: string
}

export type DealRow = ListingRef & {
  /** `Charizard ex (PAF 234) EN, PSA 10` */
  displayTitle: string
  card: CardIdentity
  cardmarketUrl: string | null
  valuation: Valuation
  /** What it sells for less what it costs to buy. */
  edge: number
  /** eBay's sold listings for the card, to check by hand: eBay keeps them behind a login. */
  soldSearchUrl: string
  googleUrl: string | null
  query: string | null
}

/** Found the card, but nobody else is selling it to price it against. */
export type NoCompsRow = ListingRef & {
  displayTitle: string
  card: CardIdentity
  cardmarketUrl: string | null
  reason: string
  valuation: Valuation
  soldSearchUrl: string
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
  /**
   * When this source was last walked.
   *
   * Marktplaats and Vinted are scanned on their own, so a report almost always holds
   * one source that was just read and another that was read hours ago. The report's own
   * `scannedAt` is only the more recent of the two.
   */
  scannedAt: string
  found: number
  candidates: number
  error: string | null
  /** How many listings the source says match the search, when it tells us. */
  total: number | null
  /** What went wrong part-way through this source's walk, e.g. a page that would not load. */
  notes: string[]
  /** Priced fine but the edge was too small to bother with. */
  belowEdge: number
  /** Not a PSA 9/10 single of a top-100 character in our price range. */
  outOfScope: number
  /** Answered from the cache rather than re-checked. */
  fromCache: number
  /** How long the run that read this source took. Missing on reports written before it was kept. */
  durationMs?: number
}

export type DealFinderReport = {
  /** The most recent of the per-source scans this report is made of. */
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
  /** Whole-scan problems that belong to no single source. */
  errors: string[]
}

/** A scan still going, as far as it has got — what the dashboard shows while it waits. */
export type LiveDealScan = {
  sources: DealSource[]
  /** Listings worked through so far. */
  checked: number
  /** Listings past the search pages; null while those are still being read. */
  total: number | null
  startedAt: string
}
