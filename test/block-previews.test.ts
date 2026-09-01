import { describe, expect, it } from 'vitest'
import { CMS_BLOCK_PREVIEWS, CMS_COMPONENT_PREVIEW_KEYS, sortMediaLibrary } from '../app/cms/block-previews'

describe('CMS block previews', () => {
  it('maps each screenshot to the component it shows', () => {
    expect(CMS_BLOCK_PREVIEWS).toEqual({
      banner_figcaption: '/media/BannerFigcaption.jpg',
      content_text: '/media/ContentText.png',
      content_cta: '/media/ContentCta.jpg',
      content_products: '/media/ContentProducts.jpg',
      content_agenda: '/media/ContentAgenda.png',
      content_faq: '/media/ContentFaq.png',
      content_about: '/media/ContentAbout.png',
      form_contact: '/media/FormContact.png'
    })
  })

  it('keeps component screenshots at the bottom of the media library', () => {
    const items = [
      { id: 30, key: 'BannerFigcaption.jpg' },
      { id: 8, key: 'hero.jpg' },
      { id: 32, key: 'Product.png' },
      { id: 21, key: 'wooper.png' },
      { id: 29, key: 'ContentText.png' }
    ]

    expect(sortMediaLibrary(items).map((item) => item.key)).toEqual([
      'wooper.png',
      'hero.jpg',
      'BannerFigcaption.jpg',
      'ContentText.png',
      'Product.png'
    ])
  })

  it('lists every component screenshot in the order they should appear', () => {
    expect(CMS_COMPONENT_PREVIEW_KEYS).toEqual([
      'BannerFigcaption.jpg',
      'ContentText.png',
      'ContentCta.jpg',
      'ContentProducts.jpg',
      'ContentAgenda.png',
      'ContentFaq.png',
      'ContentAbout.png',
      'FormContact.png',
      'Product.png'
    ])
  })
})
