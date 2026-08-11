# Desktop header shell (t4change look)

## Goal

Replace the Hello World Cards desktop header’s floating-pill look with t4change’s solid white sticky bar. Content and mobile menu stay the same.

## Scope

**In**

- Restyle the desktop header shell in `app/components/layout/Header.tsx`
- Always-white sticky bar with light drop-shadow; stronger shadow when scrolled
- Keep logo (left) and Contact CTA (right, `xl+`)

**Out**

- New nav links or t4change NavigationMenu
- Mobile sheet redesign
- CTA / button style changes (`button-deep-green` stays)
- Logo asset changes

## Structure

Mirror t4change’s shell, not its CMS menu:

| Layer | Behavior |
| --- | --- |
| `<header>` | `sticky top-0 z-50 bg-white`; base `drop-shadow-[0px_1px_2.5px_rgba(0,0,0,0.15)]`; when scrolled and mobile menu closed, add `shadow` |
| Inner | `container-full` → flex `items-center justify-between py-6` |
| Left | Home link + Logo |
| Right | Contact CTA (`hidden xl:inline-flex`) + existing mobile menu trigger |

Remove the fixed inset floating nav, rounded pill, backdrop blur, and transparent → white background toggle.

## Behavior

- Keep `scrollY > 10` sticky detection only to escalate shadow (not background).
- Header background is always white.
- Mobile menu open may raise z-index / suppress extra shadow if needed so the sheet still layers correctly (same idea as t4change).

## Layout impact

Header becomes in-flow (`sticky`) instead of `fixed`. Page content no longer sits under a floating overlay header; no compensatory top padding is required for the header itself.

## Success criteria

- Desktop (`xl+`): white full-width bar, logo left, Contact CTA right, t4change-like shadow behavior on scroll.
- Below `xl`: same bar shell; hamburger + existing sheet unchanged in behavior and content.
- No new navigation items.
