import { getProductById, updateProduct, type CmsDb } from '../../worker/cms/db'

/**
 * Put a sold card back the way it was before its photos were cut down — two full-size
 * originals in the Slabs folder — so a test can watch the archive do its work whatever
 * state the committed seed files are in.
 */
export async function withFullPhotos(
  db: CmsDb,
  card: { id: number; title: string; front: string; back: string; frontFilename: string; backFilename: string }
): Promise<void> {
  const product = (await getProductById(db, card.id))!
  await updateProduct(db, card.id, { ...product, images: [`/media/${card.front}`, `/media/${card.back}`] })
  const folder = await db.prepare("SELECT id FROM media_folders WHERE name = 'Slabs'").first<{ id: number }>()
  for (const key of product.images.map((image) => image.replace(/^\/media\//, ''))) {
    await db.prepare('DELETE FROM media WHERE key = ?').bind(key).run()
  }
  for (const [key, filename, side] of [
    [card.front, card.frontFilename, 'front'],
    [card.back, card.backFilename, 'back']
  ] as const) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO media (key, filename, content_type, width, height, bytes, title, alt, created_at, folder_id)
         VALUES (?, ?, 'image/jpeg', NULL, NULL, 1000000, ?, ?, '2026-09-01T00:00:00.000Z', ?)`
      )
      .bind(key, filename, `${card.title}, ${side}`, `The ${side} of the ${card.title} slab.`, folder?.id ?? null)
      .run()
  }
}

/** The Crown Zenith Pikachu, sold in September 2026, as it was with both slab photos. */
export const PIKACHU_FULL = {
  id: 14,
  title: 'Pikachu',
  front: 'mu00djsz-122301454-front.jpg',
  back: 'mu00dp1r-122301454-back.jpg',
  frontFilename: '122301454_front.jpg',
  backFilename: '122301454_back.jpg'
} as const
