# Animated component (port from t4change)

## Goal

Port the reusable `Animated` scroll-in wrapper from t4change into helloworldcards so pages can fade/slide elements in when they enter the viewport. No UI wiring in this change — component and hook only.

## Decisions

- **Scope:** Add `Animated` + `useInView` only. Do not wrap Header, home, or other existing UI yet.
- **Lighthouse:** Drop `useIsLighthouse` entirely (t4change depends on losse-sjedel for this). Animations always run subject to `motion-reduce`.
- **Approach:** Faithful API port (same props, class maps, and file layout as t4change).

## Files

| Path | Role |
|------|------|
| `app/hooks/useInView.ts` | IntersectionObserver hook (`once`, threshold `0.1`) |
| `app/components/elements/Animated.tsx` | Clone single child, merge animation classes when in view |

Reuse existing:

- `~/services/utils` (`cn`)
- `tw-animate-css` already imported in `app/global.css`

## API

```tsx
<Animated animation="fade-up" delay={200} duration={500} easing="ease-in-out">
  <h1>Hello</h1>
</Animated>
```

Props (defaults match t4change):

- `children` — single valid React element
- `animation` — `fade` \| `fade-up` \| `fade-down` \| `fade-left` \| `fade-right` (default `fade-up`)
- `direction` — `in` \| `out` (default `in`)
- `delay` / `easing` / `duration` — mapped to Tailwind / tw-animate utility classes
- `className` — merged onto the child

Behavior:

- Out of view: `!opacity-0`
- In view (once): `animate-in` (or `animate-out`) + animation / delay / easing / duration classes + `motion-reduce:animate-none` + `opacity-100`
- Invalid children: `console.warn` and return `null`

## Out of scope

- Applying `Animated` to Header, Logo, routes, or other components
- Porting `useIsLighthouse` or any losse-sjedel integration
- Adding custom CSS for delay tokens beyond what Tailwind / tw-animate already provide
- Automated tests beyond project typecheck / lint

## Success criteria

- `Animated` and `useInView` exist and typecheck
- No new runtime dependencies
- Existing pages unchanged
