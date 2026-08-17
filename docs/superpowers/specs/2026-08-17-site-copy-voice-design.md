# Site copy and selling voice

Date: 2026-08-17

## Problem

Most on-site writing is filler with a mixed tone. Product listings besides id 1 share one PSA 9 template. Buying always uses mailto, which does not match how cards will actually sell (Marktplaats, email as fallback). Binders and the programmer Hello World hook are either missing or buried in diary-like About copy.

## Goal

One shop voice across every public string (pages, FAQ, SEO, llms.txt, privacy). Cards read as the same stock as [Marktplaats](https://www.marktplaats.nl/u/hello-world-cards/25399885/). Product CTAs follow Marktplaats listing vs email. Binders are hinted as Sam’s event-table work, not sold online. Dummy catalog stays for layout until real photos and listings replace it.

## Voice

- Professional, welcoming, Pokémon-first. Not corporate, not a private diary.
- **We / us** for the shop. Sam and Timo by name on About and where a hobby detail needs a person.
- English (`en-GB`). Short sentences. No hype: “impressive”, “popular set”, “you’re in the right place”.
- Programmer identity is a Hello World wink (backend / frontend, `<Hello world />`, footer pun). Not a tech blog. No employer or extra life detail.
- Couple origin stays. Favourite Pokémon stay. Workplace does not.
- Dummy cards use the same voice as the real Mewtwo. Treat site stock and Marktplaats as synced; do not special-case dummy vs real in the copy.

## Buying

Cards are what you sell online. Binders are not.

**Cards**

- Optional `marktplaatsUrl` per product (specific listing, not the seller profile).
- If set: primary button **View on Marktplaats**, `target="_blank"` `rel="noreferrer noopener"`, with a visually hidden “opens in a new tab”.
- If unset: primary button **Email us about this** (existing product mailto subject/body via `Mailing`).
- This pass: all `marktplaatsUrl` values empty, including product 1. Same buttons on dummy and real cards.
- Price stays on the page either way.

**Always**

- Email and the contact form are for anything: a card, an event, a binder at a stall, a question.
- Instagram stays follow/contact, not checkout.

**Seller profile**

- Constant next to Instagram: `https://www.marktplaats.nl/u/hello-world-cards/25399885/`
- Linked from footer (beside Instagram), Contact, and the buy FAQ. At most a short mention on home / About.
- Do not use the profile URL as a product buy button.

**Binders**

- No product page, no price, no Marktplaats, no “email to order”.
- Copy: Sam paints them; they come to events. Fine next to the (currently filler) agenda.

## Product data

Keep ids, titles, prices, and images. Rewrite descriptions. Keep product 1 facts.

**Slug**

- `slugify(\`${title} ${subtitle}\`)` so two cards with the same title stay readable and distinct, e.g. `/products/mewtwo-reverse-holo-2016-xy-evolutions-51-108`.
- If that base still collides across ids, append `-${id}` to the later product only, so the first URL stays stable.
- `getProductBySlug` uses this computed slug. No redirects for old title-only URLs (not public yet).

**Product 1 (real)**

- Title: `Mewtwo Reverse Holo`
- Subtitle: `2016 XY Evolutions - 51/108`
- Description: `Reverse holo Mewtwo from the 2016 XY Evolutions set, number 51/108. Graded PSA 9 Mint.`
- Price: `€99`
- Slug: `mewtwo-reverse-holo-2016-xy-evolutions-51-108`

**Dummy descriptions** (titles, subtitles, prices, images unchanged)

- Blastoise Holo: `A reverse holo Blastoise from Base Set. Classic art, the kind of card that still earns a page in the binder.`
- Venusaur Holo: `Holo Venusaur from Base Set. Grass-type staple with the original full-art energy.`
- Pikachu Illustrator: `Pikachu Illustrator — a display piece. Ask us if you want a closer look.`
- Mewtwo GX: `Mewtwo GX from the shop. A later-era hit that still pulls focus in a binder.`
- Eevee Promo: `An Eevee promo with the soft art people pick up and don’t put back.`

## Pages

Same routes. Copy lives on the routes (and in `products.ts` / `faq.ts` / SEO helpers) as today. Samantha’s images stay as-is.

**Reuse existing flex blocks** rather than stuffing extra story into one paragraph or inventing new components. Allowed blocks: `BannerFigcaption`, `ContentText`, `ContentProducts`, `ContentCta`, `ContentAbout`, `ContentFaq`, `ContentAgenda`. If the same block type appears twice on one page, its section `id` must be unique (optional `id` prop; today’s hardcoded `content-text` / `content-cta` would clash).

### Home (`app/routes/home.tsx`)

1. `BannerFigcaption`
2. `ContentText` — Hello World
3. `ContentText` — cards vs the stall (new reuse)
4. `ContentProducts`
5. `ContentCta` — contact

**Banner**

- Title: `Hello World Cards`
- Description: `Pokémon cards listed here and on Marktplaats, plus handpainted binders we bring to events.`
- Link: `/products` — `See our products`
- Figcaption: `This is our little corner of the world`

**Hello World (`ContentText`)**

- Title: `<Hello world />`
- Description: `We're Sam and Timo, a couple of programmers who never quite grew out of Pokémon. That's why the shop is called Hello World.`
- Link: `/about` — `Learn more about us`
- Image: existing wooper stand-in

**Cards and the stall (`ContentText`, new)**

- Title: `Cards in the shop, binders at the stall`
- Description: `We list Pokémon cards here and on Marktplaats. Sam paints custom binders for the event table — you'll see those when we have a stall, not in the checkout.`
- Link: `/agenda` — `See upcoming events`
- Image: existing hero stand-in

**Products**

- Title: `Our newest products`
- Description: `A few cards from the shop. The same stock lives on Marktplaats.`
- Ids: `[1, 2, 3, 4]` unchanged

**CTA**

- Title: `Want to get in touch?`
- Description: `Questions about a card, an event, or anything else? Send us an email.`
- Link: existing mailto — `Get in touch`

### Shop (`app/routes/products.tsx`)

1. `ContentProducts`
2. `ContentCta` — events / binders (new reuse)

- Title: `All the products we currently have in stock`
- Description: `Pokémon cards we have right now, listed here and on Marktplaats.`

**Events CTA**

- Title: `Looking for a binder?`
- Description: `Sam's handpainted binders aren't in the shop. We bring them to events.`
- Link: `/agenda` — `See upcoming events`
- Image: existing hero / `SITE_IMAGE`

### Product (`app/routes/product.tsx`)

- Button label/url from the buying rules above. Drop `Buy the ${title}`.
- Similar row title: `More from the shop`
- Not-found copy can stay.
- No extra blocks; the page is already title, buy, similar products.

### About (`app/routes/about.tsx`)

1. `BannerFigcaption`
2. `ContentAbout`
3. `ContentText` — at events (new reuse)
4. `ContentFaq`
5. `ContentCta` — contact

**Banner**

- Title: `We're Sam and Timo`
- Description: `We're a couple who turned a Pokémon hobby into this little shop. Cards online, events on the agenda, and a stall when we're out.`
- Figcaption: `From our little corner of the hobby.`
- Alt: unchanged shop-photo alt

**Origin**

- Title: `A hobby that turned into a little shop`
- Description: `Hello World Cards is us: Sam and Timo. We never quite grew out of Pokémon, and we both write software — which is why the shop is called Hello World. We list cards here and on Marktplaats, and we write up the events we're heading to.`

**People**

- Sam: `Backend developer, and a die-hard Wooper and Quagsire collector. The muddy, dopey Water-types are a forever chase. Psyduck and Slowpoke live in the same pile, Mew shows up whenever the art is too pretty to skip, and cute or pretty full arts almost never get walked past at a table. Sam also paints the binders we bring to events.`
- Timo: `Frontend developer who has been after Gengar and Ralts for years. Ghosts, psychics, and a few odd frogs: Mewtwo still stops a scroll, Shroomish is an easy yes, and Flygon and Politoed are the ones that make an event stall last a little longer than it should.`
- Caption: `Two nerds who never quite outgrew Pokémon.`

**At events (`ContentText`, new)**

- Title: `What we bring to a stall`
- Description: `Cards from the shop, and Sam's custom handpainted binders. The binders aren't listed online — they come with us to the next event.`
- Link: `/agenda` — `See upcoming events`
- Image: existing stand-in (`SITE_IMAGE` or wooper)

**CTA:** same shape as now, description aligned with Contact (`Questions about a card, an event, or anything else? Send us a message.`).

JSON-LD Person descriptions must match these bios.

### Agenda (`app/routes/agenda.tsx`)

Keep filler events.

- Title: `Upcoming events`
- Description: `We'll be at these Pokémon events. Come say hi, browse the stall, and have a look at Sam's binders.`

### Contact (`app/routes/contact.tsx` + `ContentContact`)

- Title: `Get in touch`
- Description: `Questions about a card, an event, a binder at a stall, or anything else? Send us a message.`
- Add a Marktplaats link under the existing email + Instagram list (new tab, same treatment as Instagram).

Form hints and success/error strings can stay; they already match the voice.

### Privacy (`app/routes/privacy.tsx`)

Keep the policy. Voice-only pass on the intro and “Who we are”:

- Intro: `Hello World Cards is a small Pokémon shop run by Sam and Timo. We are not a company. This page says what happens when you visit the site or send us a message.`
- Who we are: `Hello World Cards is Sam and Timo. We list Pokémon cards here and on Marktplaats, and we write about events we go to.` Plus the existing email link.

Do not add Marktplaats as a data processor (outbound link only).

### Footer

Keep `All cards reserved.` Add Marktplaats beside Instagram under Follow us (new tab).

### 404

Leave as-is (already plain and clear).

## FAQ (`app/database/faq.ts`)

**About**

1. What is Hello World Cards? — `A small Pokémon shop run by Sam and Timo. We list cards here and on Marktplaats, and we bring handpainted binders to events.`
2. Who runs Hello World Cards? — `Sam and Timo, a couple of programmers who collect Pokémon. Sam collects Wooper and Quagsire and paints the binders. Timo chases Gengar and Ralts.`
3. Do you have a physical shop? — `No walk-in storefront. We sell cards online and on Marktplaats, and in person at Pokémon events in the Netherlands and Belgium.`
4. What do you sell? — `Pokémon cards, including graded cards, listed here and on Marktplaats. Sam's custom handpainted binders come with us to events.`

**Contact**

5. How do I buy a card? — `Cards are listed here and on Marktplaats. If the product page has a Marktplaats link, that's the listing. If it doesn't, email us. You can always email about anything.` Include `CONTACT_EMAIL` as today. Link the seller profile in this answer (or immediately beside it on Contact).
6. How can I get in touch? — `Email, the contact form, Instagram @helloworldcards, or our Marktplaats page.`
7. Where can I meet you in person? — `At the events on the agenda. We bring a stall with cards and Sam's handpainted binders.`

FAQ answers that mention Marktplaats should use the seller profile URL. Do not invent per-card listing URLs.

## SEO and crawlers

`SITE_DESCRIPTION`: `Pokémon cards from Sam and Timo — listed here and on Marktplaats. Handpainted binders come with us to events.`

- Home title: `Hello World Cards | Pokémon cards and events`
- Shop: `Browse Pokémon cards listed here and on Marktplaats.`
- Agenda: `We'll be at these Pokémon events. Come say hi, browse the stall, and have a look at Sam's binders.`
- About: `We're Sam and Timo, a couple of programmers who turned a Pokémon hobby into Hello World Cards.`
- Contact: `Questions about a card, an event, or anything else? Send us a message.`
- Privacy: keep structure; mention Sam and Timo, drop “art shop” if the body no longer leads with art-for-sale.

`organizationNode().sameAs`: Instagram and the Marktplaats seller profile.

`llms.txt` intro: shop run by Sam and Timo; cards here and on Marktplaats; binders at events; email for anything. Product and FAQ sections inherit the new strings.

Product meta descriptions keep using each product’s description + price line.

## Implementation notes

- Add `MARKTPLAATS_URL` in `app/services/contact.ts` (or `app/seo/site.ts` next to other public URLs). Use it from footer, Contact, FAQ, JSON-LD, and llms if needed.
- Extend `Product` with optional `marktplaatsUrl`.
- Product route picks button href/label from that field.
- `BannerImage` already accepts `link.target`; pass `_blank` for Marktplaats.
- Do not let `Mailing` intercept Marktplaats links.
- Give `ContentText` and `ContentCta` an optional section `id` (default can stay `content-text` / `content-cta`) so Home and Shop can reuse them without duplicate ids.

## Out of scope

- New pages, checkout, or binder product entries
- Real product photography (Samantha later)
- Removing dummy cards or filler events
- Pasting real per-card Marktplaats listing URLs
- Dutch copy
- Changing nav labels
- Visual / illustration work

## Verification

1. `npm run lint` and `npm run build` clean.
2. Every product slug is unique and readable; product 1 is `mewtwo-reverse-holo-2016-xy-evolutions-51-108`.
3. Product pages without `marktplaatsUrl` show **Email us about this** and a mailto; with a URL (can be tested locally) show **View on Marktplaats** in a new tab.
4. Footer, Contact, and buy FAQ link to the seller profile. No product buy button uses that profile URL.
5. Home, About, shop, agenda, FAQ, SEO, and llms.txt all tell the same story: cards online / Marktplaats, binders at events, Hello World = programmers.
6. No leftover “Buy the …”, “impressive PSA 9” template on dummy cards, or “two friends sharing a hobby” site description.
7. Home has two `ContentText` blocks with unique section ids; shop has an events `ContentCta` after the grid; About has an events `ContentText` before FAQ.
