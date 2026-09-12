import { describe, expect, it } from 'vitest'
import type { CmsMedia } from '../app/cms/types'
import { countMediaByFolder, folderOfUrl, imageCountLabel, mediaInFolder, moveMediaTo, sortMediaFolders } from '../app/admin/media-folders'

function media(id: number, folderId: number | null): CmsMedia {
  return {
    id,
    key: `${id}.jpg`,
    filename: `${id}.jpg`,
    contentType: 'image/jpeg',
    width: null,
    height: null,
    bytes: 1,
    title: '',
    alt: '',
    url: `/media/${id}.jpg`,
    createdAt: '2026-09-01T00:00:00.000Z',
    folderId
  }
}

const library = [media(1, null), media(2, 7), media(3, 7), media(4, 9)]

describe('mediaInFolder', () => {
  it('shows the loose images at the top of the library', () => {
    expect(mediaInFolder(library, null).map((item) => item.id)).toEqual([1])
  })

  it('shows only the images of one folder inside it', () => {
    expect(mediaInFolder(library, 7).map((item) => item.id)).toEqual([2, 3])
  })
})

describe('countMediaByFolder', () => {
  it('counts what each folder holds and leaves loose images out', () => {
    expect([...countMediaByFolder(library).entries()]).toEqual([
      [7, 2],
      [9, 1]
    ])
  })
})

describe('moveMediaTo', () => {
  it('moves one image into a folder and leaves the rest alone', () => {
    const moved = moveMediaTo(library, 1, 9)
    expect(moved.find((item) => item.id === 1)?.folderId).toBe(9)
    expect(moved.filter((item) => item.id !== 1)).toEqual(library.filter((item) => item.id !== 1))
  })

  it('takes an image back out to the top with null', () => {
    expect(moveMediaTo(library, 2, null).find((item) => item.id === 2)?.folderId).toBeNull()
  })
})

describe('sortMediaFolders', () => {
  it('orders folders by name regardless of case, the way a file browser does', () => {
    const sorted = sortMediaFolders([
      { id: 3, name: 'banners' },
      { id: 1, name: 'Cards' },
      { id: 2, name: 'Ads' }
    ])
    expect(sorted.map((folder) => folder.name)).toEqual(['Ads', 'banners', 'Cards'])
  })
})

describe('folderOfUrl', () => {
  it('finds the folder of the image a picker currently shows', () => {
    expect(folderOfUrl(library, '/media/3.jpg')).toBe(7)
  })

  it('starts at the top for a loose or unknown image', () => {
    expect(folderOfUrl(library, '/media/1.jpg')).toBeNull()
    expect(folderOfUrl(library, '/media/missing.jpg')).toBeNull()
  })
})

describe('imageCountLabel', () => {
  it('reads naturally for one and for many', () => {
    expect(imageCountLabel(0)).toBe('0 images')
    expect(imageCountLabel(1)).toBe('1 image')
    expect(imageCountLabel(2)).toBe('2 images')
  })
})
