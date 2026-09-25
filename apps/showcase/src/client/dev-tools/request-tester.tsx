"use client"

import type { Json } from "@plainworks/devtools"
import { Button } from "@plainworks/elements/button"
import { Field, FieldLabel } from "@plainworks/elements/field"
import { NativeSelect, NativeSelectOption } from "@plainworks/elements/native-select"
import { isRecord } from "@plainworks/std"
import { type ReactElement, useState } from "react"
import { REQUEST_TARGETS, type RequestTarget } from "./request-probe"

/** Props for {@link RequestTester}. */
export interface RequestTesterProps {
  readonly pending: boolean
  /** Dispatch a fixed probe command; resolves with the probe's serialized outcome. */
  readonly onProbe: (method: RequestTarget["method"], path: string) => Promise<Json | undefined>
}

function outcomeText(result: Json | undefined): string | undefined {
  if (!isRecord(result)) return undefined
  const status = typeof result.status === "number" ? String(result.status) : "no status"
  const duration = typeof result.durationMs === "number" ? `${result.durationMs} ms` : "unknown"
  const failure = typeof result.error === "string" ? ` — ${result.error}` : ""
  return `Status ${status} in ${duration}${failure}`
}

/**
 * Send a fixed, safe request through the same allowlisted targets the section UI uses, so a
 * developer can exercise the demo backend without an arbitrary-URL request console. The probe runs
 * as a risk-tagged command; its serialized outcome is shown inline.
 */
export function RequestTester({ pending, onProbe }: RequestTesterProps): ReactElement {
  const [method, setMethod] = useState<RequestTarget["method"]>("GET")
  const targets = REQUEST_TARGETS.filter((target) => target.method === method)
  const [path, setPath] = useState(targets[0]?.path ?? "")
  const [outcome, setOutcome] = useState<string>()

  const selected = targets.find((target) => target.path === path) ?? targets[0]

  function changeMethod(next: RequestTarget["method"]): void {
    setMethod(next)
    setPath(REQUEST_TARGETS.find((target) => target.method === next)?.path ?? "")
    setOutcome(undefined)
  }

  async function send(): Promise<void> {
    if (selected === undefined) return
    const result = await onProbe(selected.method, selected.path)
    setOutcome(outcomeText(result) ?? "The probe returned no outcome.")
  }

  return (
    <section aria-labelledby="mock-request-tester-title" className="grid gap-3">
      <div>
        <h3 id="mock-request-tester-title" className="font-medium">
          Request tester
        </h3>
        <p className="text-sm text-muted-foreground">
          Send a fixed, allowlisted request through the app's HTTP client.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field className="max-w-28">
          <FieldLabel htmlFor="probe-method">Method</FieldLabel>
          <NativeSelect
            id="probe-method"
            value={method}
            disabled={pending}
            onChange={(event) => changeMethod(event.currentTarget.value as RequestTarget["method"])}
          >
            <NativeSelectOption value="GET">GET</NativeSelectOption>
            <NativeSelectOption value="POST">POST</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field className="min-w-48 flex-1">
          <FieldLabel htmlFor="probe-path">Target</FieldLabel>
          <NativeSelect
            id="probe-path"
            value={path}
            disabled={pending}
            onChange={(event) => setPath(event.currentTarget.value)}
          >
            {targets.map((target) => (
              <NativeSelectOption key={target.path} value={target.path}>
                {target.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void send()}>
          Send probe
        </Button>
      </div>
      {outcome === undefined ? null : (
        <p role="status" className="text-sm text-muted-foreground">
          {outcome}
        </p>
      )}
    </section>
  )
}
