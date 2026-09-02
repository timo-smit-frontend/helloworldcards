import { cardmarketOffersUrl, htmlHasMarketFloor, isCardmarketChallenge, type FetchCardmarketPage } from '../cardmarket/scan'
import { parseArticleListings } from '../cardmarket/html'
import { marketFloorPrice } from '../cardmarket/grades'
import {
  CARDMARKET_FETCH_DELAY_MS,
  MARKTPLAATS_PSA_SEARCH_URL,
  MIN_DEAL_EDGE,
  VINTED_PSA_SEARCH_URL
} from './constants'
import { pickCardmarketProductUrl, googleSearchUrl } from './google-search'
import { isMarktplaatsChallenge, parseMarktplaatsOverview, type MarktplaatsOverviewListing } from './html'
import { ocrImageBytes } from './ocr'
import {
  buildGoogleCardmarketQuery,
  extractCardNumberFromOcr,
  inferSetCodeFromLabelRows,
  parsePsaLabelOcr,
  type PsaLabelData
} from './psa-label'
import {
  sortMarktplaatsDeals,
  type DealSource,
  type MarktplaatsDealRow,
  type MarktplaatsDealsReport,
  type MarktplaatsSearchLogEntry,
  type MarktplaatsSkippedRow
} from './report'
import { buildTitleFallbackQuery, buildDealDisplayTitle, filterMarktplaatsCandidates, formatDealDisplayTitle, type ParsedMarktplaatsTitle } from './titles'
import { isVintedChallenge, parseVintedOverview } from './vinted-html'

export type {
  DealSource,
  MarktplaatsDealRow,
  MarktplaatsDealsReport,
  MarktplaatsSearchLogEntry,
  MarktplaatsSkippedRow
} from './report'
export { sortMarktplaatsDeals } from './report'

type DealCandidate = MarktplaatsOverviewListing & {
  parsed: ParsedMarktplaatsTitle
  source: DealSource
}

type SearchPlan = {
  psaQuery: string
  querySource: 'label' | 'title'
  matchConfidence: 'high' | 'medium'
  language: 'english' | 'japanese'
  reverseHolo: boolean
  cardNumber: string | null
  setCode: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function truncateOcr(text: string, max = 280): string {
  const compact = text.replace(/\s+\n/g, '\n').trim()
  return compact.length <= max ? compact : `${compact.slice(0, max)}…`
}

function logSearch(entry: MarktplaatsSearchLogEntry): void {
  const source = entry.source === 'vinted' ? 'Vinted' : 'Marktplaats'
  const query = entry.psaQuery ?? '(no query)'
  const detail =
    entry.outcome === 'deal'
      ? `deal edge=€${entry.edge} floor=€${entry.marketFloor}`
      : entry.outcome === 'no-edge'
        ? `no-edge floor=€${entry.marketFloor} edge=€${entry.edge}`
        : entry.outcome === 'no-comps'
          ? `no-comps: ${entry.reason}`
          : `skip: ${entry.reason}`
  console.info(`[marktplaats-deals] ${source} | ${entry.title} | q="${query}" | → ${detail}`)
}

async function defaultFetchImage(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Image fetch failed (${response.status})`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

function toOverviewListing(
  listing: { title: string; ask: number; imageUrl: string | null; listingUrl: string },
  priceType: string
): MarktplaatsOverviewListing {
  return {
    title: listing.title,
    ask: listing.ask,
    marktplaatsUrl: listing.listingUrl,
    sellerName: null,
    priceType,
    imageUrl: listing.imageUrl
  }
}

function planFromLabel(label: PsaLabelData, parsed: ParsedMarktplaatsTitle): SearchPlan {
  return {
    psaQuery: buildGoogleCardmarketQuery(label),
    querySource: 'label',
    matchConfidence: 'high',
    language: label.japanese || parsed.language === 'japanese' ? 'japanese' : 'english',
    reverseHolo: label.reverseHolo,
    cardNumber: label.cardNumber ?? parsed.cardNumber,
    setCode: inferSetCodeFromLabelRows(label.rows) ?? parsed.setName
  }
}

function planFromTitle(parsed: ParsedMarktplaatsTitle, psaQuery: string): SearchPlan {
  return {
    psaQuery,
    querySource: 'title',
    matchConfidence: 'medium',
    language: parsed.language,
    reverseHolo: false,
    cardNumber: parsed.cardNumber,
    setCode: parsed.setName
  }
}

function resolveSearchPlan(ocrText: string | null, parsed: ParsedMarktplaatsTitle): SearchPlan | { skip: string } {
  if (ocrText) {
    const label = parsePsaLabelOcr(ocrText)
    if (label?.unsupportedLanguage) {
      return { skip: 'Not English or Japanese (PSA label)' }
    }
    if (label) {
      return planFromLabel(label, parsed)
    }
  }

  // Glare can kill the PSA header while still leaving #041 or 041/173 in the OCR dump.
  const ocrNumber = ocrText ? extractCardNumberFromOcr(ocrText) : null
  const withNumber =
    parsed.cardNumber || !ocrNumber
      ? parsed
      : { ...parsed, cardNumber: ocrNumber, cardNumberRaw: parsed.cardNumberRaw ?? ocrNumber }

  const psaQuery = buildTitleFallbackQuery(withNumber)
  if (!psaQuery) {
    return { skip: 'Could not read PSA label and no card number in title' }
  }

  return planFromTitle(withNumber, psaQuery)
}

async function evaluateCandidate({
  candidate,
  fetchPage,
  fetchImage,
  ocrImage,
  delayMs,
  deals,
  skipped,
  searches
}: {
  candidate: DealCandidate
  fetchPage: FetchCardmarketPage
  fetchImage: (url: string) => Promise<Uint8Array>
  ocrImage: (image: Uint8Array) => Promise<string>
  delayMs: number
  deals: MarktplaatsDealRow[]
  skipped: MarktplaatsSkippedRow[]
  searches: MarktplaatsSearchLogEntry[]
}): Promise<void> {
  let psaQuery: string | null = null
  let cardmarketUrl: string | null = null
  let ocrText: string | null = null
  let googleUrl: string | null = null

  const pushLog = (partial: Pick<MarktplaatsSearchLogEntry, 'outcome' | 'reason'> & Partial<MarktplaatsSearchLogEntry>) => {
    const entry: MarktplaatsSearchLogEntry = {
      title: candidate.title,
      ask: candidate.ask,
      source: candidate.source,
      listingUrl: candidate.marktplaatsUrl,
      ocrText,
      psaQuery,
      googleUrl,
      cardmarketUrl,
      marketFloor: null,
      edge: null,
      ...partial
    }
    searches.push(entry)
    logSearch(entry)
  }

  const recordSkip = (reason: string) => {
    skipped.push({
      title: candidate.title,
      ask: candidate.ask,
      reason,
      source: candidate.source,
      psaQuery,
      cardmarketUrl
    })
    pushLog({ outcome: 'skip', reason })
  }

  const pushManualRow = ({
    plan,
    offersUrl,
    pricingNote
  }: {
    plan: SearchPlan
    offersUrl: string
    pricingNote: string
  }) => {
    deals.push({
      title: candidate.title,
      displayTitle: buildDealDisplayTitle({
        title: candidate.title,
        grade: candidate.parsed.grade,
        cardmarketUrl: offersUrl
      }),
      ask: candidate.ask,
      source: candidate.source,
      marktplaatsUrl: candidate.marktplaatsUrl,
      cardmarketUrl: offersUrl,
      grade: candidate.parsed.grade,
      marketFloor: null,
      edge: null,
      basis: [],
      matchConfidence: plan.matchConfidence,
      querySource: plan.querySource,
      pricingNote,
      psaQuery: plan.psaQuery
    })
    pushLog({
      outcome: 'no-comps',
      reason: pricingNote,
      cardmarketUrl: offersUrl
    })
  }

  if (candidate.imageUrl) {
    try {
      const image = await fetchImage(candidate.imageUrl)
      ocrText = truncateOcr(await ocrImage(image))
    } catch {
      ocrText = null
    }
  }

  const resolved = resolveSearchPlan(ocrText, candidate.parsed)
  if ('skip' in resolved) {
    recordSkip(resolved.skip)
    return
  }

  const plan = resolved
  psaQuery = plan.psaQuery
  googleUrl = googleSearchUrl(plan.psaQuery)

  await sleep(delayMs)
  const googleHtml = await fetchPage(googleUrl)
  const productUrl = pickCardmarketProductUrl(googleHtml, {
    language: plan.language,
    cardNumber: plan.cardNumber,
    setCode: plan.setCode
  })
  if (!productUrl) {
    recordSkip('No Cardmarket link in Google results')
    return
  }

  cardmarketUrl = productUrl
  const offersUrl = cardmarketOffersUrl(productUrl, plan.language, {
    reverseHolo: plan.reverseHolo,
    grade: candidate.parsed.grade
  })
  await sleep(delayMs)
  const offersHtml = await fetchPage(offersUrl, {
    maxLoadMore: 10,
    stopWhen: (html) => htmlHasMarketFloor(html, 'psa', candidate.parsed.grade)
  })
  if (isCardmarketChallenge(offersHtml)) {
    recordSkip('Cardmarket blocked the offers page.')
    return
  }

  const listings = parseArticleListings(offersHtml)
  if (listings.length === 0 && !offersHtml.includes('articleRow')) {
    pushManualRow({ plan, offersUrl, pricingNote: 'No listings on Cardmarket' })
    return
  }

  const market = marketFloorPrice({
    grader: 'psa',
    grade: candidate.parsed.grade,
    listings
  })
  if (!market) {
    pushManualRow({
      plan,
      offersUrl,
      pricingNote: `No PSA ${candidate.parsed.grade} comps on Cardmarket`
    })
    return
  }

  const edge = market.floor - candidate.ask
  if (edge < MIN_DEAL_EDGE) {
    pushLog({
      outcome: 'no-edge',
      reason: `Edge €${edge} below €${MIN_DEAL_EDGE}`,
      marketFloor: market.floor,
      edge,
      cardmarketUrl: offersUrl
    })
    return
  }

  deals.push({
    title: candidate.title,
    displayTitle: buildDealDisplayTitle({
      title: candidate.title,
      grade: candidate.parsed.grade,
      cardmarketUrl: offersUrl
    }),
    ask: candidate.ask,
    source: candidate.source,
    marktplaatsUrl: candidate.marktplaatsUrl,
    cardmarketUrl: offersUrl,
    grade: candidate.parsed.grade,
    marketFloor: market.floor,
    edge,
    basis: market.basis,
    matchConfidence: plan.matchConfidence,
    querySource: plan.querySource,
    pricingNote: null,
    psaQuery: plan.psaQuery
  })
  pushLog({
    outcome: 'deal',
    reason: null,
    marketFloor: market.floor,
    edge,
    cardmarketUrl: offersUrl
  })
}

function sortDeals(deals: MarktplaatsDealRow[]): void {
  deals.splice(0, deals.length, ...sortMarktplaatsDeals(deals))
}

export async function runMarktplaatsDealsScan({
  fetchPage,
  fetchImage = defaultFetchImage,
  ocrImage = ocrImageBytes,
  searchUrl = MARKTPLAATS_PSA_SEARCH_URL,
  vintedSearchUrl = VINTED_PSA_SEARCH_URL,
  now = new Date(),
  delayMs = CARDMARKET_FETCH_DELAY_MS
}: {
  fetchPage: FetchCardmarketPage
  fetchImage?: (url: string) => Promise<Uint8Array>
  ocrImage?: (image: Uint8Array) => Promise<string>
  searchUrl?: string
  vintedSearchUrl?: string
  now?: Date
  delayMs?: number
}): Promise<MarktplaatsDealsReport> {
  const errors: string[] = []
  const skipped: MarktplaatsSkippedRow[] = []
  const searches: MarktplaatsSearchLogEntry[] = []
  const deals: MarktplaatsDealRow[] = []
  const candidates: DealCandidate[] = []

  const overviewHtml = await fetchPage(searchUrl)
  if (isMarktplaatsChallenge(overviewHtml)) {
    errors.push('Marktplaats blocked the scan (challenge page).')
  } else {
    const overview = parseMarktplaatsOverview(overviewHtml)
    if (overview.length === 0) {
      errors.push('No Marktplaats listings found in the overview.')
    } else {
      const { candidates: marktplaatsCandidates, skipped: filteredOut } = filterMarktplaatsCandidates(overview)
      skipped.push(...filteredOut.map((row) => ({ ...row, source: 'marktplaats' as const })))
      candidates.push(...marktplaatsCandidates.map((candidate) => ({ ...candidate, source: 'marktplaats' as const })))
    }
  }

  const vintedHtml = await fetchPage(vintedSearchUrl)
  if (isVintedChallenge(vintedHtml)) {
    errors.push('Vinted blocked the scan (challenge page).')
  } else {
    const vintedOverview = parseVintedOverview(vintedHtml).map((listing) =>
      toOverviewListing(
        {
          title: listing.title,
          ask: listing.ask,
          imageUrl: listing.imageUrl,
          listingUrl: listing.vintedUrl
        },
        'FIXED'
      )
    )
    if (vintedOverview.length === 0) {
      errors.push('No Vinted listings found in the overview.')
    } else {
      const { candidates: vintedCandidates, skipped: filteredOut } = filterMarktplaatsCandidates(vintedOverview)
      skipped.push(...filteredOut.map((row) => ({ ...row, source: 'vinted' as const })))
      candidates.push(...vintedCandidates.map((candidate) => ({ ...candidate, source: 'vinted' as const })))
    }
  }

  console.info(
    `[marktplaats-deals] Starting scan: ${candidates.length} candidates (${skipped.length} filtered out before OCR)`
  )

  for (const [index, candidate] of candidates.entries()) {
    if (index > 0) {
      await sleep(delayMs)
    }

    await evaluateCandidate({
      candidate,
      fetchPage,
      fetchImage,
      ocrImage,
      delayMs,
      deals,
      skipped,
      searches
    })
  }

  sortDeals(deals)

  console.info(
    `[marktplaats-deals] Done: ${deals.length} deals, ${searches.filter((s) => s.outcome === 'no-edge').length} below edge, ${deals.filter((d) => d.marketFloor == null).length} manual checks, ${searches.filter((s) => s.outcome === 'skip').length} skips`
  )

  return {
    scannedAt: now.toISOString(),
    searchUrl,
    vintedSearchUrl,
    deals,
    skipped,
    searches,
    errors
  }
}
