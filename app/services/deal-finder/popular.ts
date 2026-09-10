/**
 * The characters that carry a slab.
 *
 * Two PSA 10s at the same ask are not the same buy: the card that sells itself is the
 * one whose character people search for by name. This list is that shortlist, and a
 * starred row is a hint to look at it first — never a filter. Nothing is skipped for
 * being off the list, and plenty of money is made on cards that are not on it, because
 * which printing and which art matter at least as much as which Pokémon.
 *
 * It is deliberately a flat list rather than a ranking. The star is one bit, so an
 * order would only be information the code cannot use, and alphabetical is what makes
 * "is this one on the list?" answerable at a glance.
 */
export const POPULAR_POKEMON = [
  'Absol',
  'Alakazam',
  'Arcanine',
  'Articuno',
  'Blastoise',
  'Blaziken',
  'Bulbasaur',
  'Celebi',
  'Charizard',
  'Charmander',
  'Darkrai',
  'Dialga',
  'Dragapult',
  'Dragonite',
  'Eevee',
  'Entei',
  'Espeon',
  'Flareon',
  'Garchomp',
  'Gardevoir',
  'Gengar',
  'Giratina',
  'Glaceon',
  'Greninja',
  'Gyarados',
  'Ho-Oh',
  'Jirachi',
  'Jolteon',
  'Latias',
  'Latios',
  'Leafeon',
  'Lucario',
  'Lugia',
  'Machamp',
  'Magikarp',
  'Metagross',
  'Meowth',
  'Mew',
  'Mewtwo',
  'Mimikyu',
  'Moltres',
  'Palkia',
  'Pikachu',
  'Piplup',
  'Psyduck',
  'Raikou',
  'Rayquaza',
  'Salamence',
  'Shaymin',
  'Snorlax',
  'Squirtle',
  'Suicune',
  'Sylveon',
  'Teddiursa',
  'Tyranitar',
  'Umbreon',
  'Vaporeon',
  'Venusaur',
  'Zapdos',
  'Zoroark'
] as const

/**
 * Trainers earn a star on the same terms.
 *
 * PSA prints the trainer's name on the label exactly like a Pokémon's, and a full art
 * of one of these outsells most of the second half of the Pokémon list. `N` is left
 * off on purpose: a one-letter name matches far too much to be worth the false stars.
 */
export const POPULAR_TRAINERS = ['Cynthia', 'Erika', 'Hilda', 'Iono', 'Lillie', 'Marnie', 'Misty', 'Nessa', 'Serena', 'Skyla'] as const

export const POPULAR_CHARACTERS: readonly string[] = [...POPULAR_POKEMON, ...POPULAR_TRAINERS]

/** What a starred row is prefixed with. */
export const POPULAR_STAR = '★'

/**
 * A card name split into the words worth comparing: lower case, no accents, no
 * apostrophes, and every other punctuation mark treated as a gap. `HO-OH` and `Ho-Oh`
 * both come out as `['ho', 'oh']`, and `N'S RESHIRAM` as `['ns', 'reshiram']`.
 */
function nameWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

const PATTERNS = POPULAR_CHARACTERS.map(nameWords)

function containsWords(words: string[], pattern: string[]): boolean {
  for (let start = 0; start + pattern.length <= words.length; start += 1) {
    if (pattern.every((word, offset) => words[start + offset] === word)) {
      return true
    }
  }
  return false
}

/**
 * Is this card one of the names above?
 *
 * Matching is on whole words, which is the whole trick: a card is named for its
 * character plus whatever the set did to it, so `Mega Gardevoir ex`, `Dark Charizard`
 * and `Hisuian Zoroark VSTAR` all have to count, while `Mewtwo` must never be read as
 * a `Mew`.
 */
export function isPopularCard(name: string | null | undefined): boolean {
  if (!name) {
    return false
  }
  const words = nameWords(name)
  return PATTERNS.some((pattern) => containsWords(words, pattern))
}

/**
 * A title split back into its star and the card's name.
 *
 * The star lives in the title string itself, so a row reads the same wherever it is
 * printed — a report, a log line, a page that never styles anything. The dashboard is
 * the one place that wants to colour the two apart, and this is how it takes the mark
 * off again without going looking for the character a second time.
 */
export function splitStar(title: string): { starred: boolean; title: string } {
  const prefix = `${POPULAR_STAR} `
  return title.startsWith(prefix) ? { starred: true, title: title.slice(prefix.length) } : { starred: false, title }
}
