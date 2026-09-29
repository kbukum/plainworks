"use client"

import type { Clock } from "@plainworks/std/time"
import { useEffect, useState } from "react"

/**
 * The current clock reading, re-polled every `tickMs` so time-derived presentation (staleness,
 * freshness fades) stays honest. The timer is owned by the component and cleared on unmount;
 * `tickMs <= 0` disables polling for deterministic tests and static renders. The clock itself is
 * injected, so the hook never reads the system clock on its own.
 */
export function useNow(clock: Clock, tickMs: number): number {
  const [current, setCurrent] = useState(() => clock.now())
  useEffect(() => {
    if (tickMs <= 0) return
    const timer = setInterval(() => setCurrent(clock.now()), tickMs)
    return () => clearInterval(timer)
  }, [clock, tickMs])
  return current
}
