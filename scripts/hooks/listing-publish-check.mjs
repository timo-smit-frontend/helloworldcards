#!/usr/bin/env node
// Claude Code hook: nudges the assistant (and Timo) to mark a card as published in
// app/cms/seed-products.ts as soon as its Marktplaats and Vinted listings exist, and
// removes the branded ad photo from public/ads once a card is marked sold.
//
// Runs on PostToolUse for the Playwright MCP tools and on Stop. Reads the hook JSON
// from stdin and prints hook JSON on stdout. Never fails the tool call.
import { readFileSync, existsSync, unlinkSync } from 'node:fs'
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

// Every product record, with the PSA cert taken from the slab photo names: an admin
// upload (`mu00djsz-122301454-front.jpg`), a committed seed photo (`148651617_front.jpg`),
// or the small copy a sold card keeps (`…-front-sold.webp`).
function products() {
  const seed = readFileSync(seedPath, 'utf8')
  return seed.split(/\n  \{\n/).slice(1).map((block) => {
    const title = /title:\s*'([^']*)'/.exec(block)?.[1] ?? '?'
    const cert = /(\d{6,})[-_]front(?:-sold)?\.(?:jpe?g|webp)/.exec(block)?.[1]
    const adPath = cert ? resolve(root, 'public/ads', `${cert}.jpeg`) : null
    return {
      title,
      cert,
      concept: /^\s*concept:\s*true/m.test(block),
      sold: /^\s*sold:\s*true/m.test(block),
      adPath,
      adPhoto: adPath ? existsSync(adPath) : false
    }
  })
}

// A sold card's ads are deleted (see .cursor/rules/cms-inventory.mdc), so its branded
// ad photo has no use any more and only clutters public/ads. The dev server's sync does
// the same when it cuts a sold card down to its one small photo (vite/sold-photos.ts);
// this covers a card marked sold while no dev server was running.
function removeSoldAdPhotos(all) {
  const removed = []
  for (const p of all) {
    if (!p.sold || !p.adPhoto) continue
    try {
      unlinkSync(p.adPath)
      removed.push(`${p.title} (cert ${p.cert})`)
    } catch {}
  }
  return removed
}

const raw = readStdin()
let input = {}
try {
  input = JSON.parse(raw)
} catch {}

const event = input.hook_event_name
const all = products()
const removed = removeSoldAdPhotos(all)
const removedNote = removed.length ? `Removed the ad photo of sold card(s) from public/ads: ${removed.join(', ')}. ` : ''

const concepts = all.filter((p) => p.concept)
if (concepts.length === 0) {
  if (removedNote) console.log(JSON.stringify({ systemMessage: removedNote.trim() }))
  process.exit(0)
}

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
  if (urls.length === 0) {
    if (removedNote) console.log(JSON.stringify({ systemMessage: removedNote.trim() }))
    process.exit(0)
  }
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `${removedNote}Live listing URL(s) on screen: ${urls.join(', ')}. ${instruction}`
      }
    })
  )
  process.exit(0)
}

if (event === 'Stop') {
  // A branded ad photo in public/ads only exists once the listing has been prepared,
  // so concept + ad photo means the record was probably never flipped to published.
  const suspicious = concepts.filter((p) => p.adPhoto)
  if (suspicious.length === 0) {
    if (removedNote) console.log(JSON.stringify({ systemMessage: removedNote.trim() }))
    process.exit(0)
  }
  const list = suspicious.map((p) => `${p.title} (cert ${p.cert})`).join(', ')
  console.log(
    JSON.stringify({
      systemMessage:
        `${removedNote}Still concept in seed-products.ts but already has a branded ad photo: ${list}. ` +
        'If it is live on Marktplaats and Vinted, the record needs both listing URLs and no concept flag.'
    })
  )
}
