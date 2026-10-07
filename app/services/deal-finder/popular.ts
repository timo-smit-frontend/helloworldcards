import { POKEMON_NAMES } from './pokemon-names'

/**
 * The hundred Pokémon the deal finder looks at, most popular first. A card of any other
 * Pokémon is not looked at at all: reading its slab, finding it on Cardmarket and pricing
 * it everywhere else costs the same as for a Charizard, and it is the popular characters
 * that sell.
 *
 * The first twenty-five are GemRate's count of PSA slabs per Pokémon (January 2026): how
 * many people pay to have that character graded, which is the closest thing there is to
 * a measure of demand for slabs. The rest is a judgement — the legendaries, starters and
 * chase characters that carry a card, roughly in order. Edit freely; the order is only
 * there so the list can be cut shorter without having to be ranked again.
 */
export const TOP_POKEMON = [
  'Pikachu',
  'Charizard',
  'Mew',
  'Mewtwo',
  'Umbreon',
  'Eevee',
  'Blastoise',
  'Venusaur',
  'Zapdos',
  'Gengar',
  'Rayquaza',
  'Charmander',
  'Sylveon',
  'Espeon',
  'Gyarados',
  'Lugia',
  'Flareon',
  'Snorlax',
  'Dragonite',
  'Leafeon',
  'Vaporeon',
  'Glaceon',
  'Jolteon',
  'Squirtle',
  'Bulbasaur',
  'Greninja',
  'Lucario',
  'Mimikyu',
  'Garchomp',
  'Gardevoir',
  'Moltres',
  'Articuno',
  'Ho-Oh',
  'Suicune',
  'Giratina',
  'Arcanine',
  'Ninetales',
  'Lapras',
  'Alakazam',
  'Tyranitar',
  'Darkrai',
  'Latias',
  'Latios',
  'Celebi',
  'Jirachi',
  'Psyduck',
  'Magikarp',
  'Meowth',
  'Piplup',
  'Dialga',
  'Palkia',
  'Arceus',
  'Entei',
  'Raikou',
  'Blaziken',
  'Salamence',
  'Metagross',
  'Absol',
  'Zoroark',
  'Dragapult',
  'Machamp',
  'Shaymin',
  'Clefairy',
  'Jigglypuff',
  'Togepi',
  'Ditto',
  'Slowpoke',
  'Cubone',
  'Scizor',
  'Groudon',
  'Kyogre',
  'Deoxys',
  'Zekrom',
  'Reshiram',
  'Kyurem',
  'Zacian',
  'Miraidon',
  'Koraidon',
  'Solgaleo',
  'Lunala',
  'Haunter',
  'Gastly',
  'Raichu',
  'Pichu',
  'Typhlosion',
  'Infernape',
  'Hydreigon',
  'Milotic',
  'Teddiursa',
  'Zorua',
  'Mudkip',
  'Rowlet',
  'Cinderace',
  'Meowscarada',
  'Ceruledge',
  'Terapagos',
  'Ogerpon',
  'Charmeleon',
  'Wartortle',
  'Ivysaur'
] as const

/**
 * Trainers count on the same terms.
 *
 * PSA prints the trainer's name on the label exactly like a Pokémon's, and a full art
 * of one of these outsells most of the second half of the Pokémon list — as do their
 * Pokémon: `Lillie's Clefairy ex`, `Iono's Bellibolt ex`. `N` is left off on purpose: a
 * one-letter name matches far too much.
 */
export const POPULAR_TRAINERS = [
  'Lillie',
  'Iono',
  'Marnie',
  'Cynthia',
  'Erika',
  'Misty',
  'Serena',
  'Nessa',
  'Hilda',
  'Skyla',
  'Acerola',
  'Rosa'
] as const

export const TOP_CHARACTERS: readonly string[] = [...TOP_POKEMON, ...POPULAR_TRAINERS]

/**
 * A card name split into the words worth comparing: lower case, no accents, no
 * possessive, no apostrophes, and every other punctuation mark treated as a gap. `HO-OH`
 * and `Ho-Oh` both come out as `['ho', 'oh']`, `Iono's Bellibolt ex` as
 * `['iono', 'bellibolt', 'ex']`, and `Farfetch'd` as `['farfetchd']`.
 */
function nameWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/**
 * The pattern's words, in order, somewhere in the text's. The last one may carry an `s`:
 * sellers drop the apostrophe — `Ionos Bellibolt` is Iono's.
 */
function containsWords(words: string[], pattern: string[]): boolean {
  const last = pattern.length - 1
  for (let start = 0; start + pattern.length <= words.length; start += 1) {
    if (pattern.every((word, offset) => words[start + offset] === word || (offset === last && words[start + offset] === `${word}s`))) {
      return true
    }
  }
  return false
}

type Pattern = { name: string; words: string[] }

const TOP_PATTERNS: Pattern[] = TOP_CHARACTERS.map((name) => ({ name, words: nameWords(name) }))

const TOP_KEYS = new Set(TOP_PATTERNS.map((pattern) => pattern.words.join(' ')))

/** Every species that is not on the top list, so a title naming one can be told apart from a title naming none. */
const OTHER_PATTERNS: Pattern[] = [...new Set(POKEMON_NAMES)]
  .map((name) => ({ name, words: nameWords(name) }))
  .filter((pattern) => !TOP_KEYS.has(pattern.words.join(' ')))

function namedIn(words: string[], patterns: Pattern[]): string[] {
  return patterns.filter((pattern) => containsWords(words, pattern.words)).map((pattern) => pattern.name)
}

/**
 * Which top character a card name is, or null when it is none of them.
 *
 * Matching is on whole words, which is the whole trick: a card is named for its
 * character plus whatever the set did to it, so `Mega Gardevoir ex`, `Dark Charizard`
 * and `Hisuian Zoroark VSTAR` all count, while `Mewtwo` is never read as a `Mew`.
 *
 * A label read off a photo sometimes runs its words together — `FAMEWTWOEX` for
 * `FA/MEWTWO EX` — so a name long enough not to turn up by accident is also found
 * inside a word, the longest one winning.
 */
export function topCharacter(name: string | null | undefined): string | null {
  if (!name) {
    return null
  }
  const words = nameWords(name)
  const whole = namedIn(words, TOP_PATTERNS)
  if (whole.length > 0) {
    return whole[0]!
  }

  const letters = words.join('')
  const inside = TOP_PATTERNS.filter((pattern) => {
    const joined = pattern.words.join('')
    return joined.length >= 5 && letters.includes(joined)
  }).sort((left, right) => right.words.join('').length - left.words.join('').length)
  return inside[0]?.name ?? null
}

export function isTopCharacter(name: string | null | undefined): boolean {
  return topCharacter(name) != null
}

/** Whether a text names this character as a whole word — `Mew` is not in `Mewtwo ex`. */
export function mentionsCharacter(text: string, character: string): boolean {
  return containsWords(nameWords(text), nameWords(character))
}

/**
 * A card name read off a photo, put back together.
 *
 * Vision sometimes reads a label row as one word — `FAMEWTWOEX` — and a name like that
 * finds nothing on Google. When the character could only be found inside a word, the
 * name becomes the character plus the suffix the row ended in, which is what Google and
 * Cardmarket call the card anyway.
 */
export function tidyCardName(name: string): string {
  const character = topCharacter(name)
  if (!character || mentionsCharacter(name, character)) {
    return name
  }
  const letters = nameWords(name).join('')
  const after = letters.slice(letters.indexOf(nameWords(character).join('')) + nameWords(character).join('').length)
  const suffix = after.match(/^(vmax|vstar|gx|ex|v)$/)?.[1]
  return suffix ? `${character} ${suffix === 'ex' ? 'ex' : suffix.toUpperCase()}` : character
}

/**
 * What a listing title says about the character, before anything has been read.
 *
 * - `top`: it names a character on the list — worth reading the slab for.
 * - `other`: it names Pokémon, but none on the list — dropped before a single page is
 *   opened for it.
 * - `unknown`: it names no Pokémon at all ("PSA 10 Japanse promo") — the slab decides.
 */
export type CharacterGate = { verdict: 'top'; character: string } | { verdict: 'other'; names: string[] } | { verdict: 'unknown' }

export function characterGate(title: string): CharacterGate {
  const words = nameWords(title)
  const top = namedIn(words, TOP_PATTERNS)
  if (top.length > 0) {
    return { verdict: 'top', character: top[0]! }
  }
  const others = namedIn(words, OTHER_PATTERNS)
  return others.length > 0 ? { verdict: 'other', names: others } : { verdict: 'unknown' }
}

/** Why a card off the list was not looked at, naming what it was. */
export function offListReason(names: string[]): string {
  return `Not a top-100 Pokémon (${names.slice(0, 3).join(', ')})`
}
