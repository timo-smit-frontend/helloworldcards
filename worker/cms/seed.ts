import { seedFaqs, seedNavItems, seedPages, seedProductWithSlug, seedSettings } from '../../app/cms/seed-content'
import { seedMediaFiles } from '../../app/cms/seed-media'
import { seedProductRecords } from '../../app/cms/seed-products'
import type { CmsSettings } from '../../app/cms/types'
import { imageCopyFor } from '../../app/services/imageCopy'
import {
  batchAll,
  getSettings,
  insertPage,
  listNav,
  putSettings,
  replaceNav,
  seedMediaRows,
  upsertFaqWithId,
  upsertProductWithId,
  type CmsDb
} from './db'

const SEED_MEDIA_CREATED_AT = '2026-09-01T00:00:00.000Z'
export const CMS_SEED_VERSION = 3

/** Serialize ensureSeeded within one isolate so parallel requests cannot double-seed. */
let seedGate: Promise<void> = Promise.resolve()

/**
 * Whether a database still needs the initial seed or a one-shot migration. A caller that
 * has the settings row in hand already — every public page read has — can answer this
 * without a query of its own.
 */
export function needsSeeding(settings: CmsSettings | null): boolean {
  return !settings || (settings.cmsSeedVersion ?? 0) < CMS_SEED_VERSION
}

async function rewriteLegacyImagePaths(db: CmsDb): Promise<void> {
  await batchAll(db, [
    db.prepare("UPDATE products SET images = REPLACE(images, '/images/', '/media/')"),
    db.prepare("UPDATE pages SET blocks = REPLACE(blocks, '/images/', '/media/')"),
    db.prepare("UPDATE pages SET seo_image = REPLACE(seo_image, '/images/', '/media/') WHERE seo_image IS NOT NULL"),
    db.prepare("UPDATE settings SET json = REPLACE(json, '/images/', '/media/')")
  ])
}

async function seedMediaLibrary(db: CmsDb): Promise<void> {
  await seedMediaRows(
    db,
    seedMediaFiles.map((file) => {
      const copy = imageCopyFor(`/media/${file.key}`)
      return {
        key: file.key,
        filename: file.filename,
        contentType: file.contentType,
        width: null,
        height: null,
        bytes: file.bytes,
        title: copy?.title ?? '',
        alt: copy?.alt ?? '',
        createdAt: SEED_MEDIA_CREATED_AT,
        folderId: null
      }
    })
  )
}

/**
 * Push seed inventory into an existing CMS database, keeping each product's seed id.
 * The write is an upsert on that id: a product added to the seed file is created rather
 * than skipped, and one that is already there — including one sitting in the trash — is
 * updated in place instead of being duplicated under a fresh autoincrement id.
 */
export async function syncSeedProducts(db: CmsDb): Promise<void> {
  for (const product of seedProductRecords) {
    await upsertProductWithId(db, product.id, seedProductWithSlug(product))
  }
}

async function dedupeNavItems(db: CmsDb): Promise<void> {
  const nav = await listNav(db)
  const seen = new Set<string>()
  const unique: Array<Omit<(typeof nav)[number], 'id'>> = []

  for (const item of nav) {
    const key = `${item.location}\0${item.href}\0${item.label}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    unique.push({ location: item.location, label: item.label, href: item.href, sort: item.sort })
  }

  if (unique.length === nav.length) {
    return
  }

  const sorted = (['header', 'footer'] as const).flatMap((location) =>
    unique.filter((item) => item.location === location).map((item, index) => ({ ...item, sort: index }))
  )
  await replaceNav(db, sorted)
}

const seedMigrations: Record<number, (db: CmsDb) => Promise<void>> = {
  1: async (db) => {
    await rewriteLegacyImagePaths(db)
    await seedMediaLibrary(db)
  },
  2: async (db) => {
    await seedMediaLibrary(db)
    await syncSeedProducts(db)
  },
  3: async (db) => {
    await dedupeNavItems(db)
  }
}

async function seedEmptyDatabase(db: CmsDb): Promise<void> {
  await replaceNav(db, seedNavItems)

  // Seed rows carry the ids the seed files and page blocks refer to, so they are
  // written explicitly rather than left to autoincrement.
  for (const product of seedProductRecords) {
    await upsertProductWithId(db, product.id, seedProductWithSlug(product))
  }

  for (const faq of seedFaqs) {
    await upsertFaqWithId(db, faq.id, { question: faq.question, answer: faq.answer })
  }

  for (const page of seedPages) {
    await insertPage(db, page)
  }

  await seedMediaLibrary(db)
}

async function ensureSeededUnlocked(db: CmsDb): Promise<void> {
  // A read first: the settings row is there on every request but the very first, and a
  // read is cheap where a write — even one that changes nothing — is not.
  const settings = await getSettings(db)

  if (!settings) {
    // Claim the empty database atomically so a second isolate cannot also run the seed.
    const claim = await db
      .prepare('INSERT OR IGNORE INTO settings (id, json) VALUES (1, ?)')
      .bind(JSON.stringify({ ...seedSettings, cmsSeedVersion: CMS_SEED_VERSION }))
      .run()
    if (claim.meta.changes === 1) {
      await seedEmptyDatabase(db)
    }
    return
  }

  const version = settings.cmsSeedVersion ?? 0
  if (version < CMS_SEED_VERSION) {
    for (let next = version + 1; next <= CMS_SEED_VERSION; next += 1) {
      await seedMigrations[next]?.(db)
    }
    await putSettings(db, { ...settings, cmsSeedVersion: CMS_SEED_VERSION })
  }
}

/**
 * Make sure the database holds the seed content and every one-shot migration. Pass the
 * settings row when it has just been read: a database that is up to date is then
 * confirmed without any query at all, which is the case on every request but the first.
 */
export async function ensureSeeded(db: CmsDb, known?: CmsSettings | null): Promise<void> {
  if (known !== undefined && !needsSeeding(known)) {
    return
  }

  const previous = seedGate
  let release!: () => void
  seedGate = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    // Re-read under the gate rather than trusting the caller's copy: the request that
    // held the gate before this one may have just done the work.
    await ensureSeededUnlocked(db)
  } finally {
    release()
  }
}
