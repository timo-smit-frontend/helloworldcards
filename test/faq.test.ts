import { describe, expect, it } from 'vitest'
import { seedFaqs } from '~/cms/seed-content'

describe('buy FAQ', () => {
  it('sends people to Marktplaats when listed and does not use email as checkout for concept cards', () => {
    const item = seedFaqs.find((faq) => faq.question === 'How do I buy a card?')

    expect(item?.answer).toContain('View on Marktplaats')
    expect(item?.answer).toContain('not yet available to buy')
    expect(item?.answer).not.toMatch(/email us/i)
    expect(item?.answer).not.toContain('@')
  })
})
