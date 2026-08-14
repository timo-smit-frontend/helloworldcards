import { MouseEvent } from 'react'

const MAIN_ID = 'main'

export default function SkipToMainContent() {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const main = document.getElementById(MAIN_ID)
    if (!main) {
      return
    }

    event.preventDefault()
    main.focus({ preventScroll: true })
    main.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    })
  }

  return (
    <a
      href={`#${MAIN_ID}`}
      onClick={handleClick}
      className="button-leaf sr-only focus:not-sr-only focus:fixed focus:inset-auto focus:top-4 focus:left-4 focus:z-100 focus:w-auto focus:px-7! focus:py-3.5!"
    >
      Skip to main content
    </a>
  )
}
