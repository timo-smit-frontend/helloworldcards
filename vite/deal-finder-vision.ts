import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import * as z from 'zod'
import { VISION_MODEL } from '../app/services/deal-finder/constants'
import { normalizePsaLabel } from '../app/services/deal-finder/psa-label'
import type { SlabReader } from '../app/services/deal-finder/scan'
import type { SlabReading } from '../app/services/deal-finder/types'

/** Anthropic accepts these four; anything else has to be skipped. */
const MEDIA_TYPES: Record<string, 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp'
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const SlabSchema = z.object({
  certNumber: z.string().nullable().describe('The 8-9 digit certification number under the barcode'),
  year: z.string().nullable().describe('The year at the start of the first row'),
  setLine: z.string().nullable().describe('The rest of the first row: brand, set/era code and language token'),
  cardName: z.string().nullable().describe("The second row: the card name, including prefixes such as FA/ or N'S"),
  varietyLine: z.string().nullable().describe('The third row: set, subset or rarity'),
  cardNumber: z.string().nullable().describe('The number printed after # at the right of the first row'),
  language: z.enum(['english', 'japanese', 'other']).nullable(),
  languageLabel: z.string().nullable().describe('The language token exactly as printed, e.g. EN, JPN., IT'),
  grade: z.number().nullable().describe('The numeric grade at the right of the third row'),
  reverseHolo: z.boolean(),
  firstEdition: z.boolean()
})

const ReadingSchema = z.object({
  slabs: z.array(SlabSchema).describe('One entry per distinct PSA slab visible across the photos'),
  note: z.string().nullable().describe('Anything that stopped you reading a label, or null')
})

/**
 * What a PSA label prints, row by row. Everything here is what the slab itself
 * shows — the model is told to transcribe, never to infer the card from the artwork.
 */
const SYSTEM_PROMPT = `You read PSA grading labels off photos of slabbed Pokémon cards.

A PSA label has four rows:
  Row 1  the year, the brand (POKEMON), the set or era code, and a language token.
         The card number is printed on the right of this row after a "#".
         Examples: "2021 POKEMON SWSH BSP  #145", "2022 POKEMON JPN. SV-P  #001",
                   "2024 POKEMON TEF EN  #212", "2025 POKEMON SVP IT  #173".
         No language token means the card is English.
  Row 2  the card name, sometimes with a variety prefix such as FA/ (full art),
         REV.FOIL, or an owner prefix such as N'S or STEVEN'S.
         The grade word (GEM MT, MINT, NM-MT) is printed on the right of this row.
  Row 3  the set, subset or rarity, e.g. "SPECIAL ART RARE", "SHINY STAR V",
         "CLBRTNS.ULTRA-PREM.COLL". The numeric grade is on the right of this row.
  Row 4  a barcode with the 8 to 9 digit certification number.

Rules:
- Transcribe exactly what is printed. Never guess a card from its artwork, and never
  complete a row you cannot actually read — leave that field null instead.
- Read every distinct slab in the photos and return one entry per slab. The same slab
  photographed from several angles is one entry. Different certification numbers mean
  different slabs.
- Photos may show the back of the slab, a raw card, or no slab at all. Return an empty
  list in that case and say so in the note.
- The certification number matters most: it identifies the card exactly. Take extra care
  with it, and return null rather than a digit you are unsure of.`

export function createSlabReader({
  apiKey,
  model = process.env.DEAL_FINDER_VISION_MODEL ?? VISION_MODEL,
  effort = (process.env.DEAL_FINDER_VISION_EFFORT as 'low' | 'medium' | 'high' | undefined) ?? 'medium'
}: {
  apiKey: string
  model?: string
  effort?: 'low' | 'medium' | 'high'
}): SlabReader {
  const client = new Anthropic({ apiKey })

  return async ({ listing, imageUrls }): Promise<SlabReading> => {
    const images = await loadImages(imageUrls)
    if (images.length === 0) {
      return { slabs: [], note: 'No usable photos on the listing.' }
    }

    const response = await client.messages.parse({
      model,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      output_config: { effort, format: zodOutputFormat(ReadingSchema) },
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((image) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: image.mediaType, data: image.data }
            })),
            {
              type: 'text' as const,
              // The seller's own words help disambiguate a smudged row, but the label wins.
              text: `Read the PSA labels in these ${images.length} photo(s).\n\nThe seller titled the listing: ${listing.title}`
            }
          ]
        }
      ]
    })

    const parsed = response.parsed_output
    if (!parsed) {
      return { slabs: [], note: 'The label reader returned nothing usable.' }
    }

    return {
      slabs: parsed.slabs.map((slab) => normalizePsaLabel(slab)),
      note: parsed.note
    }
  }
}

function mediaTypeFor(url: string, contentType: string | null): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null {
  const declared = contentType?.split(';')[0]?.trim().toLowerCase()
  if (declared && Object.values(MEDIA_TYPES).includes(declared as 'image/jpeg')) {
    return declared as 'image/jpeg'
  }
  const extension = new URL(url).pathname.split('.').pop()?.toLowerCase() ?? ''
  return MEDIA_TYPES[extension] ?? null
}

async function loadImages(
  urls: string[]
): Promise<Array<{ mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string }>> {
  const images: Array<{ mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string }> = []

  for (const url of urls) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        continue
      }
      const mediaType = mediaTypeFor(url, response.headers.get('content-type'))
      if (!mediaType) {
        continue
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
        continue
      }
      images.push({ mediaType, data: Buffer.from(bytes).toString('base64') })
    } catch {
      // One unreachable photo should not cost us the listing.
    }
  }

  return images
}
