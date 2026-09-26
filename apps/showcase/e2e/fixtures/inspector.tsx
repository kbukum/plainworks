import "@plainworks/devtools/styles.css"

import type { Source, SourceObserver } from "@plainworks/devtools"
import { mountDevtools } from "@plainworks/devtools/client"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

// `?scenario=large` stresses layout with production-sized data: many source tabs, a full timeline
// of long URL labels, and long indicator values.
const LARGE = new URLSearchParams(window.location.search).get("scenario") === "large"
const LARGE_KINDS = ["http", "query", "state", "channel", "connect", "observability", "mock"]
const LONG_URL =
  "https://api.example.test/v1/organizations/acme-corporation/projects/plainworks-inspector/notifications/read-all?include=recipients,delivery-status"

function largeSource(kind: string): Source {
  return {
    id: { kind, instance: `${kind}-primary-instance-with-a-long-name` },
    label: `${kind} runtime with a deliberately long descriptive label`,
    connect(observer) {
      for (let i = 0; i < 120; i++) {
        observer.emit({
          kind: `${kind}.response`,
          label: `POST ${LONG_URL}&page=${i} → 403 (8ms)`,
          severity: i % 7 === 0 ? "error" : "ok",
          at: 1_000 + i,
          detail: `${kind}-${i}`,
        })
      }
      observer.indicate({
        id: "latency",
        label: "Latency percentile across every registered endpoint",
        value: "p99 1,284ms over the last 1,000 requests",
        severity: "warn",
        updatedAt: 1_000,
        target: kind,
      })
      return {
        resolveDetail: async (ref) => ({
          ref,
          url: LONG_URL,
          headers: { "x-request-id": `${ref}-${"f".repeat(96)}` },
        }),
        dispose() {},
      }
    },
  }
}

function createFixtureRuntime() {
  const observers = new Map<string, SourceObserver>()
  let disposedSources = 0
  function source(instance: string, label: string): Source {
    return {
      id: { kind: "fixture", instance },
      label: `${label} cache`,
      connect(observer) {
        observers.set(instance, observer)
        observer.emit({
          kind: "ready",
          label: `${label} ready`,
          severity: "ok",
          at: 1_000,
        })
        observer.indicate({
          id: "health",
          label: instance === "primary" ? "Cache health" : "Backup",
          value: instance === "primary" ? "degraded" : "ready",
          severity: instance === "primary" ? "warn" : "ok",
          updatedAt: 1_000,
          target: "fixture",
        })
        if (instance === "primary") {
          observer.indicate({
            id: "context",
            label: "Host",
            value: "browser",
            severity: "info",
            updatedAt: 1_000,
            target: "overview",
          })
        }
        return {
          dispose() {
            observers.delete(instance)
            disposedSources++
          },
        }
      },
    }
  }
  const { dispose: unmount } = mountDevtools({
    sources: LARGE
      ? LARGE_KINDS.map(largeSource)
      : [source("primary", "Primary"), source("secondary", "Secondary")],
    sessionOptions: LARGE
      ? { retention: { perSource: 120, aggregate: 500 } }
      : { retention: { perSource: 3, aggregate: 3 } },
    now: () => 1_000,
    tickMs: 0,
    railMaxVisible: 2,
  })
  let disposed = false
  return {
    observers,
    dispose() {
      if (disposed) return disposedSources
      disposed = true
      unmount()
      return disposedSources
    },
  }
}

function InspectorConsumer() {
  const [disposed, setDisposed] = useState(false)
  const [runtime, setRuntime] = useState<ReturnType<typeof createFixtureRuntime>>()
  useEffect(() => {
    const instance = createFixtureRuntime()
    setRuntime(instance)
    return () => {
      instance.dispose()
    }
  }, [])
  const [disposedSources, setDisposedSources] = useState(0)
  return (
    <main>
      <h1>Inspector consumer fixture</h1>
      <button
        type="button"
        disabled={disposed || runtime === undefined}
        onClick={() =>
          runtime?.observers.get("primary")?.fail(new Error("Fixture source unavailable"))
        }
      >
        Fail primary source
      </button>
      <button
        type="button"
        disabled={disposed || runtime === undefined}
        onClick={() => {
          for (let i = 0; i < 520; i++) {
            runtime?.observers.get("secondary")?.emit({
              kind: "burst",
              label: `Event ${i}`,
              severity: "info",
              at: 1_000 + i,
            })
          }
        }}
      >
        Emit burst
      </button>
      <button
        type="button"
        disabled={disposed || runtime === undefined}
        onClick={() => {
          if (runtime === undefined) return
          setDisposedSources(runtime.dispose())
          setDisposed(true)
        }}
      >
        Dispose inspector
      </button>
      <p role="status">{disposed ? `Disposed ${disposedSources} sources` : "Observing"}</p>
      {/* Tall host content whose last control must stay reachable beside the docked chrome. */}
      <div style={{ height: "150vh" }} />
      <button type="button">Last host control</button>
    </main>
  )
}

const root = document.getElementById("fixture")
if (root === null) throw new Error("Missing consumer fixture root")
createRoot(root).render(<InspectorConsumer />)
