# Animated Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port t4change’s `Animated` scroll-in wrapper and `useInView` hook into helloworldcards (reusable only — no page wiring).

**Architecture:** CSS-class animations via existing `tw-animate-css`. `useInView` observes a child DOM node; `Animated` clones the single child, merges Tailwind animation classes when it enters the viewport (`once: true`), and starts hidden with `!opacity-0`. No Lighthouse integration.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, `tw-animate-css` (already in `app/global.css`), existing `cn` from `~/services/utils`.

## Global Constraints

- Port only — do not wrap Header, home, Logo, or other UI
- Do not add `useIsLighthouse` or losse-sjedel
- Do not add new npm dependencies
- No automated unit tests (project has no test runner); verify with `npx tsc -b` and `npm run lint`
- Spec: `docs/superpowers/specs/2026-08-11-animated-component-design.md`

## File Structure

| File | Responsibility |
|------|----------------|
| `app/hooks/useInView.ts` | IntersectionObserver → boolean in-view state |
| `app/components/elements/Animated.tsx` | Class maps + `Animated` wrapper (cloneElement) |

No other files change.

---

### Task 1: Add `useInView` hook

**Files:**
- Create: `app/hooks/useInView.ts`

**Interfaces:**
- Consumes: React `useEffect`, `useState`; browser `IntersectionObserver`
- Produces: `useInView<T extends HTMLElement>(ref: React.RefObject<T \| null>, options?: { once?: boolean }): boolean`

- [ ] **Step 1: Create `app/hooks/useInView.ts`**

```ts
import { useEffect, useState } from 'react'

export function useInView<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  options: { once?: boolean } = {}
): boolean {
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref?.current
    if (!node) return

    const observer: IntersectionObserver | null = new window.IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (options.once) {
            observer?.disconnect()
          }
        } else if (!options.once) {
          setInView(false)
        }
      },
      {
        threshold: 0.1
      }
    )

    observer.observe(node)

    return () => {
      observer?.disconnect()
    }
  }, [ref, options.once])

  return inView
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --pretty false`
Expected: exit 0 (no errors mentioning `useInView`)

- [ ] **Step 3: Commit** (only if the user asked to commit)

```bash
git add app/hooks/useInView.ts
git commit -m "$(cat <<'EOF'
Add useInView hook for scroll-triggered animations.

EOF
)"
```

---

### Task 2: Add `Animated` component (no Lighthouse)

**Files:**
- Create: `app/components/elements/Animated.tsx`

**Interfaces:**
- Consumes: `useInView` from `~/hooks/useInView`; `cn` from `~/services/utils`
- Produces:
  - `export function Animated(props: AnimatedProps): ReactElement | null`
  - `export type Animation | Delay | Easing | Duration`
  - `export const DelayToClass | AnimationToClass | EaseToClass | DurationToClass`
  - `export interface AnimatedProps`

**Note:** t4change uses `direction ? 'animate-in' : 'animate-out'`, which never selects `animate-out` because both `'in'` and `'out'` are truthy. Use `direction === 'in'` so the `direction` prop matches the type.

- [ ] **Step 1: Create `app/components/elements/Animated.tsx`**

```tsx
import { cloneElement, isValidElement, ReactElement, useRef } from 'react'
import { useInView } from '~/hooks/useInView'
import { cn } from '~/services/utils'

export const DelayToClass = {
  0: 'delay-0',
  100: 'delay-100',
  150: 'delay-150',
  200: 'delay-200',
  300: 'delay-300',
  400: 'delay-400',
  500: 'delay-500',
  600: 'delay-600',
  700: 'delay-700',
  800: 'delay-800',
  900: 'delay-900',
  1000: 'delay-1000',
  1100: 'delay-1100',
  1200: 'delay-1200',
  1300: 'delay-1300',
  1400: 'delay-1400',
  1500: 'delay-1500',
  1600: 'delay-1600',
  1700: 'delay-1700',
  1800: 'delay-1800',
  1900: 'delay-1900',
  2000: 'delay-2000'
}

export const AnimationToClass = {
  fade: 'fade-in',
  'fade-up': 'fade-in slide-in-from-bottom-10',
  'fade-down': 'fade-in slide-in-from-top-10',
  'fade-left': 'fade-in slide-in-from-right-10',
  'fade-right': 'fade-in slide-in-from-bottom-10'
}

export const EaseToClass = {
  linear: 'ease-linear',
  in: 'ease-in',
  out: 'ease-out',
  'ease-in-out': 'ease-in-out'
}

export const DurationToClass = {
  0: 'duration-0',
  75: 'duration-75',
  100: 'duration-100',
  150: 'duration-150',
  200: 'duration-200',
  300: 'duration-300',
  400: 'duration-400',
  500: 'duration-500',
  700: 'duration-700',
  1000: 'duration-1000'
}

export type Animation = keyof typeof AnimationToClass
export type Delay = keyof typeof DelayToClass
export type Easing = keyof typeof EaseToClass
export type Duration = keyof typeof DurationToClass

export interface AnimatedProps {
  children: ReactElement<HTMLElement>
  animation?: Animation
  direction?: 'in' | 'out'
  delay?: Delay
  easing?: Easing
  duration?: Duration
  className?: string
}

export function Animated({
  animation = 'fade-up',
  direction = 'in',
  delay = 0,
  easing = 'ease-in-out',
  duration = 500,
  children,
  className
}: AnimatedProps) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, {
    once: true
  })

  const animationClass = cn(
    inView && [
      direction === 'in' ? 'animate-in' : 'animate-out',
      AnimationToClass[animation],
      DelayToClass[delay],
      EaseToClass[easing],
      DurationToClass[duration],
      'motion-reduce:animate-none',
      'opacity-100'
    ],
    !inView && '!opacity-0'
  )

  if (!isValidElement(children)) {
    console.warn('[Animated] expects a single valid React element as its child.')
    return null
  }

  return cloneElement(children, {
    // @ts-expect-error - Ref is not a valid prop for all elements
    ref,
    className: cn(children.props.className, animationClass, className)
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --pretty false`
Expected: exit 0

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exit 0 (or only pre-existing issues unrelated to these files)

- [ ] **Step 4: Smoke-check import (optional manual)**

In a scratch edit you will **not** commit, temporarily wrap any element:

```tsx
import { Animated } from '~/components/elements/Animated'

<Animated animation="fade-up" delay={200}>
  <div>Hello</div>
</Animated>
```

Run `npm run dev`, confirm the element starts invisible and fades in. Revert the scratch usage before finishing — pages must remain unchanged.

- [ ] **Step 5: Commit** (only if the user asked to commit)

```bash
git add app/components/elements/Animated.tsx
git commit -m "$(cat <<'EOF'
Add Animated scroll-in wrapper from t4change.

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `useInView.ts` | Task 1 |
| `Animated.tsx` with class maps / props | Task 2 |
| No Lighthouse | Task 2 omits it |
| No page wiring | Both tasks create only new files |
| Reuse `cn` + `tw-animate-css` | Task 2 imports `cn`; CSS already present |
| Typecheck / lint verification | Task 1 Step 2; Task 2 Steps 2–3 |
