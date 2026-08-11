import { useEffect, useState } from 'react'

export function useInView<T extends HTMLElement>(ref: React.RefObject<T | null>, options: { once?: boolean } = {}): boolean {
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
