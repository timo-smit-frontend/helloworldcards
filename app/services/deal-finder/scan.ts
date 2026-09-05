import type { FetchCardmarketPage } from '../cardmarket/scan'
import { CardmarketBlockedError, OFFERS_FETCH_OPTIONS, offersUrlFor, priceFromOffers } from './cardmarket'
import { emptyCache, hasFreshIdentity, hasFreshPrice, pruneCache, type CacheEntry, type DealFinderCache } from './cache'
import {
  FETCH_DELAY_MS,
  IMPLAUSIBLE_FLOOR_GAP,
  IMPLAUSIBLE_FLOOR_RATIO,
  MARKTPLAATS_SEARCH_URL,
  MAX_PHOTOS_PER_LISTING,
  MIN_EDGE,
  VINTED_SEARCH_URL
} from './constants'
import { ownListingIds, screenListing, type OwnListingIds } from './filters'
import { buildSearchQuery, cardmarketProductName, googleSearchUrl, pickCardmarketProduct } from './google'
import { displayTitle, identifyCard } from './identify'
import { isMarktplaatsChallenge, parseMarktplaatsDetail, parseMarktplaatsOverview } from './marktplaats'
import { emptyReport, sortDeals, sortNoComps } from './report'
import { isVintedChallenge, parseVintedDetail, parseVintedOverview } from './vinted'
import type { CardIdentity, DealFinderReport, DealRow, NoCompsRow, PsaLabel, SlabReading, SourceListing, SourceSummary } from './types'

export type { DealFinderCache, DealFinderCacheStore, CacheEntry } from './cache'
export * from './types'
export { groupProblems, sortDeals, sortNoComps } from './report'
export { ownListingIds } from './filters'
export { displayTitle } from './identify'

/** Reads every PSA label it can find across a listing's photos, locally with OCR. */
export type SlabReader = (input: { listing: SourceListing; imageUrls: string[] }) => Promise<SlabReading>

/** Resolves a certification number against PSA's own records. */
export type CertLookup = (certNumber: string) => Promise<PsaLabel | null>

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

function listingRef(listing: SourceListing) {
  return {
    id: listing.id,
    source: listing.source,
    title: listing.title,
    ask: listing.ask,
    listingUrl: listing.listingUrl,
    imageUrl: listing.imageUrls[0] ?? null
  }
}

/** Prefer the name Cardmarket itself uses — it is the name you will search for again. */
function rowTitle(identity: CardIdentity, cardmarketUrl: string | null): string {
  const fromUrl = cardmarketUrl ? cardmarketProductName(cardmarketUrl) : null
  return displayTitle(fromUrl ? { ...identity, name: fromUrl } : identity)
}

async function collectSource({
  source,
  url,
  fetchPage,
  ids,
  candidates,
  report
}: {
  source: 'marktplaats' | 'vinted'
  url: string
  fetchPage: FetchCardmarketPage
  ids: OwnListingIds
  candidates: SourceListing[]
  report: DealFinderReport
}): Promise<SourceSummary> {
  let html: string
  try {
    html = await fetchPage(url)
  } catch (error) {
    return { source, url, found: 0, candidates: 0, error: error instanceof Error ? error.message : 'Could not load the search page.' }
  }

  const blocked = source === 'marktplaats' ? isMarktplaatsChallenge(html) : isVintedChallenge(html)
  if (blocked) {
    return { source, url, found: 0, candidates: 0, error: `${label(source)} showed a bot check instead of results.` }
  }

  const listings = source === 'marktplaats' ? parseMarktplaatsOverview(html) : parseVintedOverview(html)
  if (listings.length === 0) {
    return { source, url, found: 0, candidates: 0, error: `No ${label(source)} listings on the search page.` }
  }

  let kept = 0
  for (const listing of listings) {
    const screening = screenListing(listing, ids)
    if (screening.keep) {
      candidates.push(listing)
      kept += 1
      continue
    }

    if (screening.scope === 'problem') {
      report.problems.push({
        ...listingRef(listing),
        stage: 'listing',
        reason: screening.reason,
        detail: null,
        googleUrl: null,
        query: null,
        cardmarketUrl: null
      })
      continue
    }

    report.outOfScope += 1
  }

  return { source, url, found: listings.length, candidates: kept, error: null }
}

function label(source: 'marktplaats' | 'vinted'): string {
  return source === 'marktplaats' ? 'Marktplaats' : 'Vinted'
}

/** Overview rows carry a clipped description and one small photo; the listing page has both in full. */
async function loadListingDetail(listing: SourceListing, fetchPage: FetchCardmarketPage): Promise<SourceListing> {
  try {
    const html = await fetchPage(listing.listingUrl)
    const detail = listing.source === 'marktplaats' ? parseMarktplaatsDetail(html) : parseVintedDetail(html)
    const description =
      detail.description && detail.description.length > (listing.description?.length ?? 0) ? detail.description : listing.description
    return {
      ...listing,
      description,
      imageUrls: detail.imageUrls.length > 0 ? detail.imageUrls : listing.imageUrls
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
  cache: previousCache,
  ownListings = [],
  marktplaatsUrl = MARKTPLAATS_SEARCH_URL,
  vintedUrl = VINTED_SEARCH_URL,
  now = new Date(),
  delayMs = FETCH_DELAY_MS
}: {
  fetchPage: FetchCardmarketPage
  readSlabs?: SlabReader
  lookupCert?: CertLookup
  cache?: DealFinderCache | null
  ownListings?: Array<{ marktplaatsUrl?: string | null; vintedUrl?: string | null }>
  marktplaatsUrl?: string
  vintedUrl?: string
  now?: Date
  delayMs?: number
}): Promise<{ report: DealFinderReport; cache: DealFinderCache }> {
  const report = emptyReport(now.toISOString())
  const cache: DealFinderCache = { entries: { ...(previousCache?.entries ?? emptyCache().entries) } }
  const ids = ownListingIds(ownListings)
  const listings: SourceListing[] = []

  for (const [source, url] of [
    ['marktplaats', marktplaatsUrl],
    ['vinted', vintedUrl]
  ] as const) {
    report.sources.push(await collectSource({ source, url, fetchPage, ids, candidates: listings, report }))
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

  for (const [index, candidate] of candidates.entries()) {
    if (index > 0) {
      await sleep(delayMs)
    }

    try {
      await evaluate({ candidate, fetchPage, readSlabs, lookupCert, cache, now, delayMs, deals, noComps, report, blocked })
    } catch (error) {
      report.problems.push({
        ...listingRef(candidate.listing),
        stage: 'price',
        reason: 'Checking this listing failed',
        detail: error instanceof Error ? error.message : String(error),
        googleUrl: null,
        query: null,
        cardmarketUrl: null
      })
    }
  }

  // Cardmarket's bot check needs a human; retry those listings once the run is over,
  // by which time the challenge in the Chrome window has usually been cleared.
  for (const pending of blocked) {
    await sleep(delayMs)
    await priceEvaluated({ evaluated: pending, fetchPage, cache, now, deals, noComps, report, retry: false })
  }

  report.deals = sortDeals(deals)
  report.noComps = sortNoComps(noComps)

  console.info(
    `[deal-finder] ${report.deals.length} deals, ${report.noComps.length} without comps, ${report.belowEdge} below €${MIN_EDGE}, ${report.problems.length} problems, ${report.fromCache} from cache`
  )

  return { report, cache: pruneCache(cache, new Set(listings.map((listing) => listing.id))) }
}

async function evaluate({
  candidate,
  fetchPage,
  readSlabs,
  lookupCert,
  cache,
  now,
  delayMs,
  deals,
  noComps,
  report,
  blocked
}: {
  candidate: Candidate
  fetchPage: FetchCardmarketPage
  readSlabs?: SlabReader
  lookupCert?: CertLookup
  cache: DealFinderCache
  now: Date
  delayMs: number
  deals: DealRow[]
  noComps: NoCompsRow[]
  report: DealFinderReport
  blocked: Evaluated[]
}): Promise<void> {
  const { listing } = candidate
  const cached = candidate.entry

  if (hasFreshPrice(cached, now, listing.ask) && cached.identity && cached.cardmarketUrl) {
    report.fromCache += 1
    bucket({
      listing,
      identity: cached.identity,
      cardmarketUrl: cached.cardmarketUrl,
      googleUrl: cached.googleUrl,
      query: cached.query,
      floor: cached.floor!,
      comps: cached.comps,
      deals,
      report
    })
    return
  }

  let identity = hasFreshIdentity(cached, now) ? cached.identity! : null
  let label = hasFreshIdentity(cached, now) ? cached.label : null
  let query = hasFreshIdentity(cached, now) ? cached.query : null
  let googleUrl = hasFreshIdentity(cached, now) ? cached.googleUrl : null
  let cardmarketUrl = hasFreshIdentity(cached, now) ? cached.cardmarketUrl : null
  let detailed = listing

  // A half-written cache entry (identity but no Cardmarket page) is repaired by redoing the lookup.
  if (!identity || !query || !googleUrl || !cardmarketUrl) {
    detailed = await loadListingDetail(listing, fetchPage)

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
      if (identified.scope === 'out-of-scope') {
        report.outOfScope += 1
      } else {
        report.problems.push({
          ...listingRef(detailed),
          stage: 'identify',
          reason: identified.reason,
          detail: identified.detail,
          googleUrl: null,
          query: null,
          cardmarketUrl: null
        })
      }
      remember(cache, detailed, now, {
        identity: null,
        label: null,
        query: null,
        googleUrl: null,
        cardmarketUrl: null,
        problem: identified.scope === 'problem' ? { stage: 'identify', reason: identified.reason, detail: identified.detail } : null
      })
      return
    }

    identity = identified.identity
    label = identified.label
    query = buildSearchQuery(identity, label)
    googleUrl = googleSearchUrl(query)

    await sleep(delayMs)
    const googleHtml = await fetchPage(googleUrl)
    cardmarketUrl = pickCardmarketProduct(googleHtml, identity)

    if (!cardmarketUrl) {
      report.problems.push({
        ...listingRef(detailed),
        stage: 'match',
        reason: 'No Cardmarket page in the Google results',
        detail: label ? `Slab reads: ${[label.year, label.setLine, label.cardName, label.varietyLine].filter(Boolean).join(' ')}` : null,
        googleUrl,
        query,
        cardmarketUrl: null
      })
      remember(cache, detailed, now, {
        identity,
        label,
        query,
        googleUrl,
        cardmarketUrl: null,
        problem: { stage: 'match', reason: 'No Cardmarket page in the Google results', detail: null }
      })
      return
    }
  }

  await priceEvaluated({
    evaluated: { listing: detailed, identity, label, query: query!, googleUrl: googleUrl!, cardmarketUrl: cardmarketUrl! },
    fetchPage,
    cache,
    now,
    deals,
    noComps,
    report,
    retry: true,
    blocked
  })
}

/** Load the Cardmarket offers page and turn it into a deal, a no-comps row or a problem. */
async function priceEvaluated({
  evaluated,
  fetchPage,
  cache,
  now,
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
    const html = await fetchPage(offersUrl, OFFERS_FETCH_OPTIONS(identity.grade))
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
  const edge = Math.round((floor - listing.ask) * 100) / 100
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
