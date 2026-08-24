import { FormEvent, useEffect, useState } from 'react'
import SkipToMainContent from '~/components/elements/SkipToMainContent'
import TillChart from '~/components/dashboard/TillChart'
import type { Ledger } from '~/database/ledger-types'

type Status = 'loading' | 'login' | 'ready' | 'error'

export default function Dashboard() {
  const [status, setStatus] = useState<Status>('loading')
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function loadLedger() {
    const response = await fetch('/dashboard/ledger', { credentials: 'same-origin' })
    if (response.status === 401) {
      setLedger(null)
      setStatus('login')
      return
    }

    if (response.status === 503) {
      const body = (await response.json()) as { error?: string }
      setMessage(body.error ?? 'Till is not configured.')
      setStatus('login')
      return
    }

    if (!response.ok) {
      setStatus('error')
      return
    }

    setLedger((await response.json()) as Ledger)
    setStatus('ready')
  }

  useEffect(() => {
    void loadLedger()
  }, [])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')

    try {
      const response = await fetch('/dashboard/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username, password })
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        setMessage(body.error ?? 'Wrong username or password')
        setStatus('login')
        return
      }

      setPassword('')
      await loadLedger()
    } catch {
      setMessage('Could not reach the till. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    setSubmitting(true)
    try {
      await fetch('/dashboard/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      })
    } finally {
      setLedger(null)
      setStatus('login')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-site-dark text-site-gray-nurse">
      <SkipToMainContent />
      <header className="border-b border-site-mulled-wine">
        <div className="container-full flex items-center justify-between py-5">
          <p className="text-sm font-semibold tracking-[0.2em] uppercase">Hello World Cards · Till</p>
          {status === 'ready' && (
            <button
              type="button"
              className="link-underline cursor-pointer text-sm font-semibold"
              onClick={() => void handleLogout()}
              disabled={submitting}
            >
              Sign out
            </button>
          )}
        </div>
      </header>
      <main id="main" className="flex flex-1 flex-col" tabIndex={-1}>
        {status === 'loading' && (
          <section className="container-full flex flex-1 items-center py-24">
            <p className="content-l text-site-mantle">Opening the till…</p>
          </section>
        )}

        {status === 'error' && (
          <section className="container-full flex flex-1 items-center py-24">
            <p className="content-l text-site-mantle">The till could not be loaded. Refresh and try again.</p>
          </section>
        )}

        {status === 'login' && (
          <section className="container-full flex flex-1 items-center justify-center py-16 sm:py-24">
            <form
              onSubmit={(event) => void handleLogin(event)}
              className="flex w-full max-w-md flex-col gap-6 rounded-panel bg-site-gunmetal p-6 sm:p-8"
            >
              <div className="flex flex-col gap-2">
                <h1 className="title-l">Sign in</h1>
                <p className="content-s text-site-mantle">Private till. Spendings and potential gain for current stock.</p>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="till-username" className="text-sm font-medium">
                  Username
                </label>
                <input
                  id="till-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="field"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="till-password" className="text-sm font-medium">
                  Password
                </label>
                <input
                  id="till-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="field"
                />
              </div>
              <button
                type="submit"
                className="button-green cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                disabled={submitting}
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
              <div aria-live="polite">{message ? <p className="content-s text-site-loss">{message}</p> : null}</div>
            </form>
          </section>
        )}

        {status === 'ready' && ledger && (
          <section className="container-full section">
            <div className="flex max-w-4xl flex-col gap-4 lg:gap-6">
              <h1 className="title-l">Current stock</h1>
              <p className="content-l text-site-mantle">What you paid versus what you stand to make if every listed item sells.</p>
            </div>
            <div className="mt-12">
              <TillChart ledger={ledger} />
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
