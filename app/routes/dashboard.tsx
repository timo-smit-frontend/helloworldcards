import { FormEvent, useEffect, useState } from 'react'
import DashboardChart, { PeriodToggle } from '~/components/dashboard/DashboardChart'
import SkipToMainContent from '~/components/elements/SkipToMainContent'
import type { Ledger, LedgerPeriod } from '~/database/ledger-types'

type Status = 'loading' | 'login' | 'ready' | 'error'

export default function Dashboard() {
  const [status, setStatus] = useState<Status>('loading')
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [period, setPeriod] = useState<LedgerPeriod>('all')

  async function loadLedger() {
    const response = await fetch('/dashboard/ledger', { credentials: 'same-origin' })
    if (response.status === 401) {
      setLedger(null)
      setStatus('login')
      return
    }

    if (response.status === 503) {
      setMessage('Sign in is not available.')
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

      if (response.status === 503) {
        setMessage('Sign in is not available.')
        setStatus('login')
        return
      }

      if (!response.ok) {
        setMessage('Wrong username or password')
        setStatus('login')
        return
      }

      setPassword('')
      await loadLedger()
    } catch {
      setMessage('Could not sign in. Try again.')
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
          <p className="text-sm font-semibold tracking-[0.2em] uppercase">
            {status === 'ready' ? 'Hello World Cards · Dashboard' : 'Hello World Cards'}
          </p>
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
            <p className="content-l text-site-mantle">Loading…</p>
          </section>
        )}

        {status === 'error' && (
          <section className="container-full flex flex-1 items-center py-24">
            <p className="content-l text-site-mantle">This page could not be loaded. Refresh and try again.</p>
          </section>
        )}

        {status === 'login' && (
          <section className="container-full flex flex-1 items-center justify-center py-16 sm:py-24">
            <form
              onSubmit={(event) => void handleLogin(event)}
              className="flex w-full max-w-md flex-col gap-6 rounded-panel bg-site-gunmetal p-6 sm:p-8"
            >
              <h1 className="title-l">Sign in</h1>
              <div className="flex flex-col gap-2">
                <label htmlFor="dashboard-username" className="text-sm font-medium">
                  Username
                </label>
                <input
                  id="dashboard-username"
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
                <label htmlFor="dashboard-password" className="text-sm font-medium">
                  Password
                </label>
                <input
                  id="dashboard-password"
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
            <div className="flex flex-col gap-4 lg:gap-6">
              <h1 className="title-l">The books</h1>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="content-l text-site-mantle">What you paid, what came back, and what is still listed.</p>
                <PeriodToggle period={period} onChange={setPeriod} />
              </div>
            </div>
            <div className="mt-12">
              <DashboardChart ledger={ledger} period={period} />
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
