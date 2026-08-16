import { useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'

export default function useLocationFinder() {
  const ref = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const [position, setPosition] = useState<'first' | 'last' | number>(-1)

  useLayoutEffect(() => {
    const section = ref.current
    const main = document.getElementById('main')

    if (!section || !main) {
      setPosition(-1)
      return
    }

    const sections = Array.from(main.querySelectorAll<HTMLElement>(':scope > section'))
    const index = sections.indexOf(section)

    if (index === 0) {
      setPosition('first')
      return
    }

    if (index === sections.length - 1) {
      setPosition('last')
      return
    }

    setPosition(index)
  }, [pathname])

  return { ref, position, isFirst: position === 'first' }
}
