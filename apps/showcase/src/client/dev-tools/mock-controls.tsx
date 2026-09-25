"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@plainworks/elements/alert-dialog"
import { Button } from "@plainworks/elements/button"
import { Field, FieldDescription, FieldLabel } from "@plainworks/elements/field"
import { Input } from "@plainworks/elements/input"
import { Switch } from "@plainworks/elements/switch"
import { MAX_LATENCY_MS } from "@plainworks/mocks"
import { type KeyboardEvent, type ReactElement, useEffect, useState } from "react"

/** Props for {@link MockControls}. */
export interface MockControlsProps {
  readonly errorEnabled: boolean
  readonly latencyMs: number
  readonly pending: boolean
  readonly onErrorChange: (enabled: boolean) => void
  readonly onLatencyChange: (latencyMs: number) => void
  readonly onClearLog: () => void
  readonly onReset: () => void
}

/**
 * The demo backend's behavior controls: the global error gate, the fixed request latency, a
 * request-log clear, and a destructive data reset gated behind confirmation. Each control invokes a
 * risk-tagged command the panel dispatches through the session port.
 */
export function MockControls({
  errorEnabled,
  latencyMs,
  pending,
  onErrorChange,
  onLatencyChange,
  onClearLog,
  onReset,
}: MockControlsProps): ReactElement {
  const [latencyDraft, setLatencyDraft] = useState(String(latencyMs))

  useEffect(() => setLatencyDraft(String(latencyMs)), [latencyMs])

  function applyLatency(): void {
    const draft = latencyDraft.trim()
    if (draft === "") return
    const next = Number(draft)
    if (Number.isFinite(next) && next >= 0 && next <= MAX_LATENCY_MS) {
      onLatencyChange(next)
    }
  }

  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault()
      applyLatency()
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
      <div className="flex flex-wrap items-end gap-2">
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
            onKeyDown={submitOnEnter}
          />
        </Field>
        <Button type="button" variant="outline" disabled={pending} onClick={applyLatency}>
          Apply latency
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onClearLog}>
          Clear request log
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button type="button" variant="outline" disabled={pending} />}
          >
            Reset mock data
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset mock data?</AlertDialogTitle>
              <AlertDialogDescription>
                This clears every recorded request and restores the seeded fixtures for this
                browser.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogCancel variant="destructive" onClick={onReset}>
                Reset
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  )
}
