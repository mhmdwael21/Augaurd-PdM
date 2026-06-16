import { useState, useEffect, useRef } from 'react'

export function usePoll(fetchFn, intervalMs) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const fetchRef = useRef(fetchFn)
  fetchRef.current = fetchFn

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        const result = await fetchRef.current()
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    run()
    const id = setInterval(run, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [intervalMs])

  return { data, error }
}
