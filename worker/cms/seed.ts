import { seedFaqs, seedNavItems, seedPages, seedProductWithSlug, seedSettings } from '../../app/cms/seed-content'
import { seedMediaFiles } from '../../app/cms/seed-media'
import { seedProductRecords } from '../../app/cms/seed-products'
import { imageCopyFor } from '../../app/services/imageCopy'
import {
  fillEmptyMediaCopy,
  getProductById,
  getSettings,
  insertFaq,
  insertMediaIfAbsent,
  insertPage,
  insertProduct,
  listNav,
  putSettings,
  replaceNav,
  updateProduct,
  type CmsDb
} from './db'

const SEED_MEDIA_CREATED_AT = '2026-09-01T00:00:00.000Z'
export const CMS_SEED_VERSION = 3

/** Serialize ensureSeeded within one isolate so parallel requests cannot double-seed. */
let seedGate: Promise<void> = Promise.resolve()

async function rewriteLegacyImagePaths(db: CmsDb): Promise<void> {
  await db.prepare("UPDATE products SET images = REPLACE(images, '/images/', '/media/')").run()
  await db.prepare("UPDATE pages SET blocks = REPLACE(blocks, '/images/', '/media/')").run()
  await db.prepare("UPDATE pages SET seo_image = REPLACE(seo_image, '/images/', '/media/') WHERE seo_image IS NOT NULL").run()
  await db.prepare("UPDATE settings SET json = REPLACE(json, '/images/', '/media/')").run()
}

async function seedMediaLibrary(db: CmsDb): Promise<void> {
  for (const file of seedMediaFiles) {
    const copy = imageCopyFor(`/media/${file.key}`)
    const title = copy?.title ?? ''
    const alt = copy?.alt ?? ''
    await insertMediaIfAbsent(db, {
      key: file.key,
      filename: file.filename,
      contentType: file.contentType,
      width: null,
      height: null,
      bytes: file.bytes,
      title,
      alt,
      createdAt: SEED_MEDIA_CREATED_AT
    })
    await fillEmptyMediaCopy(db, file.key, title, alt)
  }
}

/** Push seed inventory into an existing CMS database (by product id). Used after seed file edits. */
export async function syncSeedProducts(db: CmsDb): Promise<void> {
  for (const product of seedProductRecords) {
    const seeded = seedProductWithSlug(product)
    const existing = await getProductById(db, product.id)
    if (existing) {
      await updateProduct(db, product.id, seeded)
    } else {
      await insertProduct(db, seeded)
    }
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
    unique
      .filter((item) => item.location === location)
      .map((item, index) => ({ ...item, sort: index }))
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

async function ensureSeededUnlocked(db: CmsDb): Promise<void> {
  // Claim empty DB atomically so a second isolate cannot also run the initial seed.
  const claim = await db
    .prepare('INSERT OR IGNORE INTO settings (id, json) VALUES (1, ?)')
    .bind(JSON.stringify({ ...seedSettings, cmsSeedVersion: CMS_SEED_VERSION }))
    .run()

  if (claim.meta.changes === 1) {
    await replaceNav(db, seedNavItems)

    for (const product of seedProductRecords) {
      await insertProduct(db, seedProductWithSlug(product))
    }

    for (const faq of seedFaqs) {
      await insertFaq(db, { question: faq.question, answer: faq.answer })
    }

    for (const page of seedPages) {
      await insertPage(db, page)
    }

    await seedMediaLibrary(db)
    return
  }

  const settings = (await getSettings(db))!
  const version = settings.cmsSeedVersion ?? 0
  if (version < CMS_SEED_VERSION) {
    for (let next = version + 1; next <= CMS_SEED_VERSION; next += 1) {
      await seedMigrations[next]?.(db)
    }
    await putSettings(db, { ...settings, cmsSeedVersion: CMS_SEED_VERSION })
  }
}

export async function ensureSeeded(db: CmsDb): Promise<void> {
  const previous = seedGate
  let release!: () => void
  seedGate = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    await ensureSeededUnlocked(db)
  } finally {
    release()
  }
}
