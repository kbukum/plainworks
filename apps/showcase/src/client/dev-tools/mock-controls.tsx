"use client"

import { Button } from "@plainworks/elements/button"
import { Field, FieldDescription, FieldLabel } from "@plainworks/elements/field"
import { Input } from "@plainworks/elements/input"
import { Switch } from "@plainworks/elements/switch"
import { MAX_LATENCY_MS } from "@plainworks/mocks"
import { type FormEvent, type ReactElement, useEffect, useState } from "react"

/** Props for the mock behavior controls. */
export interface MockControlsProps {
  readonly errorEnabled: boolean
  readonly latencyMs: number
  readonly pending: boolean
  readonly onErrorChange: (enabled: boolean) => void
  readonly onLatencyChange: (latencyMs: number) => void
  readonly onReset: () => void
}

/** Controls for the demo mock's global delay, error gate, and seeded-data reset. */
export function MockControls({
  errorEnabled,
  latencyMs,
  pending,
  onErrorChange,
  onLatencyChange,
  onReset,
}: MockControlsProps): ReactElement {
  const [latencyDraft, setLatencyDraft] = useState(String(latencyMs))

  useEffect(() => setLatencyDraft(String(latencyMs)), [latencyMs])

  function applyLatency(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const next = Number(latencyDraft)
    if (Number.isFinite(next) && next >= 0 && next <= MAX_LATENCY_MS) {
      onLatencyChange(next)
    }
  }

  return (
    <section aria-labelledby="mock-controls-title" className="grid gap-3">
      <div>
        <h3 id="mock-controls-title" className="font-medium">
          Mock behavior
        </h3>
        <p className="text-sm text-muted-foreground">
          Changes apply to subsequent browser API requests.
        </p>
      </div>
      <Field orientation="horizontal">
        <div className="grid flex-1 gap-0.5">
          <FieldLabel htmlFor="mock-errors">Simulate API errors</FieldLabel>
          <FieldDescription>Return a 500 response from every demo API endpoint.</FieldDescription>
        </div>
        <Switch
          id="mock-errors"
          checked={errorEnabled}
          disabled={pending}
          onCheckedChange={onErrorChange}
        />
      </Field>
      <form className="flex flex-wrap items-end gap-2" onSubmit={applyLatency}>
        <Field className="max-w-48">
          <FieldLabel htmlFor="mock-latency">Latency in milliseconds</FieldLabel>
          <Input
            id="mock-latency"
            type="number"
            min={0}
            max={MAX_LATENCY_MS}
            step={25}
            value={latencyDraft}
            disabled={pending}
            onChange={(event) => setLatencyDraft(event.currentTarget.value)}
          />
        </Field>
        <Button type="submit" variant="outline" disabled={pending}>
          Apply latency
        </Button>
      </form>
      <Button type="button" variant="outline" disabled={pending} onClick={onReset}>
        Reset mock data
      </Button>
    </section>
  )
}
