import { useState, useEffect, useRef } from 'react'

const API = 'http://localhost:8000'

export default function useGreenhouseState(setupComplete) {
  const [state, setState] = useState(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!setupComplete) {
      setState(null)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const fetchState = () => {
      fetch(`${API}/state`)
        .then(r => r.json())
        .then(setState)
        .catch(() => {})
    }

    fetchState()
    intervalRef.current = setInterval(fetchState, 5000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [setupComplete])

  return state
}
