import { describe, expect, it } from 'vitest'
import { MAX_PRODUCT_IMAGES, removeMediaUrl, toggleMediaSelection } from '../app/admin/media-selection'

describe('toggleMediaSelection', () => {
  it('appends a newly chosen url so selection order is kept', () => {
    expect(toggleMediaSelection(['/media/front.jpg'], '/media/back.jpg')).toEqual(['/media/front.jpg', '/media/back.jpg'])
  })

  it('deselects a url without reordering the rest', () => {
    expect(toggleMediaSelection(['/media/a.jpg', '/media/b.jpg', '/media/c.jpg'], '/media/b.jpg')).toEqual(['/media/a.jpg', '/media/c.jpg'])
  })

  it('does not add another image once the max is reached', () => {
    const full = Array.from({ length: MAX_PRODUCT_IMAGES }, (_, index) => `/media/${index}.jpg`)
    expect(toggleMediaSelection(full, '/media/extra.jpg')).toEqual(full)
  })

  it('still deselects when the selection is already at the max', () => {
    const full = Array.from({ length: MAX_PRODUCT_IMAGES }, (_, index) => `/media/${index}.jpg`)
    expect(toggleMediaSelection(full, '/media/0.jpg')).toEqual(full.slice(1))
  })
})

describe('removeMediaUrl', () => {
  it('drops one chosen image and leaves the others', () => {
    expect(removeMediaUrl(['/media/front.jpg', '/media/back.jpg'], '/media/front.jpg')).toEqual(['/media/back.jpg'])
  })

  it('returns an empty list when the last image is removed', () => {
    expect(removeMediaUrl(['/media/front.jpg'], '/media/front.jpg')).toEqual([])
  })
})
