const NAMED: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  eacute: 'é',
  egrave: 'è',
  euml: 'ë',
  ouml: 'ö',
  uuml: 'ü',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  euro: '€'
}

/**
 * Turn the entities a listing page escapes its text with back into the characters.
 *
 * Both marketplaces escape apostrophes numerically — `McDonald&#x27;s`, `Team
 * Rocket&#x27;s Mimikyu` — and decoding only the handful of named entities left those in
 * the title. From there `&#x27` went into the card name and the Google query, and
 * `x27` came back out of it as the card number: a McDonald's Pikachu was searched for
 * as card 27 and priced against a different Pikachu.
 */
export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(?:#(\d{1,7})|#x([\da-f]{1,6})|([a-z]{2,8}));/gi, (entity, decimal?: string, hex?: string, name?: string) => {
    if (decimal || hex) {
      const code = decimal ? Number(decimal) : parseInt(hex!, 16)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity
    }
    return NAMED[name!.toLowerCase()] ?? entity
  })
}
