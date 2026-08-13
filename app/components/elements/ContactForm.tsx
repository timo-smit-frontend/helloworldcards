import { FormEvent, useState } from 'react'
import { CONTACT_EMAIL, sendContactMessage } from '~/services/contact'

type Status = 'idle' | 'submitting' | 'success' | 'error'

export default function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (honeypot) {
      setStatus('success')
      return
    }

    setStatus('submitting')

    try {
      await sendContactMessage({ name, email, message })
      setName('')
      setEmail('')
      setMessage('')
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-panel bg-cream p-6 sm:p-8 lg:p-10">
      <div className="hidden" aria-hidden>
        <label htmlFor="contact-company">Company</label>
        <input
          id="contact-company"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="contact-name" className="text-sm font-medium leading-7">
          Name
        </label>
        <input
          id="contact-name"
          name="name"
          type="text"
          required
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="field"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="contact-email" className="text-sm font-medium leading-7">
          Email
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="field"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="contact-message" className="text-sm font-medium leading-7">
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={6}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="field min-h-40 resize-y"
        />
      </div>

      <button type="submit" className="button-leaf disabled:cursor-not-allowed disabled:opacity-60" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Sending…' : 'Send message'}
      </button>

      <div aria-live="polite">
        {status === 'success' && <p className="content-s text-moss">Thanks — we will get back to you soon.</p>}
        {status === 'error' && (
          <p className="content-s text-muted">
            Something went wrong. You can also email us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-leaf">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        )}
      </div>
    </form>
  )
}
