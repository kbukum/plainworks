"use client"

import { Button } from "@plainworks/elements/button"
import { Field, FieldLabel } from "@plainworks/elements/field"
import { NativeSelect, NativeSelectOption } from "@plainworks/elements/native-select"
import type { HttpClient } from "@plainworks/http"
import { type ReactElement, useEffect, useState } from "react"
import {
  REQUEST_TARGETS,
  type RequestProbeResult,
  type RequestTarget,
  runRequestProbe,
} from "./mock-control"

/** Props for the request tester. */
export interface RequestTesterProps {
  readonly client: HttpClient
  readonly now: () => number
  readonly onComplete: () => void
}

function resultBody(result: RequestProbeResult): string {
  if (result.error !== undefined) {
    return result.error
  }
  if (result.body === undefined) {
    return "No response body"
  }
  return JSON.stringify(result.body, null, 2)
}

/** Sends a fixed, safe request through the same typed HTTP client as the showcase sections. */
export function RequestTester({ client, now, onComplete }: RequestTesterProps): ReactElement {
  const [method, setMethod] = useState<RequestTarget["method"]>("GET")
  const targets = REQUEST_TARGETS.filter((target) => target.method === method)
  const [path, setPath] = useState(targets[0]?.path ?? "")
  const [result, setResult] = useState<RequestProbeResult>()
  const [pending, setPending] = useState(false)
  const [lifecycle] = useState(() => new AbortController())

  useEffect(() => () => lifecycle.abort(), [lifecycle])

  const selected =
    targets.find((target) => target.path === path) ?? targets[0] ?? REQUEST_TARGETS[0]

  async function send(): Promise<void> {
    if (selected === undefined) return
    setPending(true)
    try {
      const probe = await runRequestProbe(client, selected, now, lifecycle.signal)
      if (lifecycle.signal.aborted) return
      setResult(probe)
      onComplete()
    } finally {
      if (!lifecycle.signal.aborted) {
        setPending(false)
      }
    }
  }

  return (
    <section aria-labelledby="request-tester-title" className="grid gap-3">
      <div>
        <h3 id="request-tester-title" className="font-medium">
          Request tester
        </h3>
        <p className="text-sm text-muted-foreground">
          Probe a fixed demo endpoint through the app HTTP client.
        </p>
      </div>
      <div className="grid gap-3 @md/dev-tools:grid-cols-[8rem_minmax(0,1fr)]">
        <Field>
          <FieldLabel htmlFor="request-method">Request method</FieldLabel>
          <NativeSelect
            id="request-method"
            value={method}
            disabled={pending}
            onChange={(event) => {
              const next = event.currentTarget.value === "POST" ? "POST" : "GET"
              setMethod(next)
              setPath(REQUEST_TARGETS.find((target) => target.method === next)?.path ?? "")
              setResult(undefined)
            }}
          >
            <NativeSelectOption value="GET">GET</NativeSelectOption>
            <NativeSelectOption value="POST">POST</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="request-endpoint">Request endpoint</FieldLabel>
          <NativeSelect
            id="request-endpoint"
            className="w-full"
            value={selected?.path ?? ""}
            disabled={pending}
            onChange={(event) => {
              setPath(event.currentTarget.value)
              setResult(undefined)
            }}
          >
            {targets.map((target) => (
              <NativeSelectOption key={target.path} value={target.path}>
                {target.label} — {target.path}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Button
        type="button"
        disabled={pending || selected === undefined}
        onClick={() => void send()}
      >
        {pending ? "Sending…" : "Send request"}
      </Button>
      {result === undefined ? null : (
        <div
          role="status"
          aria-label="Request result"
          className="grid gap-2 rounded-lg border bg-muted/30 p-3"
        >
          <p className="text-sm font-medium">
            {result.status === undefined ? "Request failed" : `Status ${result.status}`} ·{" "}
            {result.durationMs} ms
          </p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">
            {resultBody(result)}
          </pre>
        </div>
      )}
    </section>
  )
}
