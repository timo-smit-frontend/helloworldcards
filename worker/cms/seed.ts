import { seedFaqs, seedNavItems, seedPages, seedProductWithSlug, seedSettings } from '../../app/cms/seed-content'
import { seedMediaFiles } from '../../app/cms/seed-media'
import { seedProductRecords } from '../../app/cms/seed-products'
import { imageCopyFor } from '../../app/services/imageCopy'
import {
  fillEmptyMediaCopy,
  getSettings,
  insertFaq,
  insertMediaIfAbsent,
  insertPage,
  insertProduct,
  putSettings,
  replaceNav,
  type CmsDb
} from './db'

const SEED_MEDIA_CREATED_AT = '2026-09-01T00:00:00.000Z'

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

export async function ensureSeeded(db: CmsDb): Promise<void> {
  if (!(await getSettings(db))) {
    await putSettings(db, seedSettings)
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
  }

  await rewriteLegacyImagePaths(db)
  await seedMediaLibrary(db)
}
