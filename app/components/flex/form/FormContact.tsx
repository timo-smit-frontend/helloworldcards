import { FormEvent, useRef, useState } from 'react'
import { CONTACT_EMAIL, sendContactMessage } from '~/services/contact'
import { isValidEmail } from '~/services/utils'

type Status = 'idle' | 'submitting' | 'success' | 'error'

const NAME_HINT = "Don't forget to add your name."
const EMAIL_HINT = "Don't forget to add your email."
const EMAIL_INVALID_HINT = "That doesn't look like a valid email, try name@example.com."
const MESSAGE_HINT = "Don't forget to add your message."

function emailHint(value: string) {
  if (value.trim() === '') {
    return EMAIL_HINT
  }

  return isValidEmail(value) ? '' : EMAIL_INVALID_HINT
}

function applyRequiredValidity(input: HTMLInputElement | HTMLTextAreaElement, value: string, hint: string) {
  input.setCustomValidity(value.trim() === '' ? hint : '')
}

function applyEmailValidity(input: HTMLInputElement, value: string) {
  input.setCustomValidity(emailHint(value))
}

export default function FormContact() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [nameTouched, setNameTouched] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)
  const [messageTouched, setMessageTouched] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  const nameIsValid = name.trim() !== ''
  const emailIsValid = isValidEmail(email)
  const messageIsValid = message.trim() !== ''
  const showNameError = nameTouched && !nameIsValid
  const showEmailError = emailTouched && !emailIsValid
  const showMessageError = messageTouched && !messageIsValid

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (honeypot) {
      setStatus('success')
      return
    }

    if (!nameIsValid || !emailIsValid || !messageIsValid) {
      setNameTouched(true)
      setEmailTouched(true)
      setMessageTouched(true)

      if (!nameIsValid) {
        nameRef.current?.focus()
      } else if (!emailIsValid) {
        emailRef.current?.focus()
      } else {
        messageRef.current?.focus()
      }

      return
    }

    setStatus('submitting')

    try {
      await sendContactMessage({ name, email: email.trim(), message })
      setName('')
      setEmail('')
      setMessage('')
      setNameTouched(false)
      setEmailTouched(false)
      setMessageTouched(false)
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-panel bg-site-gunmetal p-6 sm:p-8 lg:p-10">
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
          Name <span aria-hidden>*</span>
        </label>
        <input
          id="contact-name"
          ref={nameRef}
          name="name"
          type="text"
          required
          autoComplete="name"
          aria-invalid={showNameError}
          aria-describedby={showNameError ? 'contact-name-error' : undefined}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            applyRequiredValidity(event.target, event.target.value, NAME_HINT)
          }}
          onBlur={(event) => {
            setNameTouched(true)
            applyRequiredValidity(event.target, event.target.value, NAME_HINT)
          }}
          className="field"
        />
        {showNameError && (
          <p id="contact-name-error" className="content-s text-site-mantle">
            {NAME_HINT}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="contact-email" className="text-sm font-medium leading-7">
          Email <span aria-hidden>*</span>
        </label>
        <input
          id="contact-email"
          ref={emailRef}
          name="email"
          type="email"
          inputMode="email"
          required
          maxLength={254}
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={showEmailError}
          aria-describedby={showEmailError ? 'contact-email-error' : undefined}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            applyEmailValidity(event.target, event.target.value)
          }}
          onBlur={(event) => {
            setEmailTouched(true)
            applyEmailValidity(event.target, event.target.value)
          }}
          className="field"
        />
        {showEmailError && (
          <p id="contact-email-error" className="content-s text-site-mantle">
            {emailHint(email)}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="contact-message" className="text-sm font-medium leading-7">
          Message <span aria-hidden>*</span>
        </label>
        <textarea
          id="contact-message"
          ref={messageRef}
          name="message"
          required
          rows={6}
          aria-invalid={showMessageError}
          aria-describedby={showMessageError ? 'contact-message-error' : undefined}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value)
            applyRequiredValidity(event.target, event.target.value, MESSAGE_HINT)
          }}
          onBlur={(event) => {
            setMessageTouched(true)
            applyRequiredValidity(event.target, event.target.value, MESSAGE_HINT)
          }}
          className="field min-h-40"
        />
        {showMessageError && (
          <p id="contact-message-error" className="content-s text-site-mantle">
            {MESSAGE_HINT}
          </p>
        )}
      </div>

      <button
        type="submit"
        className="button-leaf cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        disabled={status === 'submitting'}
      >
        {status === 'submitting' ? 'Sending…' : 'Send message'}
      </button>

      <div aria-live="polite">
        {status === 'success' && <p className="content-s text-site-summer-green">Thanks! We will get back to you soon.</p>}
        {status === 'error' && (
          <p className="content-s text-site-mantle">
            Something went wrong. You can also email us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-site-envy">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        )}
      </div>
    </form>
  )
}
