"use client"

import { useEffect, useState } from "react"

/**
 * The current clock reading, re-polled every `tickMs` so time-derived presentation (staleness,
 * freshness fades) stays honest. The timer is owned by the component and cleared on unmount;
 * `tickMs <= 0` disables polling for deterministic tests and static renders. The clock itself is
 * injected — the hook never reads `Date.now` on its own.
 */
export function useNow(now: () => number, tickMs: number): number {
  const [current, setCurrent] = useState(now)
  useEffect(() => {
    if (tickMs <= 0) return
    const timer = setInterval(() => setCurrent(now()), tickMs)
    return () => clearInterval(timer)
  }, [now, tickMs])
  return current
}
