import { uniqueProductSlug, type ProductRecord } from '../database/products'
import { seedProductRecords } from './seed-products'
import { SITE_DESCRIPTION, SITE_IMAGE, SITE_NAME } from '../seo/site'
import { CONTACT_EMAIL, INSTAGRAM_URL, MARKTPLAATS_URL } from '../services/contact'
import { SITE_IMAGE_ALT } from '../services/imageCopy'
import type { CmsBlock, CmsFaq, CmsNavItem, CmsPage, CmsSettings } from './types'

export const seedSettings: CmsSettings = {
  siteDescription: SITE_DESCRIPTION,
  siteImage: SITE_IMAGE,
  siteImageAlt: SITE_IMAGE_ALT,
  contactEmail: CONTACT_EMAIL,
  instagramUrl: INSTAGRAM_URL,
  marktplaatsUrl: MARKTPLAATS_URL,
  notFoundTitle: 'This page was not found',
  notFoundDescription: 'This page does not exist or has been moved.',
  notFoundCta: 'Back to home'
}

export const seedNavItems: Array<Omit<CmsNavItem, 'id'>> = [
  { location: 'header', label: 'Products', href: '/products/', sort: 0 },
  { location: 'header', label: 'Agenda', href: '/agenda/', sort: 1 },
  { location: 'header', label: 'About', href: '/about/', sort: 2 },
  { location: 'header', label: 'Contact', href: '/contact/', sort: 3 },
  { location: 'footer', label: 'Products', href: '/products/', sort: 0 },
  { location: 'footer', label: 'Agenda', href: '/agenda/', sort: 1 },
  { location: 'footer', label: 'About', href: '/about/', sort: 2 },
  { location: 'footer', label: 'Contact', href: '/contact/', sort: 3 }
]

export const seedFaqs: Array<Omit<CmsFaq, 'id'> & { id: number }> = [
  {
    id: 1,
    question: 'What is Hello World Cards?',
    answer:
      "A small Pokémon card shop. I'm Timo, and I list every card here, on Marktplaats and on Vinted: the same stock in all three places. There is no walk-in storefront."
  },
  {
    id: 2,
    question: 'Who runs Hello World Cards?',
    answer:
      "I do. I'm Timo, a frontend developer who collects Pokémon and chases Gengar and Ralts. My partner Sam shares the hobby, collects Wooper and Quagsire, and comes along to events."
  },
  {
    id: 3,
    question: 'Why is it called Hello World Cards?',
    answer:
      'Because I write software for a living. Hello World is the first thing you print when you learn to code, so it felt like the right name for a shop that is still a hobby at heart.'
  },
  {
    id: 4,
    question: 'Do you have a physical shop?',
    answer:
      'No walk-in storefront. I sell cards here, on Marktplaats and on Vinted, and in person when I have a stall at a Pokémon event in the Netherlands or Belgium.'
  },
  {
    id: 5,
    question: 'What do you sell?',
    answer:
      'Graded Pokémon cards. Every card is listed here, on Marktplaats and on Vinted, and I bring them along when I have a stall at an event.'
  },
  {
    id: 6,
    question: 'How do I buy a card?',
    answer:
      'Browse the shop on this site. If a card has a View on Marktplaats button, that is the listing and you buy it there. Every card is on Vinted too, if you would rather buy there. If the button says it is not yet available to buy, the card is on the site but not for sale yet. Email and the contact form are for questions, not for buying.'
  },
  {
    id: 7,
    question: 'What does it mean when a card says Sold?',
    answer:
      'The card has found a buyer and is on its way to its new owner, so it can no longer be bought. It stays on the site for a little while before it leaves the shop.'
  },
  {
    id: 8,
    question: 'How can I get in touch?',
    answer:
      'Use the form on this page, email me, or find me on Instagram @helloworldcards or my Marktplaats page. Email is the one that always works, for a card, an event, or anything else.'
  },
  {
    id: 9,
    question: 'Where can I meet you in person?',
    answer: 'At a Pokémon event, when I have a stall. Those dates go on the agenda. I bring cards from the shop, and Sam comes along too.'
  }
]

function block<T extends CmsBlock>(block: T): T {
  return block
}

const CONTACT_CTA = 'Questions about a card, an event, or anything else? Send me a message.'

const homeBlocks: CmsBlock[] = [
  block({
    id: 'home-banner',
    type: 'banner_figcaption',
    title: 'Hello World Cards',
    srTitle: 'Hello World Cards: graded Pokémon cards and events',
    description:
      'Welcome. I sell graded Pokémon cards, here and on Marktplaats and Vinted. Have a look around, and let me know if you need anything.',
    image: '/media/hero.jpg',
    link: { url: '/products/', title: 'See the cards' },
    figcaption: 'This is my little corner of the world'
  }),
  block({
    id: 'home-hello',
    type: 'content_text',
    title: '<Hello world />',
    srTitle: 'Timo, the programmer behind Hello World Cards',
    description:
      "I'm Timo, a frontend developer who never quite grew out of Pokémon. Hello World is the first thing you print when you learn to code, so that's what the shop is called. My partner Sam, the Wooper fan, shares the hobby and comes along to events.",
    image: '/media/wooper.png',
    link: { url: '/about/', title: 'More about the shop' }
  }),
  block({
    id: 'home-products',
    type: 'content_products',
    title: 'Cards from the shop',
    description: 'A few of the cards in stock right now. Every one is also listed on Marktplaats and Vinted.',
    random: true
  }),
  block({
    id: 'home-stall',
    type: 'content_text',
    title: 'Cards online, a stall at events',
    description:
      'Every card is listed here, on Marktplaats and on Vinted. When I have a stall at a Pokémon event, the cards come along, and so does Sam. Come say hi.',
    image: '/media/wooper.png',
    link: { url: '/agenda/', title: 'See upcoming events' }
  }),
  block({
    id: 'home-cta',
    type: 'content_cta',
    title: 'Want to get in touch?',
    description: 'Questions about a card, an event, or anything else? Send me an email. I read everything.',
    image: '/media/hero.jpg',
    link: {
      url: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Question from Hello World Cards')}`,
      title: 'Get in touch'
    }
  })
]

const aboutBlocks: CmsBlock[] = [
  block({
    id: 'about-banner',
    type: 'banner_figcaption',
    title: 'Hello from Hello World Cards',
    description:
      "I'm Timo, and this little shop is what my Pokémon hobby turned into. You'll find cards online, the events I'm heading to, and a stall when Sam and I are out.",
    image: SITE_IMAGE,
    figcaption: 'This is us in our natural habitat.'
  }),
  block({
    id: 'about-people',
    type: 'content_about',
    title: 'A hobby that turned into a little shop',
    description:
      "I never quite grew out of Pokémon, and I write software for a living, which is why the shop is called Hello World Cards. I list every card here, on Marktplaats and on Vinted, and put the events I'm heading to on the agenda. My partner Sam shares the hobby and comes along to those events.",
    peopleCaption: 'Two nerds who never quite outgrew Pokémon.',
    people: [
      {
        name: 'Timo',
        pokemonIds: [94, 280, 186, 330, 285, 150],
        description:
          'Frontend developer who has been after Gengar and Ralts for years. Ghosts, psychics, and a few odd frogs are a forever chase. Mewtwo still stops a scroll, Shroomish is an easy yes, and Flygon and Politoed are the ones that make an event stall last a little longer than it should. A Gengar or Ralts full art almost never gets walked past at a table. Timo runs the shop, from the listings to the site itself.'
      },
      {
        name: 'Sam',
        pokemonIds: [194, 195, 143, 151, 54, 79],
        description:
          "Backend developer, and a die-hard Wooper and Quagsire collector. The muddy, dopey Water-types are a forever chase. Psyduck and Slowpoke live in the same pile, Snorlax too: same sleepy energy as Sam. Mew shows up whenever the art is too pretty to skip, and cute or pretty full arts almost never get walked past at a table. Sam is Timo's partner, and comes along to events mostly to find the next Wooper."
      }
    ]
  }),
  block({
    id: 'about-stall',
    type: 'content_text',
    title: 'What I bring to a stall',
    description:
      "Cards from the shop, the same ones you'll find here, on Marktplaats and on Vinted, so you can browse before you come. Sam comes along too, so there's always someone to talk Pokémon with.",
    image: '/media/wooper.png',
    link: { url: '/agenda/', title: 'See upcoming events' }
  }),
  block({
    id: 'about-faq',
    type: 'content_faq',
    faqIds: [1, 2, 3, 4, 5]
  }),
  block({
    id: 'about-cta',
    type: 'content_cta',
    title: 'Want to get in touch?',
    description: CONTACT_CTA,
    image: SITE_IMAGE,
    link: { url: '/contact/', title: 'Get in touch' }
  })
]

const agendaBlocks: CmsBlock[] = [
  block({
    id: 'agenda-list',
    type: 'content_agenda',
    title: 'Upcoming Pokémon events',
    description:
      'When I have a stall at a Pokémon event, the date and place will be here. Come say hi, browse the cards, and talk Pokémon with Sam and me.'
  }),
  block({
    id: 'agenda-stall',
    type: 'content_text',
    title: "What you'll find at the stall",
    description:
      'Cards from the shop. They are listed here, on Marktplaats and on Vinted, so you can browse before you come. If you have a question before an event, email is always fine.',
    image: '/media/wooper.png',
    link: { url: '/products/', title: 'See the cards' }
  }),
  block({
    id: 'agenda-cta',
    type: 'content_cta',
    title: 'Want to get in touch?',
    description: CONTACT_CTA,
    image: SITE_IMAGE,
    link: { url: '/contact/', title: 'Get in touch' }
  })
]

const productsBlocks: CmsBlock[] = [
  block({
    id: 'products-grid',
    type: 'content_products',
    title: 'All the cards in the shop',
    description:
      'Graded Pokémon cards I have right now. Each one is also listed on Marktplaats and Vinted, so browse here and buy through the listing when one is up.'
  }),
  block({
    id: 'products-cta',
    type: 'content_cta',
    title: 'Want to see a card in person?',
    description: 'Come by the stall at a Pokémon event. I bring cards from the shop, and Sam comes along too.',
    image: SITE_IMAGE,
    link: { url: '/agenda/', title: 'See upcoming events' }
  })
]

const contactBlocks: CmsBlock[] = [
  block({
    id: 'contact-form',
    type: 'form_contact',
    title: 'Get in touch',
    description:
      'Questions about a card, an event, or anything else? Send me a message. Email is always fine, even if a card is also on Marktplaats or Vinted.'
  }),
  block({
    id: 'contact-faq',
    type: 'content_faq',
    faqIds: [6, 7, 8, 9]
  })
]

const privacyBlocks: CmsBlock[] = [
  block({
    id: 'privacy-text',
    type: 'content_text',
    heading: 'h1',
    title: 'Privacy statement',
    description:
      'Hello World Cards is a small Pokémon card shop run by Timo. This page says what happens when you visit the site or send me a message, including through the contact form.',
    image: '/media/wooper.png',
    updated: '25 September 2026',
    sections: [
      {
        title: 'Who I am',
        body: `I'm Timo, and I run Hello World Cards. I list Pokémon cards here, on Marktplaats and on Vinted, and put the events I go to on the agenda. You can reach me at [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}).`
      },
      {
        title: 'Messages you send me',
        body: 'If you use the contact form or email me, I receive your name, email address, and message so I can reply. I do not sell that information or use it for ads. If you want a message deleted, email me and I will remove it.'
      },
      {
        title: 'Google Tag Manager',
        body: "I use Google Tag Manager to add measurement tools to the site. It may set cookies and load other Google tags. See [Google's privacy policy](https://policies.google.com/privacy)."
      },
      {
        title: 'Microsoft Clarity',
        body: "I use Microsoft Clarity to see how people move around the shop. Clarity uses cookies. See [Microsoft's privacy statement](https://privacy.microsoft.com/privacystatement) and [Clarity's terms](https://clarity.microsoft.com/terms)."
      },
      {
        title: 'Cookies',
        body: 'Google Tag Manager and Microsoft Clarity may store cookies in your browser. You can block or delete cookies in your browser settings. The shop will still work.'
      }
    ]
  })
]

export const seedPages: Array<Omit<CmsPage, 'id'>> = [
  {
    path: '/',
    status: 'published',
    title: 'Home',
    seoTitle: `${SITE_NAME} | Graded Pokémon cards and events`,
    seoDescription: SITE_DESCRIPTION,
    seoImage: SITE_IMAGE,
    blocks: homeBlocks
  },
  {
    path: '/products',
    status: 'published',
    title: 'Shop',
    seoTitle: `Graded Pokémon cards for sale | ${SITE_NAME}`,
    seoDescription:
      'PSA and BGS graded Pokémon cards for sale, in English and Japanese. Every card is also listed on Marktplaats and Vinted: the same stock in all three places.',
    seoImage: SITE_IMAGE,
    blocks: productsBlocks
  },
  {
    path: '/agenda',
    status: 'published',
    title: 'Agenda',
    seoTitle: `Upcoming events | ${SITE_NAME}`,
    seoDescription: 'When I have a stall at a Pokémon event in the Netherlands or Belgium, the date and place will be here.',
    seoImage: SITE_IMAGE,
    blocks: agendaBlocks
  },
  {
    path: '/about',
    status: 'published',
    title: 'About',
    seoTitle: `About | ${SITE_NAME}`,
    seoDescription: 'Meet Timo, the frontend developer who runs Hello World Cards, and Sam, the Wooper fan who comes along to events.',
    seoImage: SITE_IMAGE,
    blocks: aboutBlocks
  },
  {
    path: '/contact',
    status: 'published',
    title: 'Contact',
    seoTitle: `Contact | ${SITE_NAME}`,
    seoDescription: CONTACT_CTA,
    seoImage: SITE_IMAGE,
    blocks: contactBlocks
  },
  {
    path: '/privacy',
    status: 'published',
    title: 'Privacy',
    seoTitle: `Privacy statement | ${SITE_NAME}`,
    seoDescription: 'How Hello World Cards uses Google Tag Manager and Microsoft Clarity, and what happens when you send Timo a message.',
    seoImage: SITE_IMAGE,
    blocks: privacyBlocks
  }
]

export function seedProductWithSlug(product: ProductRecord, all = seedProductRecords) {
  return { ...product, slug: uniqueProductSlug(product, all) }
}
