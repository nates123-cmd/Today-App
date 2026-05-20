import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STATES = {
  loading: 'loading',
  prompt: 'prompt',
  sent: 'sent',
  ready: 'ready',
}

export function AuthGate({ children }) {
  const [state, setState] = useState(STATES.loading)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setState(data.session ? STATES.ready : STATES.prompt)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setState(session ? STATES.ready : STATES.prompt)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const sendLink = async (e) => {
    e.preventDefault()
    if (!email || sending) return
    setSending(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    setSending(false)
    if (error) {
      setError(error.message)
      return
    }
    setState(STATES.sent)
  }

  if (state === STATES.loading) {
    return <div className="auth-shell" />
  }

  if (state === STATES.ready) {
    return children
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-eyebrow">today</div>
        <h1 className="auth-title">Sign in</h1>

        {state === STATES.prompt && (
          <form onSubmit={sendLink} className="auth-form">
            <label className="auth-label" htmlFor="auth-email">
              email
            </label>
            <input
              id="auth-email"
              className="auth-input"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <button className="auth-btn" type="submit" disabled={sending || !email}>
              {sending ? 'sending…' : 'email me a link'}
            </button>
            {error && <div className="auth-error">{error}</div>}
          </form>
        )}

        {state === STATES.sent && (
          <div className="auth-sent">
            <p>Check <strong>{email}</strong>.</p>
            <p className="auth-hint">
              Tap the sign-in link in the email. You'll be signed in once you return here.
            </p>
            <button className="auth-btn-link" onClick={() => setState(STATES.prompt)}>
              use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
