import { useEffect, useState } from 'react'

// Increments each time the document transitions to visible. Use as a
// useEffect dep on data-fetching hooks so they refetch when the PWA
// returns to the foreground.
export function useVisibilityKey() {
  const [key, setKey] = useState(0)
  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === 'visible') {
        setKey((k) => k + 1)
      }
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return key
}
