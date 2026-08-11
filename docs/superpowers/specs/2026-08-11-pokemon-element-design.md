# Pokemon element (random sprite)

## Goal

Add a small presentational element that shows a random Pokémon sprite on mount. No page wiring in this change — component only.

## Decisions

- **Image source:** Static PokeAPI sprites CDN URL (no metadata API call).
- **URL pattern:** `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{id}.png`
- **ID range:** Inclusive `1…1025`, chosen once on mount.
- **Label:** Image only; `alt="Random Pokémon"`.
- **Refresh:** None — new ID only on remount.
- **Scope:** `app/components/elements/Pokemon.tsx` only. Do not mount it in Header, home, or other UI yet.

## Files

| Path | Role |
|------|------|
| `app/components/elements/Pokemon.tsx` | Pick random ID on mount; render `<img>` |

## API

```tsx
<Pokemon className="h-24 w-24" />
```

Props:

- `className?: string` — applied to the `<img>` (same pattern as `Logo`)

## Behavior

- Use `useState` initializer to pick `id` once: `Math.floor(Math.random() * 1025) + 1`.
- Default export function component, consistent with `Logo`.
- No loading placeholder, error retry, or name lookup.

## Out of scope

- Official artwork URLs
- Pokémon name / ID in UI
- Refresh button or interval
- Usage on any route or layout
