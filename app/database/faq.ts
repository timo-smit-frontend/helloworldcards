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
    answer:
      'A small Pokémon shop run by Sam and Timo. We list cards here and on Marktplaats, the same stock in both places. Sam paints custom binders that we show on the site and sell in person at events. There is no walk-in storefront.'
  },
  {
    id: 2,
    page: 'about',
    question: 'Who runs Hello World Cards?',
    answer:
      'Sam and Timo, a couple of programmers who collect Pokémon. Sam is a backend developer who collects Wooper and Quagsire and paints the binders. Timo is a frontend developer who chases Gengar and Ralts. The name Hello World is the programmer joke.'
  },
  {
    id: 3,
    page: 'about',
    question: 'Why is it called Hello World Cards?',
    answer:
      'Because we both write software. Sam does backend, Timo does frontend. Hello World is the first thing you print when you learn to code, so it felt like the right name for a shop that is still a hobby at heart.'
  },
  {
    id: 4,
    page: 'about',
    question: 'Do you have a physical shop?',
    answer:
      'No walk-in storefront. We sell cards online and on Marktplaats, and in person when we have a stall at Pokémon events in the Netherlands and Belgium.'
  },
  {
    id: 5,
    page: 'about',
    question: 'What do you sell?',
    answer:
      'Pokémon cards, including graded cards. They are listed here and on Marktplaats. Sam also makes custom handpainted binders. We display those on the site so you can see them, and we sell them in person at events.'
  },
  {
    id: 6,
    page: 'contact',
    question: 'How do I buy a card?',
    answer: `Browse the shop on this site. The same cards are listed on our Marktplaats page. If a product has a View on Marktplaats button, that is the listing. If it does not, email us at ${CONTACT_EMAIL} and we will help. You can always email about a card, even when there is a listing.`
  },
  {
    id: 7,
    page: 'contact',
    question: 'Can I buy a binder on the website?',
    answer:
      'You can look at them here, but we do not sell binders through the site. Sam paints them as one-off pieces. Come to an event if you want to buy one.'
  },
  {
    id: 8,
    page: 'contact',
    question: 'How can I get in touch?',
    answer:
      'Use the form on this page, email us, Instagram @helloworldcards, or our Marktplaats page. Email is the one that always works, for cards, events, binders at a stall, or anything else.'
  },
  {
    id: 9,
    page: 'contact',
    question: 'Where can I meet you in person?',
    answer:
      "When we have a stall at a Pokémon event. Those dates go on the agenda. We do not have a next event planned yet. We bring cards from the shop and Sam's handpainted binders."
  }
]

export function getAllFaqs(): FaqItem[] {
  return [...faqs]
}

export function getFaqsByPage(page: FaqPage): FaqItem[] {
  return faqs.filter((item) => item.page === page)
}
