import { useRef, useState } from 'react'
import { Check, X } from 'lucide'
import { MorphIcon } from 'morphicons/react'

export type SaveFeedback = { status: 'success' | 'error'; message: string }

export function useSaveFeedback() {
  const [feedback, setFeedback] = useState<SaveFeedback | null>(null)
  const formBodyRef = useRef<HTMLDivElement>(null)

  function scrollToTop() {
    formBodyRef.current?.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    })
  }

  function showSuccess(message: string) {
    setFeedback({ status: 'success', message })
    scrollToTop()
  }

  function showError(message: string) {
    setFeedback({ status: 'error', message })
    scrollToTop()
  }

  function clearFeedback() {
    setFeedback(null)
  }

  return { feedback, formBodyRef, showSuccess, showError, clearFeedback }
}

export function AdminSaveFeedback({ feedback }: { feedback: SaveFeedback | null }) {
  if (!feedback) {
    return null
  }

  return (
    <p
      className={`content-s flex items-center gap-2 ${feedback.status === 'success' ? 'text-site-envy' : 'text-site-loss'}`}
      role="status"
      aria-live="polite"
    >
      <MorphIcon icon={feedback.status === 'success' ? Check : X} size={18} strokeWidth={2.25} />
      {feedback.message}
    </p>
  )
}
