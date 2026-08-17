import { CONTACT_EMAIL, MARKTPLAATS_URL } from '../services/contact'

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
    answer: 'A small Pokémon shop run by Sam and Timo. We list cards here and on Marktplaats, and we bring handpainted binders to events.'
  },
  {
    id: 2,
    page: 'about',
    question: 'Who runs Hello World Cards?',
    answer:
      'Sam and Timo, a couple of programmers who collect Pokémon. Sam collects Wooper and Quagsire and paints the binders. Timo chases Gengar and Ralts.'
  },
  {
    id: 3,
    page: 'about',
    question: 'Do you have a physical shop?',
    answer:
      'No walk-in storefront. We sell cards online and on Marktplaats, and in person at Pokémon events in the Netherlands and Belgium.'
  },
  {
    id: 4,
    page: 'about',
    question: 'What do you sell?',
    answer:
      "Pokémon cards, including graded cards, listed here and on Marktplaats. Sam's custom handpainted binders come with us to events."
  },
  {
    id: 5,
    page: 'contact',
    question: 'How do I buy a card?',
    answer: `Cards are listed here and on Marktplaats (${MARKTPLAATS_URL}). If the product page has a Marktplaats link, that's the listing. If it doesn't, email us at ${CONTACT_EMAIL}. You can always email about anything.`
  },
  {
    id: 6,
    page: 'contact',
    question: 'How can I get in touch?',
    answer: 'Email, the contact form, Instagram @helloworldcards, or our Marktplaats page.'
  },
  {
    id: 7,
    page: 'contact',
    question: 'Where can I meet you in person?',
    answer: "At the events on the agenda. We bring a stall with cards and Sam's handpainted binders."
  }
]

export function getAllFaqs(): FaqItem[] {
  return [...faqs]
}

export function getFaqsByPage(page: FaqPage): FaqItem[] {
  return faqs.filter((item) => item.page === page)
}
