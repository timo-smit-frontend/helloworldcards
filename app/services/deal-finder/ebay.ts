/**
 * eBay, as a link only: its sold listings sit behind a login and it forbids reading them
 * by machine, so a deal links to the sold search instead, to be opened by hand.
 */

/** eBay's category for single trading cards (CCG Individual Cards). */
const CCG_INDIVIDUAL_CARDS = '183454'

/** eBay's sold listings for a query on ebay.de, the biggest of the European sites. Needs a logged-in eBay to show anything. */
export function ebaySoldSearchUrl(query: string): string {
  const params = new URLSearchParams({ _nkw: query, _sacat: CCG_INDIVIDUAL_CARDS, LH_Sold: '1', LH_Complete: '1' })
  return `https://www.ebay.de/sch/i.html?${params}`
}
