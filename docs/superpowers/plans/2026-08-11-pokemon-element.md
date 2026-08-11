# Pokemon Element Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Pokemon` element that shows a random PokeAPI sprite image once on mount (component only — no page wiring).

**Architecture:** On first render, pick a stable random ID (`1…1025`) with a `useState` initializer. Build a static sprite URL from the PokeAPI sprites CDN and render a single `<img>` with optional `className`. No network fetch for metadata.

**Tech Stack:** React 19, TypeScript, Vite / React Router (no `"use client"` directive).

## Global Constraints

- Component file only — do not mount in Header, home, Banner, or other UI
- No metadata API call; static sprite URL only
- Image only; `alt="Random Pokémon"`
- ID chosen once on mount; no refresh button or interval
- Do not add new npm dependencies
- No automated unit tests (project has no test runner); verify with `npx tsc -b` and `npm run lint`
- Spec: `docs/superpowers/specs/2026-08-11-pokemon-element-design.md`

## File Structure

| File | Responsibility |
|------|----------------|
| `app/components/elements/Pokemon.tsx` | Random ID + sprite `<img>` |

No other files change.

---

### Task 1: Add `Pokemon` element

**Files:**
- Create: `app/components/elements/Pokemon.tsx`

**Interfaces:**
- Consumes: React `useState`
- Produces: `default function Pokemon({ className }: { className?: string }): JSX.Element`

- [ ] **Step 1: Create `app/components/elements/Pokemon.tsx`**

```tsx
import { useState } from 'react'

const MAX_POKEMON_ID = 1025
const SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'

function randomPokemonId(): number {
  return Math.floor(Math.random() * MAX_POKEMON_ID) + 1
}

export default function Pokemon({ className }: { className?: string }) {
  const [id] = useState(randomPokemonId)

  return (
    <img
      src={`${SPRITE_BASE}/${id}.png`}
      alt="Random Pokémon"
      className={className}
    />
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: exit 0, no errors mentioning `Pokemon.tsx`

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exit 0 (or only pre-existing issues unrelated to `Pokemon.tsx`)

- [ ] **Step 4: Manual smoke check (optional)**

Temporarily render `<Pokemon className="h-24 w-24" />` in any local page, confirm a sprite loads, then remove the temporary usage (out of scope to leave wired up).

- [ ] **Step 5: Commit (only if the user asked to commit)**

```bash
git add app/components/elements/Pokemon.tsx docs/superpowers/specs/2026-08-11-pokemon-element-design.md docs/superpowers/plans/2026-08-11-pokemon-element.md
git commit -m "$(cat <<'EOF'
Add Pokemon element with random PokeAPI sprite.

EOF
)"
```
