import "@plainworks/devtools/styles.css"

import type { Source, SourceObserver } from "@plainworks/devtools"
import { mountDevtools } from "@plainworks/devtools/client"
import { Button } from "@plainworks/elements/button"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

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
    sources: [source("primary", "Primary"), source("secondary", "Secondary")],
    sessionOptions: { retention: { perSource: 3, aggregate: 3 } },
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
    <main className="grid gap-4 p-4">
      <h1>Inspector consumer fixture</h1>
      <Button
        type="button"
        disabled={disposed || runtime === undefined}
        onClick={() =>
          runtime?.observers.get("primary")?.fail(new Error("Fixture source unavailable"))
        }
      >
        Fail primary source
      </Button>
      <Button
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
      </Button>
      <Button
        type="button"
        disabled={disposed || runtime === undefined}
        onClick={() => {
          if (runtime === undefined) return
          setDisposedSources(runtime.dispose())
          setDisposed(true)
        }}
      >
        Dispose inspector
      </Button>
      <p role="status">{disposed ? `Disposed ${disposedSources} sources` : "Observing"}</p>
    </main>
  )
}

const root = document.getElementById("fixture")
if (root === null) throw new Error("Missing consumer fixture root")
createRoot(root).render(<InspectorConsumer />)
