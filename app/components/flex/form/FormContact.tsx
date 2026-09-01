import { FormEvent, useRef, useState } from 'react'
import { Animated } from '~/components/elements/Animated'
import Breadcrumbs from '~/components/elements/Breadcrumbs'
import useLocationFinder from '~/hooks/useLocationFinder'
import { CONTACT_EMAIL, INSTAGRAM_URL, MARKTPLAATS_URL, sendContactMessage } from '~/services/contact'
import { useCms } from '~/cms/context'
import { cn, isValidEmail } from '~/services/utils'

const contactLinkClass = 'group flex w-fit items-center gap-2 transition-colors hover:text-site-envy'

function MailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

function MarktplaatsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
      <path d="M3 9 12 3l9 6" />
    </svg>
  )
}

function ContactEmailLink({ email }: { email: string }) {
  return (
    <a href={`mailto:${email}`} className={contactLinkClass}>
      <MailIcon />
      <span className="link-underline">{email}</span>
    </a>
  )
}

function ContactInstagramLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className={contactLinkClass}>
      <InstagramIcon />
      <span className="link-underline">Instagram</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

function ContactMarktplaatsLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className={contactLinkClass}>
      <MarktplaatsIcon />
      <span className="link-underline">Marktplaats</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

export function FormContactLinks({ variant = 'stacked' }: { variant?: 'stacked' | 'split' }) {
  const cms = useCms()
  const email = cms?.settings.contactEmail ?? CONTACT_EMAIL
  const instagram = cms?.settings.instagramUrl ?? INSTAGRAM_URL
  const marktplaats = cms?.settings.marktplaatsUrl ?? MARKTPLAATS_URL
  const listClass = cn('mt-4 flex flex-col text-base font-medium leading-7', variant === 'split' ? 'sm:gap-2 gap-6' : 'gap-2')

  if (variant === 'split') {
    return (
      <>
        <div className="min-w-60">
          <h2 className="text-lg font-bold leading-7">Contact</h2>
          <ul className={listClass}>
            <li>
              <ContactEmailLink email={email} />
            </li>
          </ul>
        </div>
        <div className="min-w-60">
          <h2 className="text-lg font-bold leading-7">Follow us</h2>
          <ul className={listClass}>
            <li>
              <ContactInstagramLink url={instagram} />
            </li>
            <li>
              <ContactMarktplaatsLink url={marktplaats} />
            </li>
          </ul>
        </div>
      </>
    )
  }

  return (
    <div>
      <h2 className="text-lg font-bold leading-7">Contact</h2>
      <ul className={listClass}>
        <li>
          <ContactEmailLink email={email} />
        </li>
        <li>
          <ContactInstagramLink url={instagram} />
        </li>
        <li>
          <ContactMarktplaatsLink url={marktplaats} />
        </li>
      </ul>
    </div>
  )
}

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

function ContactForm() {
  const cms = useCms()
  const contactEmail = cms?.settings.contactEmail ?? CONTACT_EMAIL
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
      await sendContactMessage({ name, email: email.trim(), message, to: contactEmail })
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
        className="button-green cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        disabled={status === 'submitting'}
      >
        {status === 'submitting' ? 'Sending…' : 'Send message'}
      </button>

      <div aria-live="polite">
        {status === 'success' && <p className="content-s text-site-summer-green">Thanks! We will get back to you soon.</p>}
        {status === 'error' && (
          <p className="content-s text-site-mantle">
            Something went wrong. You can also email us at{' '}
            <a href={`mailto:${contactEmail}`} className="underline hover:text-site-envy">
              {contactEmail}
            </a>
            .
          </p>
        )}
      </div>
    </form>
  )
}

export default function FormContact({ title, description }: { title?: string; description?: string }) {
  const { ref, isFirst } = useLocationFinder()

  return (
    <section id="form-contact" ref={ref} className={cn('section', isFirst && 'lg:mt-16! mt-12!')}>
      <div className="container-full">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16 xl:gap-24">
          <div className="flex flex-col gap-12">
            {(title || description) && (
              <div className="flex max-w-xl flex-col gap-8">
                {isFirst && <Breadcrumbs />}
                {(title || description) && (
                  <div className="flex flex-col gap-2 lg:gap-4">
                    {title && (
                      <Animated delay={100}>
                        <h1 className="title-l">{title}</h1>
                      </Animated>
                    )}
                    {description && (
                      <Animated delay={200}>
                        <p className="content-l text-site-mantle">{description}</p>
                      </Animated>
                    )}
                  </div>
                )}
              </div>
            )}

            <Animated delay={300}>
              <div>
                <FormContactLinks />
              </div>
            </Animated>
          </div>

          <Animated delay={400}>
            <div>
              <ContactForm />
            </div>
          </Animated>
        </div>
      </div>
    </section>
  )
}
