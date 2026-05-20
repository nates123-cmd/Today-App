import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

function App() {
  const [status, setStatus] = useState('loading')
  const [mantra, setMantra] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('mantras')
      .select('*')
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setStatus('error')
          setError(error.message)
          return
        }
        setStatus('connected')
        setMantra(data?.[0] ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="boot">
      <h1 className="boot-title">Today</h1>
      <p className="boot-status" data-status={status}>
        {status === 'loading' && 'connecting to supabase…'}
        {status === 'connected' && 'supabase connected'}
        {status === 'error' && `supabase error: ${error}`}
      </p>
      {mantra && (
        <section className="boot-mantra">
          <p className="boot-mantra-label">mantra</p>
          <p className="boot-mantra-body">{mantra.text ?? JSON.stringify(mantra)}</p>
        </section>
      )}
    </main>
  )
}

export default App
