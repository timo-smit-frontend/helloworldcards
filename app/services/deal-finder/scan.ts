import { isCardmarketChallenge, type FetchCardmarketPage } from '../cardmarket/scan'
import {
  cardmarketProductNumber,
  cardmarketVersionsUrl,
  CardmarketBlockedError,
  floorKey,
  isVersionedProduct,
  numbersDisagree,
  OFFERS_FETCH_OPTIONS,
  offersUrlFor,
  priceFromOffers,
  sameCardVersions,
  type MarketPrice,
  type Unpriced
} from './cardmarket'
import {
  hasFreshFloor,
  hasFreshIdentity,
  hasFreshMatch,
  hasFreshPrice,
  hasSettledVerdict,
  pruneCache,
  usableCache,
  type CacheEntry,
  type DealFinderCache,
  type ProductMatch
} from './cache'
import {
  DEAL_SOURCES,
  FETCH_DELAY_MS,
  IDENTIFY_CONCURRENCY,
  IMPLAUSIBLE_FLOOR_GAP,
  IMPLAUSIBLE_FLOOR_RATIO,
  LISTING_DELAY_MS,
  MARKTPLAATS_MAX_PAGES,
  MARKTPLAATS_SEARCH_URL,
  MAX_OTHER_VERSIONS,
  MAX_PHOTOS_PER_LISTING,
  MIN_EDGE,
  VINTED_MAX_PAGES,
  VINTED_SEARCH_URL
} from './constants'
import { listingCost } from './cost'
import { ownListingIds, screenListing, type OwnListingIds, type Screening } from './filters'
import {
  buildFallbackQuery,
  buildSearchQuery,
  cardmarketProductName,
  cleanCardmarketUrl,
  googleSearchUrl,
  productKey,
  rankCardmarketCandidates,
  scoreCardmarketUrl
} from './google'
import { displayTitle, identifyCard } from './identify'
import {
  isMarktplaatsChallenge,
  isWithinOfferedSince,
  marktplaatsOfferedSince,
  marktplaatsResultCount,
  marktplaatsSearchPageUrl,
  parseMarktplaatsDetail,
  parseMarktplaatsOverview
} from './marktplaats'
import { emptyReport, sortDeals, sortNoComps, withTotals } from './report'
import { unwantedGradeReason } from './text'
import { isVintedChallenge, parseVintedDetail, parseVintedOverview, vintedSearchPageUrl } from './vinted'
import type {
  CardIdentity,
  DealFinderReport,
  DealRow,
  DealSource,
  NoCompsRow,
  ProblemRow,
  PsaLabel,
  SlabReading,
  SourceListing,
  SourceSummary
} from './types'

export type { DealFinderCache } from './cache'
export * from './types'

/** Reads every PSA label it can find across a listing's photos, locally with OCR. */
export type SlabReader = (input: { listing: SourceListing; imageUrls: string[] }) => Promise<SlabReading>

/** Resolves a certification number against PSA's own records. */
export type CertLookup = (certNumber: string) => Promise<PsaLabel | null>

/** Follows a redirect and reports where it landed, or null when it went nowhere. */
export type ResolveUrl = (url: string) => Promise<string | null>

/** How many reviews a Marktplaats seller has, or null when it could not be found out. */
export type SellerReviews = (sellerId: string) => Promise<number | null>

type Candidate = {
  listing: SourceListing
  entry: CacheEntry | undefined
}

/** Everything a listing produced once identified and priced — before it is bucketed. */
type Evaluated = {
  listing: SourceListing
  identity: CardIdentity
  label: PsaLabel | null
  query: string
  googleUrl: string
  cardmarketUrl: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Run `task` over every item, never more than `limit` of them at a time, in order. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (let index = next++; index < items.length; index = next++) {
      results[index] = await task(items[index]!, index)
    }
  })

  await Promise.all(workers)
  return results
}

/** Holds a request back until the site it is aimed at has had its pause. */
export type Pacer = <T>(url: string, delayMs: number, run: () => Promise<T>) => Promise<T>

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/**
 * Space requests to one site apart without holding up requests to any other.
 *
 * The scan used to pause a second between listings whatever it was about to do next,
 * so the pause meant to keep Google and Cardmarket comfortable was spent in front of
 * work neither of them could see — reading a photo, or opening a listing page on a
 * third site. Each request now queues behind the site it is actually aimed at and
 * waits only for that one, which is both the same courtesy as before and, for a scan
 * that spends most of its time somewhere else entirely, most of the waiting gone.
 */
export function createPacer(): Pacer {
  const queues = new Map<string, Promise<unknown>>()

  return <T>(url: string, delayMs: number, run: () => Promise<T>): Promise<T> => {
    const host = hostOf(url)
    const previous = queues.get(host)
    const slot = previous ? previous.then(() => sleep(delayMs)).then(run) : run()
    // A failed request still has to hold its place in the queue, not break it.
    queues.set(
      host,
      slot.then(
        () => undefined,
        () => undefined
      )
    )
    return slot
  }
}

function listingRef(listing: SourceListing) {
  return {
    id: listing.id,
    source: listing.source,
    title: listing.title,
    ask: listing.ask,
    cost: listingCost(listing),
    listingUrl: listing.listingUrl,
    imageUrl: listing.imageUrls[0] ?? null
  }
}

/** Prefer the name Cardmarket itself uses — it is the name you will search for again. */
function rowTitle(identity: CardIdentity, cardmarketUrl: string | null): string {
  const fromUrl = cardmarketUrl ? cardmarketProductName(cardmarketUrl) : null
  return displayTitle(fromUrl ? { ...identity, name: fromUrl } : identity)
}

/** How a source's search URL is paged, and how deep the scan follows it. */
const PAGING = {
  marktplaats: { pageUrl: marktplaatsSearchPageUrl, maxPages: MARKTPLAATS_MAX_PAGES },
  vinted: { pageUrl: vintedSearchPageUrl, maxPages: VINTED_MAX_PAGES }
} as const

/** Everything one source's walk produced, kept apart so both can be walked at once. */
type Collected = {
  summary: SourceSummary
  listings: SourceListing[]
  problems: ProblemRow[]
}

/**
 * Walk a source's search results page by page, screening every listing as it goes.
 *
 * The first page is the one that has to work: if it will not load, or comes back as a
 * bot check, the source has failed. A later page that breaks only ends the walk — what
 * the earlier pages already gave us is still worth checking, so it is reported as a
 * note rather than thrown away.
 *
 * Nothing is written to the report from here. The two sources are walked at the same
 * time, and a report that came out in whichever order the two feeds happened to answer
 * would make two runs of the same scan look like different scans.
 */
async function collectSource({
  source,
  url,
  fetchPage,
  ids,
  delayMs,
  pace,
  sellerReviews,
  maxPages,
  scannedAt
}: {
  source: DealSource
  url: string
  fetchPage: FetchCardmarketPage
  ids: OwnListingIds
  delayMs: number
  pace: Pacer
  sellerReviews?: SellerReviews
  maxPages: number
  scannedAt: string
}): Promise<Collected> {
  const { pageUrl } = PAGING[source]
  // Marktplaats does not apply the browse URL's date window itself, so the scan does.
  const offeredSince = source === 'marktplaats' ? marktplaatsOfferedSince(url) : null
  const seen = new Set<string>()
  const listings: SourceListing[] = []
  const problems: ProblemRow[] = []
  const notes: string[] = []
  let found = 0
  let outOfScope = 0
  let total: number | null = null
  // Sellers put up several listings at once, so their review count is asked for once.
  const reviewCounts = new Map<string, number | null>()

  const failed = (error: string): Collected => ({
    summary: {
      source,
      url,
      scannedAt,
      found: 0,
      candidates: 0,
      error,
      total,
      notes: [],
      belowEdge: 0,
      outOfScope: 0,
      fromCache: 0
    },
    listings: [],
    problems: []
  })

  for (let page = 1; page <= maxPages; page += 1) {
    let html: string
    try {
      const target = pageUrl(url, page)
      html = await pace(target, delayMs, () => fetchPage(target))
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Could not load the search page.'
      if (page === 1) {
        return failed(reason)
      }
      notes.push(`${label(source)} page ${page} would not load, stopped after page ${page - 1}.`)
      break
    }

    const blocked = source === 'marktplaats' ? isMarktplaatsChallenge(html) : isVintedChallenge(html)
    if (blocked) {
      if (page === 1) {
        return failed(`${label(source)} showed a bot check instead of results.`)
      }
      notes.push(`${label(source)} showed a bot check on page ${page}, stopped after page ${page - 1}.`)
      break
    }

    if (source === 'marktplaats') {
      total ??= marktplaatsResultCount(html, offeredSince)
    }

    const parsed = source === 'marktplaats' ? parseMarktplaatsOverview(html) : parseVintedOverview(html)
    // Past the last page both sites answer with the previous page's rows rather than an
    // empty one, so "nothing new here" is what marks the end of the results.
    const unseen = parsed.filter((listing) => !seen.has(listing.id))
    if (unseen.length === 0) {
      if (page === 1) {
        return failed(`No ${label(source)} listings on the search page.`)
      }
      break
    }
    for (const listing of unseen) {
      seen.add(listing.id)
    }

    // Newest first, so a page without a single listing from inside the window means the
    // window has been read through — the pages behind it are older still. Reading them
    // was what made a scan of "today" take as long as a scan of the whole month: every
    // row it turned up cost a listing page, its photos, a Google search and a Cardmarket
    // load before being priced, and the date window was the one filter never applied.
    const fresh = unseen.filter((listing) => isWithinOfferedSince(listing.listedOn, offeredSince))
    if (fresh.length === 0) {
      break
    }

    found += fresh.length

    const screened = fresh.map((listing) => ({ listing, screening: screenListing(listing, ids) }))
    await loadSellerReviews(screened, sellerReviews, reviewCounts)

    for (const { listing, screening } of screened) {
      const verdict = withSellerStanding(listing, screening, reviewCounts)
      if (verdict.keep) {
        listings.push(listing)
        continue
      }

      if (verdict.scope === 'problem') {
        problems.push({
          ...listingRef(listing),
          stage: 'listing',
          reason: verdict.reason,
          detail: null,
          googleUrl: null,
          query: null,
          cardmarketUrl: null
        })
        continue
      }

      outOfScope += 1
    }

    // Marktplaats says how many listings the search has, so once they have all been
    // read there is no next page worth asking for. A date window's count is only a
    // guide — see `marktplaatsResultCount` — so the walk is not ended on it.
    if (offeredSince == null && total != null && found >= total) {
      break
    }
  }

  return {
    summary: {
      source,
      url,
      scannedAt,
      found,
      candidates: listings.length,
      error: null,
      total,
      notes,
      belowEdge: 0,
      outOfScope,
      fromCache: 0
    },
    listings,
    problems
  }
}

/** How many sellers are asked about at once — a small JSON endpoint, not a page load. */
const SELLER_REVIEW_CONCURRENCY = 5

/**
 * Look up the review count of every seller a page's survivors belong to.
 *
 * These used to be asked for one at a time in the middle of screening, which put a
 * whole request between one listing and the next for something the cheap rules had
 * already decided they wanted. A page's worth is asked for together instead, and only
 * for the sellers whose listings got that far. A lookup that fails is not held against
 * a seller.
 */
async function loadSellerReviews(
  screened: Array<{ listing: SourceListing; screening: Screening }>,
  sellerReviews: SellerReviews | undefined,
  counts: Map<string, number | null>
): Promise<void> {
  if (!sellerReviews) {
    return
  }

  const wanted = new Set(
    screened
      .filter(({ listing, screening }) => screening.keep && listing.source === 'marktplaats' && listing.sellerId)
      .map(({ listing }) => listing.sellerId!)
      .filter((sellerId) => !counts.has(sellerId))
  )

  await mapWithConcurrency([...wanted], SELLER_REVIEW_CONCURRENCY, async (sellerId) => {
    counts.set(sellerId, await sellerReviews(sellerId).catch(() => null))
  })
}

/**
 * A listing that passed every other rule, judged on its seller's standing.
 *
 * An unreviewed Marktplaats seller is not a risk worth taking at any price, so the
 * listing is dropped before its photos are ever read — the review count is the last
 * check rather than the first only because it costs a request and the cheap rules
 * usually settle it. Vinted sellers get the same verdict, but only once their item
 * page has been read — see `loadListingDetail`.
 */
function withSellerStanding(listing: SourceListing, screening: Screening, counts: Map<string, number | null>): Screening {
  if (!screening.keep || listing.source !== 'marktplaats' || !listing.sellerId) {
    return screening
  }
  return counts.get(listing.sellerId) === 0 ? { keep: false, scope: 'out-of-scope', reason: 'Seller has no reviews' } : screening
}

function label(source: 'marktplaats' | 'vinted'): string {
  return source === 'marktplaats' ? 'Marktplaats' : 'Vinted'
}

/**
 * How many of Google's redirects to follow before giving up on a card. Google orders
 * its results well, so the first one that scores is almost always the first one tried.
 */
const MAX_REDIRECTS_FOLLOWED = 3

/**
 * The Cardmarket product page behind a Google results page, or null when there is none.
 *
 * Google no longer prints result URLs anywhere in the page — every result is an opaque
 * `/goto?url=` redirect — so a result's title is ranked first and only the winner is
 * actually followed. Where the redirect lands is then scored again as a real URL,
 * because the title is a description of the page and the URL is the page itself.
 */
async function followToCardmarket({
  html,
  identity,
  resolveUrl,
  delayMs,
  pace
}: {
  html: string
  identity: CardIdentity
  resolveUrl: ResolveUrl | undefined
  delayMs: number
  pace: Pacer
}): Promise<string | null> {
  let followed = 0

  for (const candidate of rankCardmarketCandidates(html, identity)) {
    if (!candidate.redirect) {
      return candidate.url
    }
    if (!resolveUrl || followed >= MAX_REDIRECTS_FOLLOWED) {
      break
    }

    followed += 1
    const landed = await pace(candidate.url, delayMs, () => resolveUrl(candidate.url))
    const score = landed ? scoreCardmarketUrl(landed, identity) : null
    if (landed && score != null && score >= 0) {
      return cleanCardmarketUrl(landed)
    }
  }

  return null
}

/**
 * Overview rows carry a clipped description and one small photo; the listing page has
 * both in full. A Vinted page also carries the seller's review count, which the
 * catalogue does not — the overview knows nothing about the seller at all — so it is
 * the first place the scan can tell an unreviewed Vinted seller apart. Marktplaats
 * sellers were already judged on the overview, through their own review endpoint.
 * It is also the only place a Vinted item says it has been sold or reserved.
 */
async function loadListingDetail(
  listing: SourceListing,
  fetchPage: FetchCardmarketPage,
  pace: Pacer,
  delayMs: number
): Promise<{ listing: SourceListing; sellerReviews: number | null; availability: 'sold' | 'reserved' | null }> {
  try {
    const html = await pace(listing.listingUrl, delayMs, () => fetchPage(listing.listingUrl))
    const detail =
      listing.source === 'marktplaats'
        ? { ...parseMarktplaatsDetail(html), sellerReviews: null, availability: null }
        : parseVintedDetail(html)
    const description =
      detail.description && detail.description.length > (listing.description?.length ?? 0) ? detail.description : listing.description
    return {
      listing: {
        ...listing,
        description,
        imageUrls: detail.imageUrls.length > 0 ? detail.imageUrls : listing.imageUrls,
        shipping: detail.shipping ?? listing.shipping
      },
      sellerReviews: detail.sellerReviews,
      availability: detail.availability
    }
  } catch {
    // A listing page that will not load is not fatal — the overview row still has a title.
    return { listing, sellerReviews: null, availability: null }
  }
}

/** How far a scan has got, handed out while it runs so the dashboard can show it. */
export type ScanProgress = {
  /** Everything found so far, as the finished report would show it. */
  report: DealFinderReport
  /** Listings worked through, of `total` that made it past the search pages. */
  checked: number
  total: number
}

export async function runDealFinderScan({
  fetchPage,
  readSlabs,
  lookupCert,
  resolveUrl,
  sellerReviews,
  cache: previousCache,
  ownListings = [],
  sources = DEAL_SOURCES,
  marktplaatsUrl = MARKTPLAATS_SEARCH_URL,
  vintedUrl = VINTED_SEARCH_URL,
  maxPages,
  now = new Date(),
  delayMs = FETCH_DELAY_MS,
  pace = createPacer(),
  onProgress
}: {
  fetchPage: FetchCardmarketPage
  readSlabs?: SlabReader
  lookupCert?: CertLookup
  /** Follows Google's result redirects; without it a Google page yields no Cardmarket page. */
  resolveUrl?: ResolveUrl
  /** Looks up a Marktplaats seller's review count, so unreviewed sellers can be skipped. */
  sellerReviews?: SellerReviews
  cache?: DealFinderCache | null
  ownListings?: Array<{ marktplaatsUrl?: string | null; vintedUrl?: string | null }>
  /** Which marketplaces to walk. Each can be run on its own; both by default. */
  sources?: readonly DealSource[]
  marktplaatsUrl?: string
  vintedUrl?: string
  /** How many pages to read per source; the defaults are in `constants.ts`. */
  maxPages?: Partial<Record<DealSource, number>>
  now?: Date
  delayMs?: number
  /**
   * Spaces this run's requests out per site. Two runs going at once — Marktplaats and
   * Vinted each started from their own button — should share one, or Google and
   * Cardmarket see both runs' requests with only one run's pauses between them.
   */
  pace?: Pacer
  /** Told after every listing, so what has been found can be shown before the scan ends. */
  onProgress?: (progress: ScanProgress) => void
}): Promise<{ report: DealFinderReport; cache: DealFinderCache }> {
  const started = Date.now()
  const report = emptyReport(now.toISOString())
  const cache: DealFinderCache = usableCache(previousCache)
  const ids = ownListingIds(ownListings)
  // A listing page is paced far more lightly than a search or a Cardmarket load, but a
  // caller that asked for no pauses at all — a test — still gets none.
  const listingDelayMs = Math.min(delayMs, LISTING_DELAY_MS)
  const timings = createTimings()

  const searchUrls: Record<DealSource, string> = { marktplaats: marktplaatsUrl, vinted: vintedUrl }
  const walking = DEAL_SOURCES.filter((source) => sources.includes(source))

  // Marktplaats and Vinted are different sites with nothing to say to each other, so
  // neither has any reason to wait for the other's search to finish — and either can be
  // asked for on its own, which is what keeps one marketplace's bot check from costing
  // you the other's results.
  const collected = await Promise.all(
    walking.map((source) =>
      collectSource({
        source,
        url: searchUrls[source],
        fetchPage,
        ids,
        delayMs,
        pace,
        sellerReviews,
        maxPages: maxPages?.[source] ?? PAGING[source].maxPages,
        scannedAt: report.scannedAt
      })
    )
  )

  const listings: SourceListing[] = []
  for (const source of collected) {
    report.sources.push(source.summary)
    report.problems.push(...source.problems)
    listings.push(...source.listings)
  }

  if (!readSlabs) {
    // Without the label reader we are back to guessing from the seller's words alone,
    // which is exactly what used to go wrong — so say so rather than quietly degrading.
    report.errors.push('No PSA label reader configured, so the scan is going on the listing text alone.')
  }

  const candidates: Candidate[] = listings.map((listing) => ({ listing, entry: cache.entries[listing.id] }))
  console.info(
    `[deal-finder] ${walking.join(' + ')}: ${candidates.length} listings to check (${withTotals(report).outOfScope} out of scope)`
  )

  const run: Run = {
    fetchPage,
    resolveUrl,
    cache,
    now,
    delayMs,
    pace,
    timings,
    matching: new Map(),
    pricing: new Map()
  }

  /**
   * Every listing is its own piece of work, started at once and left to get as far as
   * it can. Nothing here needs to hold them in line: the photo reads are limited to a
   * few at a time, and Google and Cardmarket each answer one request after another in
   * their own tab, in the order they were asked. What that buys is overlap — while
   * Cardmarket loads the offers for one card, Google is already finding the page for the
   * next, where the scan used to do the two strictly one after the other.
   *
   * Each listing writes only to its own outcome. The report is put together from those
   * in listing order, so two runs of the same scan read the same however the work fell.
   */
  const outcomes = candidates.map(() => emptyOutcome())
  const parked: Array<{ index: number; evaluated: Evaluated }> = []
  const identifying = createLimiter(IDENTIFY_CONCURRENCY)
  let checked = 0

  const progress = () => {
    onProgress?.({ report: assemble(report, candidates, outcomes), checked, total: candidates.length })
  }
  progress()

  await Promise.all(
    candidates.map(async (candidate, index) => {
      const out = outcomes[index]!
      try {
        const prepared = await identifying(() =>
          identifyCandidate({ candidate, fetchPage, readSlabs, lookupCert, now, pace, listingDelayMs, timings })
        ).catch((error: unknown): Prepared => ({ step: 'failed', listing: candidate.listing, error }))
        await evaluatePrepared({ prepared, run, out, park: (evaluated) => parked.push({ index, evaluated }) })
      } catch (error) {
        out.problems.push({
          ...listingRef(candidate.listing),
          stage: 'price',
          reason: 'Checking this listing failed',
          detail: error instanceof Error ? error.message : String(error),
          googleUrl: null,
          query: null,
          cardmarketUrl: null
        })
      }
      checked += 1
      progress()
    })
  )

  // Cardmarket's bot check needs a human; retry those listings once the run is over,
  // by which time the challenge in the Chrome window has usually been cleared.
  for (const { index, evaluated } of parked.sort((left, right) => left.index - right.index)) {
    await priceEvaluated({ evaluated, run, out: outcomes[index]!, park: null })
    progress()
  }

  const durationMs = Date.now() - started
  const scanned = assemble(report, candidates, outcomes)
  for (const summary of scanned.sources) {
    summary.durationMs = durationMs
  }
  console.info(
    `[deal-finder] ${walking.join(' + ')}: ${scanned.deals.length} deals, ${scanned.noComps.length} without comps, ${scanned.belowEdge} below €${MIN_EDGE}, ${scanned.problems.length} problems, ${scanned.fromCache} from cache — ${formatDuration(durationMs)} (${timings.summary()})`
  )

  return { report: scanned, cache: pruneCache(cache, new Set(listings.map((listing) => listing.id)), walking, now) }
}

/**
 * What one listing came to. A listing only ever writes to its own, and the report is put
 * together from all of them in listing order once they are done — or, while the scan is
 * still going, from however many are done so far.
 */
type Outcome = {
  deals: DealRow[]
  noComps: NoCompsRow[]
  problems: ProblemRow[]
  /** What the listing counts towards on its source's summary. */
  tallies: Array<'belowEdge' | 'outOfScope' | 'fromCache'>
}

function emptyOutcome(): Outcome {
  return { deals: [], noComps: [], problems: [], tallies: [] }
}

/**
 * The report as it stands: what the search pages gave, and every listing's outcome in
 * listing order.
 *
 * The report shows the tallies as one number each, but they are kept per source so that
 * a run of one marketplace replaces only its own share of them — `withTotals` adds the
 * sources back up.
 */
function assemble(base: DealFinderReport, candidates: Candidate[], outcomes: Outcome[]): DealFinderReport {
  const sources = base.sources.map((summary) => ({ ...summary }))
  const deals: DealRow[] = []
  const noComps: NoCompsRow[] = []
  const problems: ProblemRow[] = [...base.problems]

  outcomes.forEach((out, index) => {
    deals.push(...out.deals)
    noComps.push(...out.noComps)
    problems.push(...out.problems)
    const summary = sources.find((entry) => entry.source === candidates[index]!.listing.source)
    for (const field of out.tallies) {
      if (summary) {
        summary[field] += 1
      }
    }
  })

  return withTotals({ ...base, sources, deals: sortDeals(deals), noComps: sortNoComps(noComps), problems, errors: [...base.errors] })
}

/** Holds a task back until fewer than `limit` of its kind are running; first come, first served. */
function createLimiter(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let running = 0
  const queue: Array<() => void> = []

  const release = () => {
    running -= 1
    queue.shift()?.()
  }

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve))
    }
    running += 1
    try {
      return await task()
    } finally {
      release()
    }
  }
}

/** The steps a scan's time goes on, counted so the dev log can say where it went. */
type Step = 'listing' | 'photos' | 'google' | 'cardmarket'

type Timings = {
  time<T>(step: Step, task: () => Promise<T>): Promise<T>
  summary(): string
}

const STEP_LABELS: Record<Step, [string, string]> = {
  listing: ['listing page', 'listing pages'],
  photos: ['photo read', 'photo reads'],
  google: ['Google search', 'Google searches'],
  cardmarket: ['Cardmarket card', 'Cardmarket cards']
}

/**
 * How often each step ran and how long it took on average.
 *
 * Steps overlap — photos are read while Cardmarket loads — so these do not add up to
 * the scan's own time; what they say is which step a slow scan was waiting on.
 */
function createTimings(): Timings {
  const totals = new Map<Step, { count: number; ms: number }>()

  return {
    async time(step, task) {
      const started = Date.now()
      try {
        return await task()
      } finally {
        const total = totals.get(step) ?? { count: 0, ms: 0 }
        total.count += 1
        total.ms += Date.now() - started
        totals.set(step, total)
      }
    },
    summary() {
      const parts = (Object.keys(STEP_LABELS) as Step[])
        .filter((step) => totals.has(step))
        .map((step) => {
          const { count, ms } = totals.get(step)!
          const [one, many] = STEP_LABELS[step]
          return `${count} ${count === 1 ? one : many} at ${(ms / count / 1000).toFixed(1)}s`
        })
      return parts.length > 0 ? parts.join(', ') : 'nothing to check'
    }
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

/** What every listing in a run shares: the pages it can load, and what is known or being asked about each card. */
type Run = {
  fetchPage: FetchCardmarketPage
  resolveUrl?: ResolveUrl
  cache: DealFinderCache
  now: Date
  delayMs: number
  pace: Pacer
  timings: Timings
  /** Google searches under way, by card, so a second listing of a card waits for the first's answer. */
  matching: Map<string, Promise<ProductMatch>>
  /** Cardmarket loads under way, by card and grade, for the same reason. */
  pricing: Map<string, Promise<PricedCard>>
}

/**
 * What a listing came to before anything had to be asked of Google or Cardmarket.
 *
 * Nothing here touches the report or the cache: several listings are worked out at
 * once, and only the step that consumes these writes anything down.
 */
type Prepared =
  | { step: 'priced'; listing: SourceListing; entry: CacheEntry }
  | { step: 'settled'; listing: SourceListing; entry: CacheEntry }
  | { step: 'matched'; listing: SourceListing; evaluated: Evaluated }
  | { step: 'search'; listing: SourceListing; identity: CardIdentity; label: PsaLabel | null; query: string }
  | { step: 'unidentified'; listing: SourceListing; scope: 'out-of-scope' | 'problem'; reason: string; detail: string | null }
  | { step: 'unavailable'; listing: SourceListing }
  | { step: 'failed'; listing: SourceListing; error: unknown }

/** Read the listing page and its photos, and say which card is in the slab. */
async function identifyCandidate({
  candidate,
  fetchPage,
  readSlabs,
  lookupCert,
  now,
  pace,
  listingDelayMs,
  timings
}: {
  candidate: Candidate
  fetchPage: FetchCardmarketPage
  readSlabs?: SlabReader
  lookupCert?: CertLookup
  now: Date
  pace: Pacer
  listingDelayMs: number
  timings: Timings
}): Promise<Prepared> {
  const cached = candidate.entry
  // Postage is only printed on the listing page, so a listing answered out of the cache
  // keeps the figure the scan that did open that page read there.
  const listing =
    candidate.listing.shipping == null && cached?.shipping != null ? { ...candidate.listing, shipping: cached.shipping } : candidate.listing

  // A card identified before the buying rules narrowed is still in the cache as a
  // priced identity; the rule is asked again here so the cache cannot outlive it.
  const cachedUnwanted = cached?.identity ? unwantedGradeReason(cached.identity.language, cached.identity.grade) : null
  if (cachedUnwanted) {
    return { step: 'unidentified', listing, scope: 'out-of-scope', reason: cachedUnwanted, detail: null }
  }

  if (cached && hasFreshPrice(cached, now, listing.ask) && cached.identity && cached.cardmarketUrl) {
    return { step: 'priced', listing, entry: cached }
  }

  // Already looked at, and it came to nothing. Answering from what that scan concluded is
  // the whole reason two scans of an overlapping feed do not cost the same as two scans.
  if (cached && hasSettledVerdict(cached, now, listing.ask)) {
    return { step: 'settled', listing, entry: cached }
  }

  const fresh = cached && hasFreshIdentity(cached, now) ? cached : null
  const identity = fresh?.identity ?? null
  const label = fresh?.label ?? null
  const query = fresh?.query ?? null
  const googleUrl = fresh?.googleUrl ?? null
  const cardmarketUrl = fresh?.cardmarketUrl ?? null

  // A half-written cache entry (identity but no Cardmarket page) is repaired by redoing the lookup.
  if (identity && query && googleUrl && cardmarketUrl) {
    return { step: 'matched', listing, evaluated: { listing, identity, label, query, googleUrl, cardmarketUrl } }
  }

  const {
    listing: detailed,
    sellerReviews,
    availability
  } = await timings.time('listing', () => loadListingDetail(listing, fetchPage, pace, listingDelayMs))

  // Sold, or promised to another buyer: there is nothing to buy, whatever the card is.
  if (availability) {
    return { step: 'unavailable', listing: detailed }
  }

  // The same rule as for Marktplaats: an unreviewed seller is not a risk worth taking at
  // any price, so the listing is dropped before its photos are ever read.
  if (sellerReviews === 0) {
    return { step: 'unidentified', listing: detailed, scope: 'out-of-scope', reason: 'Seller has no reviews', detail: null }
  }

  let reading: SlabReading = { slabs: [], note: null }
  if (readSlabs && detailed.imageUrls.length > 0) {
    try {
      reading = await timings.time('photos', () =>
        readSlabs({ listing: detailed, imageUrls: detailed.imageUrls.slice(0, MAX_PHOTOS_PER_LISTING) })
      )
    } catch (error) {
      reading = { slabs: [], note: error instanceof Error ? error.message : 'Could not read the photos.' }
    }
  }

  let cert: PsaLabel | null = null
  const certNumber = reading.slabs.length === 1 ? reading.slabs[0]!.certNumber : null
  if (certNumber && lookupCert) {
    try {
      cert = await lookupCert(certNumber)
    } catch {
      // PSA's free tier is capped and occasionally down — the label alone is enough.
      cert = null
    }
  }

  const identified = identifyCard({ listing: detailed, slabs: reading.slabs, cert, readerNote: reading.note })
  if (!identified.ok) {
    return { step: 'unidentified', listing: detailed, scope: identified.scope, reason: identified.reason, detail: identified.detail }
  }

  return {
    step: 'search',
    listing: detailed,
    identity: identified.identity,
    label: identified.label,
    query: buildSearchQuery(identified.identity, identified.label)
  }
}

/** Take an identified listing to Google and Cardmarket, and write down what came back. */
async function evaluatePrepared({
  prepared,
  run,
  out,
  park
}: {
  prepared: Prepared
  run: Run
  out: Outcome
  park: (evaluated: Evaluated) => void
}): Promise<void> {
  const { cache, now } = run

  if (prepared.step === 'failed') {
    throw prepared.error
  }

  if (prepared.step === 'priced') {
    const { listing, entry } = prepared
    out.tallies.push('fromCache')
    bucket({
      listing,
      identity: entry.identity!,
      cardmarketUrl: entry.cardmarketUrl!,
      googleUrl: entry.googleUrl,
      query: entry.query,
      floor: entry.floor!,
      comps: entry.comps,
      out
    })
    return
  }

  if (prepared.step === 'settled') {
    const { listing, entry } = prepared
    out.tallies.push('fromCache')
    if (!entry.problem) {
      out.tallies.push('outOfScope')
      return
    }
    out.problems.push({
      ...listingRef(listing),
      stage: entry.problem.stage,
      reason: entry.problem.reason,
      detail: entry.problem.detail,
      googleUrl: entry.googleUrl,
      query: entry.query,
      cardmarketUrl: entry.cardmarketUrl
    })
    // Deliberately not re-remembered: the week runs from the scan that did the reading,
    // so a written-off listing is looked at again eventually rather than never.
    return
  }

  if (prepared.step === 'unavailable') {
    // Not remembered, and anything remembered from before is dropped: a reservation can
    // fall through, and the item is then worth a fresh look rather than last week's answer.
    out.tallies.push('outOfScope')
    delete cache.entries[prepared.listing.id]
    return
  }

  if (prepared.step === 'unidentified') {
    const { listing, scope, reason, detail } = prepared
    if (scope === 'out-of-scope') {
      out.tallies.push('outOfScope')
    } else {
      out.problems.push({
        ...listingRef(listing),
        stage: 'identify',
        reason,
        detail,
        googleUrl: null,
        query: null,
        cardmarketUrl: null
      })
    }
    remember(cache, listing, now, {
      identity: null,
      label: null,
      query: null,
      googleUrl: null,
      cardmarketUrl: null,
      problem: scope === 'problem' ? { stage: 'identify', reason, detail } : null
    })
    return
  }

  const evaluated = prepared.step === 'matched' ? prepared.evaluated : await matchToCardmarket({ prepared, run, out })
  if (!evaluated) {
    return
  }

  await priceEvaluated({ evaluated, run, out, park })
}

const NO_MATCH = 'No matching Cardmarket page in the Google results'

/** Find the card's Cardmarket product page — remembered, being searched for, or searched for now. */
async function matchToCardmarket({
  prepared,
  run,
  out
}: {
  prepared: Extract<Prepared, { step: 'search' }>
  run: Run
  out: Outcome
}): Promise<Evaluated | null> {
  const { listing, identity, label } = prepared
  const match = await findProduct({ identity, label, query: prepared.query, run })

  if (!match.url) {
    out.problems.push({
      ...listingRef(listing),
      stage: 'match',
      reason: NO_MATCH,
      detail: label ? `Slab reads: ${[label.year, label.setLine, label.cardName, label.varietyLine].filter(Boolean).join(' ')}` : null,
      googleUrl: match.googleUrl,
      query: match.query,
      cardmarketUrl: null
    })
    remember(run.cache, listing, run.now, {
      identity,
      label,
      query: match.query,
      googleUrl: match.googleUrl,
      cardmarketUrl: null,
      problem: { stage: 'match', reason: NO_MATCH, detail: null }
    })
    return null
  }

  return { listing, identity, label, query: match.query, googleUrl: match.googleUrl, cardmarketUrl: match.url }
}

/**
 * The card's Cardmarket product, asked of Google at most once however many listings
 * show it: an earlier scan's answer is used while it is fresh, and a second listing of
 * a card still being searched for waits for that search rather than starting its own.
 */
function findProduct({
  identity,
  label,
  query,
  run
}: {
  identity: CardIdentity
  label: PsaLabel | null
  query: string
  run: Run
}): Promise<ProductMatch> {
  const key = productKey(identity, label)
  const remembered = run.cache.products?.[key]
  if (hasFreshMatch(remembered, run.now)) {
    return Promise.resolve(remembered)
  }

  const underway = run.matching.get(key)
  if (underway) {
    return underway
  }

  const searching = searchGoogle({ identity, query, run })
    .then((match) => {
      ;(run.cache.products ??= {})[key] = match
      return match
    })
    .finally(() => run.matching.delete(key))
  run.matching.set(key, searching)
  return searching
}

/** Search Google for the card and pick the Cardmarket product page out of the results. */
async function searchGoogle({ identity, query, run }: { identity: CardIdentity; query: string; run: Run }): Promise<ProductMatch> {
  const fallback = buildFallbackQuery(identity, query)
  let answer: ProductMatch | null = null

  for (const asked of fallback ? [query, fallback] : [query]) {
    const googleUrl = googleSearchUrl(asked)
    const url = await run.timings.time('google', async () => {
      const html = await run.pace(googleUrl, run.delayMs, () => run.fetchPage(googleUrl))
      return await followToCardmarket({ html, identity, resolveUrl: run.resolveUrl, delayMs: run.delayMs, pace: run.pace })
    })
    // The first search is the one to show when neither found the card: it is the one
    // built from the slab, and the one worth correcting.
    answer = url || !answer ? { url, query: asked, googleUrl, at: run.now.toISOString() } : answer
    if (url) {
      break
    }
  }

  return answer!
}

/** A card priced on Cardmarket: the version that set the floor, and what it came to. */
type PricedCard = { productUrl: string; priced: MarketPrice | Unpriced }

/** Load the Cardmarket offers page and turn it into a deal, a no-comps row or a problem. */
async function priceEvaluated({
  evaluated,
  run,
  out,
  park
}: {
  evaluated: Evaluated
  run: Run
  out: Outcome
  /** Where to leave a card the bot check stopped, to be tried again at the end; null on that last try. */
  park: ((evaluated: Evaluated) => void) | null
}): Promise<void> {
  const { listing, identity, label, query, googleUrl } = evaluated
  const { cache, now } = run

  let cardmarketUrl = evaluated.cardmarketUrl
  let priced: PricedCard['priced']
  try {
    ;({ productUrl: cardmarketUrl, priced } = await priceCard({ productUrl: cardmarketUrl, identity, run }))
  } catch (error) {
    if (error instanceof CardmarketBlockedError && park) {
      // Park it: the user still has to clear the bot check in the Chrome window.
      park(evaluated)
      return
    }

    const reason = error instanceof CardmarketBlockedError ? 'Cardmarket bot check blocked this card' : 'Could not load the Cardmarket page'
    out.problems.push({
      ...listingRef(listing),
      stage: 'price',
      reason,
      detail: error instanceof Error && !(error instanceof CardmarketBlockedError) ? error.message : null,
      googleUrl,
      query,
      cardmarketUrl: offersUrlFor(cardmarketUrl, identity)
    })
    remember(cache, listing, now, {
      identity,
      label,
      query,
      googleUrl,
      cardmarketUrl,
      problem: { stage: 'price', reason, detail: null }
    })
    return
  }

  if ('error' in priced && priced.wrongCard) {
    // Google found a page, but not this card's. That is a failed match, and remembered as
    // one — for this listing, and for every other listing of the card.
    const reason = 'The Cardmarket page Google found is a different card'
    out.problems.push({
      ...listingRef(listing),
      stage: 'match',
      reason,
      detail: priced.error,
      googleUrl,
      query,
      cardmarketUrl: offersUrlFor(cardmarketUrl, identity)
    })
    remember(cache, listing, now, {
      identity,
      label,
      query,
      googleUrl,
      cardmarketUrl: null,
      problem: { stage: 'match', reason, detail: priced.error }
    })
    ;(cache.products ??= {})[productKey(identity, label)] = { url: null, query, googleUrl, at: now.toISOString() }
    return
  }

  if ('error' in priced) {
    out.noComps.push({
      ...listingRef(listing),
      displayTitle: rowTitle(identity, cardmarketUrl),
      card: identity,
      cardmarketUrl: offersUrlFor(cardmarketUrl, identity),
      reason: priced.error,
      googleUrl,
      query
    })
    remember(cache, listing, now, { identity, label, query, googleUrl, cardmarketUrl, problem: null })
    return
  }

  bucket({
    listing,
    identity,
    cardmarketUrl,
    googleUrl,
    query,
    floor: priced.floor,
    comps: priced.comps,
    out
  })
  remember(cache, listing, now, {
    identity,
    label,
    query,
    googleUrl,
    cardmarketUrl,
    problem: null,
    floor: priced.floor,
    comps: priced.comps
  })
}

/**
 * The card's Cardmarket floor in this grade, read off Cardmarket at most once however
 * many listings show it — an earlier scan's reading while it is fresh, the reading
 * another listing is already waiting on, or a fresh one.
 *
 * A bot check or a page that would not load is not remembered: that is the scan having
 * a bad moment, and the next listing of the card gets to try for itself.
 */
function priceCard({ productUrl, identity, run }: { productUrl: string; identity: CardIdentity; run: Run }): Promise<PricedCard> {
  const key = floorKey(productUrl, identity)
  const remembered = run.cache.floors?.[key]
  if (hasFreshFloor(remembered, run.now)) {
    return Promise.resolve({
      productUrl: remembered.productUrl,
      priced:
        remembered.floor != null
          ? { floor: remembered.floor, comps: remembered.comps }
          : { error: remembered.error ?? 'No offers on the Cardmarket page', wrongCard: remembered.wrongCard }
    })
  }

  const underway = run.pricing.get(key)
  if (underway) {
    return underway
  }

  const pricing = run.timings
    .time('cardmarket', () =>
      priceCheapestVersion({ productUrl, identity, fetchPage: run.fetchPage, delayMs: run.delayMs, pace: run.pace })
    )
    .then((result) => {
      ;(run.cache.floors ??= {})[key] = {
        productUrl: result.productUrl,
        floor: 'floor' in result.priced ? result.priced.floor : null,
        comps: 'comps' in result.priced ? result.priced.comps : [],
        error: 'error' in result.priced ? result.priced.error : null,
        wrongCard: 'error' in result.priced && result.priced.wrongCard === true,
        at: run.now.toISOString()
      }
      return result
    })
    .finally(() => run.pricing.delete(key))
  run.pricing.set(key, pricing)
  return pricing
}

/**
 * Price the card — and when Cardmarket sells the same card number more than once, the
 * cheapest of them.
 *
 * Google titles every version of a product alike, so which one a search lands on is
 * luck: a plain Surging Sparks ETB Magneton went up as a €114 deal priced against the
 * Pokémon Center stamped one, `Magneton-V2-SVP159`, where the plain one is `-V1-`. What
 * tells them apart is only in the photo, but the product page links every printing of
 * the card, so the versions that share this one's set and number are priced beside it.
 * A deal against the cheapest of them is a deal whichever one the slab is. Where one of
 * them cannot be priced there is no knowing which is cheapest, so the card is not priced.
 *
 * Before any of that, the page is asked which card it is. Cardmarket prints the card
 * number on it, and a page for a different number is a Google result that looked right
 * and was not — worth nothing as a price, however good the edge it would give.
 */
async function priceCheapestVersion({
  productUrl,
  identity,
  fetchPage,
  delayMs,
  pace
}: {
  productUrl: string
  identity: CardIdentity
  fetchPage: FetchCardmarketPage
  delayMs: number
  pace: Pacer
}): Promise<PricedCard> {
  const load = async (url: string) => {
    const offersUrl = offersUrlFor(url, identity)
    const html = await pace(offersUrl, delayMs, () => fetchPage(offersUrl, OFFERS_FETCH_OPTIONS(identity.grade)))
    return { productUrl: url, html, priced: priceFromOffers(html, identity.grade) }
  }

  const found = await load(productUrl)
  const printed = identity.cardNumber ? cardmarketProductNumber(found.html) : null
  if (printed && numbersDisagree(printed, identity.cardNumber!)) {
    return { productUrl, priced: { error: `Cardmarket's page is card ${printed}, the slab is #${identity.cardNumber}`, wrongCard: true } }
  }

  const versionsUrl = isVersionedProduct(productUrl) ? cardmarketVersionsUrl(found.html) : null
  if (!versionsUrl) {
    return found
  }

  const versionsHtml = await pace(versionsUrl, delayMs, () => fetchPage(versionsUrl))
  if (isCardmarketChallenge(versionsHtml)) {
    throw new CardmarketBlockedError()
  }
  const others = sameCardVersions(versionsHtml, productUrl)
  if (others.length === 0) {
    return found
  }

  const versions = others.length + 1
  if (others.length > MAX_OTHER_VERSIONS) {
    return { productUrl, priced: { error: `Cardmarket sells ${versions} versions of this card and the slab does not say which` } }
  }

  const priced = [found]
  for (const url of others) {
    priced.push(await load(url))
  }
  if (priced.some((version) => 'error' in version.priced)) {
    return {
      productUrl,
      priced: { error: `Cardmarket sells ${versions} versions of this card, and not every one has a PSA ${identity.grade} to price it by` }
    }
  }

  const floor = (version: (typeof priced)[number]) => ('floor' in version.priced ? version.priced.floor : Number.POSITIVE_INFINITY)
  return priced.reduce((cheapest, version) => (floor(version) < floor(cheapest) ? version : cheapest))
}

/** A priced listing is only worth showing when Cardmarket beats the ask by enough. */
function bucket({
  listing,
  identity,
  cardmarketUrl,
  googleUrl,
  query,
  floor,
  comps,
  out
}: {
  listing: SourceListing
  identity: CardIdentity
  cardmarketUrl: string
  googleUrl: string | null
  query: string | null
  floor: number
  comps: DealRow['comps']
  out: Outcome
}): void {
  const cost = listingCost(listing)
  const edge = Math.round((floor - cost.total) * 100) / 100
  if (edge < MIN_EDGE) {
    out.tallies.push('belowEdge')
    return
  }

  // Too good to be true is the signature of a bad match, not a bargain — show it in the
  // dropdown with the numbers so it can be judged, rather than at the top as a deal.
  if (floor >= listing.ask * IMPLAUSIBLE_FLOOR_RATIO && edge >= IMPLAUSIBLE_FLOOR_GAP) {
    out.problems.push({
      ...listingRef(listing),
      stage: 'match',
      reason: 'Cardmarket price is far above the ask, probably a different card',
      detail: `Asking €${listing.ask}, Cardmarket floor €${floor}`,
      googleUrl,
      query,
      cardmarketUrl: offersUrlFor(cardmarketUrl, identity)
    })
    return
  }

  out.deals.push({
    ...listingRef(listing),
    displayTitle: rowTitle(identity, cardmarketUrl),
    card: identity,
    cardmarketUrl: offersUrlFor(cardmarketUrl, identity),
    marketFloor: floor,
    edge,
    comps,
    googleUrl,
    query
  })
}

function remember(
  cache: DealFinderCache,
  listing: SourceListing,
  now: Date,
  patch: Pick<CacheEntry, 'identity' | 'label' | 'query' | 'googleUrl' | 'cardmarketUrl' | 'problem'> &
    Partial<Pick<CacheEntry, 'floor' | 'comps'>>
): void {
  const priced = patch.floor != null
  cache.entries[listing.id] = {
    id: listing.id,
    ask: listing.ask,
    shipping: listing.shipping,
    identifiedAt: now.toISOString(),
    identity: patch.identity,
    label: patch.label,
    query: patch.query,
    googleUrl: patch.googleUrl,
    cardmarketUrl: patch.cardmarketUrl,
    pricedAt: priced ? now.toISOString() : null,
    floor: patch.floor ?? null,
    comps: patch.comps ?? [],
    problem: patch.problem
  }
}
