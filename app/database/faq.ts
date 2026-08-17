import { CONTACT_EMAIL } from '../services/contact'

export type FaqPage = 'about' | 'contact'

export type FaqItem = {
  id: number
  page: FaqPage
  question: string
  answer: string
}

const faqs: FaqItem[] = [
  {
    id: 1,
    page: 'about',
    question: 'What is Hello World Cards?',
    answer: 'A small Pokémon card and art shop run by Sam and Timo. We list what we have in stock and the events we go to.'
  },
  {
    id: 2,
    page: 'about',
    question: 'Who runs Hello World Cards?',
    answer:
      'Sam and Timo, a couple who turned a Pokémon hobby into this shop. Sam collects Wooper and Quagsire; Timo chases Gengar and Ralts.'
  },
  {
    id: 3,
    page: 'about',
    question: 'Do you have a physical shop?',
    answer: 'No walk-in storefront. We sell online and in person at Pokémon events in the Netherlands and Belgium.'
  },
  {
    id: 4,
    page: 'about',
    question: 'What do you sell?',
    answer: 'Pokémon cards (including graded cards) and Pokémon art. Browse the shop or email us about a piece.'
  },
  {
    id: 5,
    page: 'contact',
    question: 'How do I buy a card?',
    answer: `Send a message with the card you want via the contact form or email. We reply at ${CONTACT_EMAIL}.`
  },
  {
    id: 6,
    page: 'contact',
    question: 'How can I get in touch?',
    answer: 'Email, the contact form, or Instagram @helloworldcards.'
  },
  {
    id: 7,
    page: 'contact',
    question: 'Where can I meet you in person?',
    answer: 'At the events on the agenda. We bring a stall to Pokémon shows in the Netherlands and Belgium.'
  }
]

export function getAllFaqs(): FaqItem[] {
  return [...faqs]
}

export function getFaqsByPage(page: FaqPage): FaqItem[] {
  return faqs.filter((item) => item.page === page)
}
