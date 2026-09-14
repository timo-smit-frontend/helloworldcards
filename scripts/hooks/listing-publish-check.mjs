#!/usr/bin/env node
// Claude Code hook: nudges the assistant (and Timo) to mark a card as published in
// app/cms/seed-products.ts as soon as its Marktplaats and Vinted listings exist.
//
// Runs on PostToolUse for the Playwright MCP tools and on Stop. Reads the hook JSON
// from stdin and prints hook JSON on stdout. Never fails the tool call.
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const seedPath = resolve(root, 'app/cms/seed-products.ts')

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

// Products still marked concept, with the PSA cert taken from the slab photo names.
function conceptProducts() {
  const seed = readFileSync(seedPath, 'utf8')
  const out = []
  for (const block of seed.split(/\n  \{\n/).slice(1)) {
    if (!/^\s*concept:\s*true/m.test(block)) continue
    const title = /title:\s*'([^']*)'/.exec(block)?.[1] ?? '?'
    const cert = /-(\d{6,})-front\.jpg/.exec(block)?.[1]
    const adPhoto = cert ? existsSync(resolve(root, 'public/ads', `${cert}.jpeg`)) : false
    out.push({ title, cert, adPhoto })
  }
  return out
}

const raw = readStdin()
let input = {}
try {
  input = JSON.parse(raw)
} catch {}

const concepts = conceptProducts()
if (concepts.length === 0) process.exit(0)

const event = input.hook_event_name
const names = concepts.map((p) => `"${p.title}"`).join(', ')
const instruction =
  `Concept products in app/cms/seed-products.ts: ${names}. ` +
  'The moment a card is live on BOTH Marktplaats and Vinted, in the same task and without ' +
  'being asked: add marktplaatsUrl (https://www.marktplaats.nl/seller/view/m…) and vintedUrl ' +
  '(https://www.vinted.nl/items/…) to its record and remove `concept: true`. The running dev ' +
  'server syncs it; otherwise run `npx vite-node scripts/cms-sync.mts --remote --products`. ' +
  'Timo clicks publish himself, so ask him for the two listing URLs if you do not have them.'

if (event === 'PostToolUse') {
  const urls = [
    ...new Set(
      (raw.match(/https:\/\/www\.(?:marktplaats\.nl\/seller\/view\/m\d+|vinted\.nl\/items\/\d+)/g) ?? [])
    )
  ]
  if (urls.length === 0) process.exit(0)
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `Live listing URL(s) on screen: ${urls.join(', ')}. ${instruction}`
      }
    })
  )
  process.exit(0)
}

if (event === 'Stop') {
  // A branded ad photo in public/ads only exists once the listing has been prepared,
  // so concept + ad photo means the record was probably never flipped to published.
  const suspicious = concepts.filter((p) => p.adPhoto)
  if (suspicious.length === 0) process.exit(0)
  const list = suspicious.map((p) => `${p.title} (cert ${p.cert})`).join(', ')
  console.log(
    JSON.stringify({
      systemMessage:
        `Still concept in seed-products.ts but already has a branded ad photo: ${list}. ` +
        'If it is live on Marktplaats and Vinted, the record needs both listing URLs and no concept flag.'
    })
  )
}
