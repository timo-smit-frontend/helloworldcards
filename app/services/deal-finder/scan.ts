import type { FetchCardmarketPage } from '../cardmarket/scan'
import { CardmarketBlockedError, OFFERS_FETCH_OPTIONS, offersUrlFor, priceFromOffers } from './cardmarket'
import { hasFreshIdentity, hasFreshPrice, pruneCache, usableCache, type CacheEntry, type DealFinderCache } from './cache'
import {
  FETCH_DELAY_MS,
  IDENTIFY_CONCURRENCY,
  IMPLAUSIBLE_FLOOR_GAP,
  IMPLAUSIBLE_FLOOR_RATIO,
  LISTING_DELAY_MS,
  MARKTPLAATS_MAX_PAGES,
  MARKTPLAATS_SEARCH_URL,
  MAX_PHOTOS_PER_LISTING,
  MIN_EDGE,
  VINTED_MAX_PAGES,
  VINTED_SEARCH_URL
} from './constants'
import { listingCost } from './cost'
import { ownListingIds, screenListing, type OwnListingIds, type Screening } from './filters'
import {
  buildSearchQuery,
  cardmarketProductName,
  cleanCardmarketUrl,
  googleSearchUrl,
  rankCardmarketCandidates,
  scoreCardmarketUrl
} from './google'
import { displayTitle, identifyCard } from './identify'
import {
  isMarktplaatsChallenge,
  isMarktplaatsResultCap,
  marktplaatsResultCount,
  marktplaatsSearchPageUrl,
  parseMarktplaatsDetail,
  parseMarktplaatsOverview
} from './marktplaats'
import { emptyReport, sortDeals, sortNoComps } from './report'
import { isVintedChallenge, parseVintedDetail, parseVintedOverview, vintedSearchPageUrl } from './vinted'
import type {
  CardIdentity,
  DealFinderReport,
  DealRow,
  NoCompsRow,
  ProblemRow,
  PsaLabel,
  SlabReading,
  SourceListing,
  SourceSummary
} from './types'

export type { DealFinderCache, DealFinderCacheStore, CacheEntry } from './cache'
export * from './types'
export { groupProblems, sortDeals, sortNoComps } from './report'
export { ownListingIds } from './filters'
export { displayTitle } from './identify'

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

/** A promise handed out before the work that settles it has been started. */
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
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
  outOfScope: number
  errors: string[]
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
  maxPages
}: {
  source: 'marktplaats' | 'vinted'
  url: string
  fetchPage: FetchCardmarketPage
  ids: OwnListingIds
  delayMs: number
  pace: Pacer
  sellerReviews?: SellerReviews
  maxPages: number
}): Promise<Collected> {
  const { pageUrl } = PAGING[source]
  const seen = new Set<string>()
  const listings: SourceListing[] = []
  const problems: ProblemRow[] = []
  const errors: string[] = []
  let found = 0
  let outOfScope = 0
  let total: number | null = null
  let capped = false
  let reachedEnd = false
  // Sellers put up several listings at once, so their review count is asked for once.
  const reviewCounts = new Map<string, number | null>()

  const failed = (error: string): Collected => ({
    summary: { source, url, found: 0, candidates: 0, error, total, truncated: null },
    listings: [],
    problems: [],
    outOfScope: 0,
    errors: []
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
      errors.push(`${label(source)} page ${page} would not load — stopped after page ${page - 1}.`)
      break
    }

    const blocked = source === 'marktplaats' ? isMarktplaatsChallenge(html) : isVintedChallenge(html)
    if (blocked) {
      if (page === 1) {
        return failed(`${label(source)} showed a bot check instead of results.`)
      }
      errors.push(`${label(source)} showed a bot check on page ${page} — stopped after page ${page - 1}.`)
      break
    }

    if (source === 'marktplaats') {
      total ??= marktplaatsResultCount(html)
      capped ||= isMarktplaatsResultCap(html)
    }

    const parsed = source === 'marktplaats' ? parseMarktplaatsOverview(html) : parseVintedOverview(html)
    // Past the last page both sites answer with the previous page's rows rather than an
    // empty one, so "nothing new here" is what marks the end of the results.
    const fresh = parsed.filter((listing) => !seen.has(listing.id))
    if (fresh.length === 0) {
      if (page === 1) {
        return failed(`No ${label(source)} listings on the search page.`)
      }
      reachedEnd = true
      break
    }

    found += fresh.length
    for (const listing of fresh) {
      seen.add(listing.id)
    }

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
    // read there is no next page worth asking for.
    if (total != null && found >= total) {
      reachedEnd = true
      break
    }
  }

  return {
    summary: {
      source,
      url,
      found,
      candidates: listings.length,
      error: null,
      total,
      truncated: truncation({ source, found, total, capped, reachedEnd, maxPages })
    },
    listings,
    problems,
    outOfScope,
    errors
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
 * usually settle it.
 */
function withSellerStanding(listing: SourceListing, screening: Screening, counts: Map<string, number | null>): Screening {
  if (!screening.keep || listing.source !== 'marktplaats' || !listing.sellerId) {
    return screening
  }
  return counts.get(listing.sellerId) === 0 ? { keep: false, scope: 'out-of-scope', reason: 'Seller has no reviews' } : screening
}

/**
 * Say so when the scan never reached the end of a search.
 *
 * Marktplaats refuses to page past its first 300 listings, and the scan has a page bound
 * of its own on top of that; either way the listings beyond the cut were never looked at.
 * A short list that quietly leaves most of the results unread is the one failure the deal
 * finder cannot show as an answer, so it is reported and the fix is named: filter harder.
 */
function truncation({
  source,
  found,
  total,
  capped,
  reachedEnd,
  maxPages
}: {
  source: 'marktplaats' | 'vinted'
  found: number
  total: number | null
  capped: boolean
  reachedEnd: boolean
  maxPages: number
}): string | null {
  if (reachedEnd || total == null || total <= found) {
    return capped ? `${label(source)} only pages through the first 300 listings of a search — narrow the search filters.` : null
  }

  const why = capped ? `${label(source)} only pages through the first 300 listings of a search` : `the scan stops after ${maxPages} pages`
  return `Read ${found} of ${total} listings — ${why}, so narrow the search filters to see the rest.`
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

/** Overview rows carry a clipped description and one small photo; the listing page has both in full. */
async function loadListingDetail(
  listing: SourceListing,
  fetchPage: FetchCardmarketPage,
  pace: Pacer,
  delayMs: number
): Promise<SourceListing> {
  try {
    const html = await pace(listing.listingUrl, delayMs, () => fetchPage(listing.listingUrl))
    const detail = listing.source === 'marktplaats' ? parseMarktplaatsDetail(html) : parseVintedDetail(html)
    const description =
      detail.description && detail.description.length > (listing.description?.length ?? 0) ? detail.description : listing.description
    return {
      ...listing,
      description,
      imageUrls: detail.imageUrls.length > 0 ? detail.imageUrls : listing.imageUrls,
      shipping: detail.shipping ?? listing.shipping
    }
  } catch {
    // A listing page that will not load is not fatal — the overview row still has a title.
    return listing
  }
}

export async function runDealFinderScan({
  fetchPage,
  readSlabs,
  lookupCert,
  resolveUrl,
  sellerReviews,
  cache: previousCache,
  ownListings = [],
  marktplaatsUrl = MARKTPLAATS_SEARCH_URL,
  vintedUrl = VINTED_SEARCH_URL,
  maxPages,
  now = new Date(),
  delayMs = FETCH_DELAY_MS
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
  marktplaatsUrl?: string
  vintedUrl?: string
  /** How many pages to read per source; the defaults are in `constants.ts`. */
  maxPages?: Partial<Record<'marktplaats' | 'vinted', number>>
  now?: Date
  delayMs?: number
}): Promise<{ report: DealFinderReport; cache: DealFinderCache }> {
  const report = emptyReport(now.toISOString())
  const cache: DealFinderCache = usableCache(previousCache)
  const ids = ownListingIds(ownListings)
  const pace = createPacer()
  // A listing page is paced far more lightly than a search or a Cardmarket load, but a
  // caller that asked for no pauses at all — a test — still gets none.
  const listingDelayMs = Math.min(delayMs, LISTING_DELAY_MS)

  // Marktplaats and Vinted are different sites with nothing to say to each other, so
  // neither has any reason to wait for the other's search to finish.
  const collected = await Promise.all(
    (
      [
        ['marktplaats', marktplaatsUrl],
        ['vinted', vintedUrl]
      ] as const
    ).map(([source, url]) =>
      collectSource({
        source,
        url,
        fetchPage,
        ids,
        delayMs,
        pace,
        sellerReviews,
        maxPages: maxPages?.[source] ?? PAGING[source].maxPages
      })
    )
  )

  const listings: SourceListing[] = []
  for (const source of collected) {
    report.sources.push(source.summary)
    report.problems.push(...source.problems)
    report.errors.push(...source.errors)
    report.outOfScope += source.outOfScope
    listings.push(...source.listings)
  }

  if (!readSlabs) {
    // Without the label reader we are back to guessing from the seller's words alone,
    // which is exactly what used to go wrong — so say so rather than quietly degrading.
    report.errors.push('No PSA label reader configured — the scan is going on the listing text alone.')
  }

  const deals: DealRow[] = []
  const noComps: NoCompsRow[] = []
  const blocked: Evaluated[] = []

  const candidates: Candidate[] = listings.map((listing) => ({ listing, entry: cache.entries[listing.id] }))
  console.info(`[deal-finder] ${candidates.length} listings to check (${report.outOfScope} out of scope)`)

  /**
   * Working out which card a listing shows — its page, its photos, the label on the
   * slab — needs neither the browser nor Cardmarket, so every listing's turn at it is
   * started now and several run at once. The loop below then takes them in order, and
   * a listing is nearly always worked out by the time its turn comes: what used to be
   * the slowest thing in a scan now happens while the Google and Cardmarket pages for
   * the listings ahead of it are loading.
   */
  const preparing = candidates.map(() => deferred<Prepared>())
  const identifying = mapWithConcurrency(candidates, IDENTIFY_CONCURRENCY, async (candidate, index) => {
    try {
      preparing[index]!.resolve(await identifyCandidate({ candidate, fetchPage, readSlabs, lookupCert, now, pace, listingDelayMs }))
    } catch (error) {
      preparing[index]!.resolve({ step: 'failed', listing: candidate.listing, error })
    }
  })

  for (const pending of preparing) {
    const prepared = await pending.promise
    try {
      await evaluatePrepared({ prepared, fetchPage, resolveUrl, cache, now, delayMs, pace, deals, noComps, report, blocked })
    } catch (error) {
      report.problems.push({
        ...listingRef(prepared.listing),
        stage: 'price',
        reason: 'Checking this listing failed',
        detail: error instanceof Error ? error.message : String(error),
        googleUrl: null,
        query: null,
        cardmarketUrl: null
      })
    }
  }
  await identifying

  // Cardmarket's bot check needs a human; retry those listings once the run is over,
  // by which time the challenge in the Chrome window has usually been cleared.
  for (const pending of blocked) {
    await priceEvaluated({ evaluated: pending, fetchPage, cache, now, delayMs, pace, deals, noComps, report, retry: false })
  }

  report.deals = sortDeals(deals)
  report.noComps = sortNoComps(noComps)

  console.info(
    `[deal-finder] ${report.deals.length} deals, ${report.noComps.length} without comps, ${report.belowEdge} below €${MIN_EDGE}, ${report.problems.length} problems, ${report.fromCache} from cache`
  )

  return { report, cache: pruneCache(cache, new Set(listings.map((listing) => listing.id))) }
}

/**
 * What a listing came to before anything had to be asked of Google or Cardmarket.
 *
 * Nothing here touches the report or the cache. Several listings are worked out at
 * once, and a report written from whichever finished first would come out in a
 * different order every run — so what each one found is handed back, and the loop that
 * consumes them in order is the only thing that writes anything down.
 */
type Prepared =
  | { step: 'priced'; listing: SourceListing; entry: CacheEntry }
  | { step: 'matched'; listing: SourceListing; evaluated: Evaluated }
  | { step: 'search'; listing: SourceListing; identity: CardIdentity; label: PsaLabel | null; query: string; googleUrl: string }
  | { step: 'unidentified'; listing: SourceListing; scope: 'out-of-scope' | 'problem'; reason: string; detail: string | null }
  | { step: 'failed'; listing: SourceListing; error: unknown }

/** Read the listing page and its photos, and say which card is in the slab. */
async function identifyCandidate({
  candidate,
  fetchPage,
  readSlabs,
  lookupCert,
  now,
  pace,
  listingDelayMs
}: {
  candidate: Candidate
  fetchPage: FetchCardmarketPage
  readSlabs?: SlabReader
  lookupCert?: CertLookup
  now: Date
  pace: Pacer
  listingDelayMs: number
}): Promise<Prepared> {
  const cached = candidate.entry
  // Postage is only printed on the listing page, so a listing answered out of the cache
  // keeps the figure the scan that did open that page read there.
  const listing =
    candidate.listing.shipping == null && cached?.shipping != null ? { ...candidate.listing, shipping: cached.shipping } : candidate.listing

  if (hasFreshPrice(cached, now, listing.ask) && cached.identity && cached.cardmarketUrl) {
    return { step: 'priced', listing, entry: cached }
  }

  const fresh = hasFreshIdentity(cached, now)
  const identity = fresh ? cached.identity! : null
  const label = fresh ? cached.label : null
  const query = fresh ? cached.query : null
  const googleUrl = fresh ? cached.googleUrl : null
  const cardmarketUrl = fresh ? cached.cardmarketUrl : null

  // A half-written cache entry (identity but no Cardmarket page) is repaired by redoing the lookup.
  if (identity && query && googleUrl && cardmarketUrl) {
    return { step: 'matched', listing, evaluated: { listing, identity, label, query, googleUrl, cardmarketUrl } }
  }

  const detailed = await loadListingDetail(listing, fetchPage, pace, listingDelayMs)

  let reading: SlabReading = { slabs: [], note: null }
  if (readSlabs && detailed.imageUrls.length > 0) {
    try {
      reading = await readSlabs({ listing: detailed, imageUrls: detailed.imageUrls.slice(0, MAX_PHOTOS_PER_LISTING) })
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

  const searchQuery = buildSearchQuery(identified.identity, identified.label)
  return {
    step: 'search',
    listing: detailed,
    identity: identified.identity,
    label: identified.label,
    query: searchQuery,
    googleUrl: googleSearchUrl(searchQuery)
  }
}

/** Take an identified listing to Google and Cardmarket, and write down what came back. */
async function evaluatePrepared({
  prepared,
  fetchPage,
  resolveUrl,
  cache,
  now,
  delayMs,
  pace,
  deals,
  noComps,
  report,
  blocked
}: {
  prepared: Prepared
  fetchPage: FetchCardmarketPage
  resolveUrl?: ResolveUrl
  cache: DealFinderCache
  now: Date
  delayMs: number
  pace: Pacer
  deals: DealRow[]
  noComps: NoCompsRow[]
  report: DealFinderReport
  blocked: Evaluated[]
}): Promise<void> {
  if (prepared.step === 'failed') {
    throw prepared.error
  }

  if (prepared.step === 'priced') {
    const { listing, entry } = prepared
    report.fromCache += 1
    bucket({
      listing,
      identity: entry.identity!,
      cardmarketUrl: entry.cardmarketUrl!,
      googleUrl: entry.googleUrl,
      query: entry.query,
      floor: entry.floor!,
      comps: entry.comps,
      deals,
      report
    })
    return
  }

  if (prepared.step === 'unidentified') {
    const { listing, scope, reason, detail } = prepared
    if (scope === 'out-of-scope') {
      report.outOfScope += 1
    } else {
      report.problems.push({
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

  const evaluated =
    prepared.step === 'matched'
      ? prepared.evaluated
      : await matchToCardmarket({ prepared, fetchPage, resolveUrl, cache, now, delayMs, pace, report })
  if (!evaluated) {
    return
  }

  await priceEvaluated({ evaluated, fetchPage, cache, now, delayMs, pace, deals, noComps, report, retry: true, blocked })
}

/** Search Google for the card and pick the Cardmarket product page out of the results. */
async function matchToCardmarket({
  prepared,
  fetchPage,
  resolveUrl,
  cache,
  now,
  delayMs,
  pace,
  report
}: {
  prepared: Extract<Prepared, { step: 'search' }>
  fetchPage: FetchCardmarketPage
  resolveUrl?: ResolveUrl
  cache: DealFinderCache
  now: Date
  delayMs: number
  pace: Pacer
  report: DealFinderReport
}): Promise<Evaluated | null> {
  const { listing, identity, label, query, googleUrl } = prepared

  const googleHtml = await pace(googleUrl, delayMs, () => fetchPage(googleUrl))
  const cardmarketUrl = await followToCardmarket({ html: googleHtml, identity, resolveUrl, delayMs, pace })

  if (!cardmarketUrl) {
    report.problems.push({
      ...listingRef(listing),
      stage: 'match',
      reason: 'No matching Cardmarket page in the Google results',
      detail: label ? `Slab reads: ${[label.year, label.setLine, label.cardName, label.varietyLine].filter(Boolean).join(' ')}` : null,
      googleUrl,
      query,
      cardmarketUrl: null
    })
    remember(cache, listing, now, {
      identity,
      label,
      query,
      googleUrl,
      cardmarketUrl: null,
      problem: { stage: 'match', reason: 'No matching Cardmarket page in the Google results', detail: null }
    })
    return null
  }

  return { listing, identity, label, query, googleUrl, cardmarketUrl }
}

/** Load the Cardmarket offers page and turn it into a deal, a no-comps row or a problem. */
async function priceEvaluated({
  evaluated,
  fetchPage,
  cache,
  now,
  delayMs,
  pace,
  deals,
  noComps,
  report,
  retry,
  blocked
}: {
  evaluated: Evaluated
  fetchPage: FetchCardmarketPage
  cache: DealFinderCache
  now: Date
  delayMs: number
  pace: Pacer
  deals: DealRow[]
  noComps: NoCompsRow[]
  report: DealFinderReport
  retry: boolean
  blocked?: Evaluated[]
}): Promise<void> {
  const { listing, identity, label, query, googleUrl, cardmarketUrl } = evaluated
  const offersUrl = offersUrlFor(cardmarketUrl, identity)

  let priced: ReturnType<typeof priceFromOffers>
  try {
    const html = await pace(offersUrl, delayMs, () => fetchPage(offersUrl, OFFERS_FETCH_OPTIONS(identity.grade)))
    priced = priceFromOffers(html, identity.grade)
  } catch (error) {
    if (error instanceof CardmarketBlockedError && retry && blocked) {
      // Park it: the user still has to clear the bot check in the Chrome window.
      blocked.push(evaluated)
      return
    }

    const reason = error instanceof CardmarketBlockedError ? 'Cardmarket bot check blocked this card' : 'Could not load the Cardmarket page'
    report.problems.push({
      ...listingRef(listing),
      stage: 'price',
      reason,
      detail: error instanceof Error && !(error instanceof CardmarketBlockedError) ? error.message : null,
      googleUrl,
      query,
      cardmarketUrl: offersUrl
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

  if ('error' in priced) {
    noComps.push({
      ...listingRef(listing),
      displayTitle: rowTitle(identity, cardmarketUrl),
      card: identity,
      cardmarketUrl: offersUrl,
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
    deals,
    report
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

/** A priced listing is only worth showing when Cardmarket beats the ask by enough. */
function bucket({
  listing,
  identity,
  cardmarketUrl,
  googleUrl,
  query,
  floor,
  comps,
  deals,
  report
}: {
  listing: SourceListing
  identity: CardIdentity
  cardmarketUrl: string
  googleUrl: string | null
  query: string | null
  floor: number
  comps: DealRow['comps']
  deals: DealRow[]
  report: DealFinderReport
}): void {
  const cost = listingCost(listing)
  const edge = Math.round((floor - cost.total) * 100) / 100
  if (edge < MIN_EDGE) {
    report.belowEdge += 1
    return
  }

  // Too good to be true is the signature of a bad match, not a bargain — show it in the
  // dropdown with the numbers so it can be judged, rather than at the top as a deal.
  if (floor >= listing.ask * IMPLAUSIBLE_FLOOR_RATIO && edge >= IMPLAUSIBLE_FLOOR_GAP) {
    report.problems.push({
      ...listingRef(listing),
      stage: 'match',
      reason: 'Cardmarket price is far above the ask — probably a different card',
      detail: `Asking €${listing.ask}, Cardmarket floor €${floor}`,
      googleUrl,
      query,
      cardmarketUrl: offersUrlFor(cardmarketUrl, identity)
    })
    return
  }

  deals.push({
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
