import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const SECRET = import.meta.env.VITE_CLAUDE_PROXY_SECRET
const CLAUDE_AVAILABLE = !!SECRET

const SYSTEM = [
  'You write a single-sentence morning health insight for a personal wellness PWA.',
  'Input is the user\'s Oura readings, deltas vs yesterday, and habit completion.',
  'Output exactly one short, calm, declarative sentence (≤140 chars) that names',
  'the most relevant signal and suggests a concrete posture for the day.',
  'No platitudes, no emoji, no preamble, no markdown. Plain text only.',
].join(' ')

const FALLBACK_INSIGHTS = [
  'Readings stable. Default day — handle the hardest task first, defer admin to the afternoon.',
  'Recovery looks neutral. Aim for one deep block before noon and protect sleep tonight.',
  'No clear signal yet. Move early, eat protein, and let the body cast the vote.',
]

function describeOura(oura) {
  if (!oura) return 'No Oura data synced yet.'
  const lines = [`readiness ${oura.readiness}${oura.delta ? ` (${oura.delta} vs yesterday)` : ''}`]
  for (const r of oura.rows ?? []) {
    lines.push(`${r.label} ${r.value}${r.delta ? ` (${r.delta})` : ''}`)
  }
  return lines.join('; ')
}

function describeHabits(habits) {
  if (!habits?.length) return 'no habits tracked'
  const done = habits.filter((h) => h.checked).map((h) => h.label)
  const skipped = habits.filter((h) => !h.checked).map((h) => h.label)
  return `${done.length}/${habits.length} done${
    done.length ? ` (${done.join(', ')})` : ''
  }${skipped.length ? `; pending: ${skipped.join(', ')}` : ''}`
}

export function useHealthInsight({ oura, habits, ready }) {
  const [insight, setInsight] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fallbackIdx = useRef(0)
  const cycle = useRef(0)

  const fetchInsight = useCallback(async () => {
    if (!ready) return
    if (!CLAUDE_AVAILABLE) {
      const i = fallbackIdx.current
      fallbackIdx.current = (i + 1) % FALLBACK_INSIGHTS.length
      setInsight(FALLBACK_INSIGHTS[i])
      return
    }
    setLoading(true)
    setError(null)
    const myCycle = ++cycle.current
    const input = [
      `Oura: ${describeOura(oura)}.`,
      `Habits: ${describeHabits(habits)}.`,
      'Write one insight sentence.',
    ].join('\n')
    try {
      // The function is named "claude" in the dashboard but its slug — which
      // is what /functions/v1/<slug> resolves on — is "quick-service".
      const { data, error: fnError } = await supabase.functions.invoke('quick-service', {
        body: {
          task: 'today-health-insight',
          system: SYSTEM,
          input,
          model: 'claude-haiku-4-5',
          maxTokens: 200,
        },
        headers: { 'x-stock-proxy-secret': SECRET },
      })
      if (cycle.current !== myCycle) return
      if (fnError) throw fnError
      const text = typeof data?.text === 'string' ? data.text.trim() : ''
      if (!text) throw new Error('empty response from claude fn')
      setInsight(text)
    } catch (e) {
      if (cycle.current !== myCycle) return
      console.error('useHealthInsight fetch failed', e)
      setError(e?.message ?? String(e))
      const i = fallbackIdx.current
      fallbackIdx.current = (i + 1) % FALLBACK_INSIGHTS.length
      setInsight(FALLBACK_INSIGHTS[i])
    } finally {
      if (cycle.current === myCycle) setLoading(false)
    }
  }, [oura, habits, ready])

  // Initial fetch once inputs are ready. We intentionally only fire on the
  // ready transition — re-fetching every time Oura/habits reference changes
  // would burn tokens for unchanged data; user-initiated regen handles refresh.
  const fired = useRef(false)
  useEffect(() => {
    if (!ready || fired.current) return
    fired.current = true
    fetchInsight()
  }, [ready, fetchInsight])

  return { insight, loading, error, regenerate: fetchInsight, available: CLAUDE_AVAILABLE }
}
