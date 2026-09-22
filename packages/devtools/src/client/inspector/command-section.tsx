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
import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import { type ReactElement, useEffect, useRef, useState } from "react"
import { type CommandDescriptor, type SourceDescriptor, sourceKey } from "../../protocol"
import type { DevtoolsClientPort } from "../../session"

/** Props for {@link CommandSection}. */
export interface CommandSectionProps {
  /** The client port commands flow through. */
  readonly port: DevtoolsClientPort
  /** Source whose advertised commands are rendered. */
  readonly source: SourceDescriptor
}

type Outcome =
  | { readonly status: "succeeded"; readonly text: string }
  | { readonly status: "failed"; readonly text: string }

/**
 * The command surface of a source, separated from observation by risk. Safe commands run on
 * intent; mutating commands carry a visible marker; destructive commands gate behind an explicit
 * confirmation. Outcomes are announced (`status` / `alert`) and failures stay actionable — the
 * typed error message is shown, never swallowed. Generic commands run with `null` input; a custom
 * panel that needs arguments calls `port.runCommand` itself.
 */
export function CommandSection({ port, source }: CommandSectionProps): ReactElement | null {
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const [outcome, setOutcome] = useState<Outcome>()
  const controllers = useRef(new Map<string, AbortController>())
  const currentKey = sourceKey(source.id)

  // Abort every in-flight command on unmount or when the source/port identity changes.
  useEffect(() => {
    const owned = controllers.current
    void port
    void currentKey
    return () => {
      for (const controller of owned.values()) controller.abort()
      owned.clear()
      setPendingIds(new Set())
      setOutcome(undefined)
    }
  }, [port, currentKey])

  if (source.commands.length === 0) return null

  async function run(command: CommandDescriptor): Promise<void> {
    // A re-run supersedes the previous run of the same command.
    controllers.current.get(command.id)?.abort()
    const controller = new AbortController()
    controllers.current.set(command.id, controller)
    setPendingIds((prev) => new Set([...prev, command.id]))
    setOutcome(undefined)
    try {
      const result = await port.runCommand(source.id, command.id, null, controller.signal)
      if (controller.signal.aborted) return
      if (result.ok) {
        setOutcome({ status: "succeeded", text: `${command.label}: ${formatValue(result.value)}` })
      } else if (result.error.kind !== "devtools/request-cancelled") {
        setOutcome({
          status: "failed",
          text: `${command.label} failed: ${errorText(result.error)}`,
        })
      }
    } finally {
      // Only clear pending/controller state when this run is still the current one. A superseded
      // run settling later must not re-enable the replacement that already took its place.
      if (controllers.current.get(command.id) === controller) {
        controllers.current.delete(command.id)
        setPendingIds((prev) => {
          if (!prev.has(command.id)) return prev
          const next = new Set(prev)
          next.delete(command.id)
          return next
        })
      }
    }
  }

  return (
    <section aria-label={`${source.label} commands`} className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {source.commands.map((command) => (
          <CommandControl
            key={command.id}
            command={command}
            pending={pendingIds.has(command.id)}
            onRun={() => void run(command)}
          />
        ))}
      </div>
      {outcome === undefined ? null : outcome.status === "succeeded" ? (
        <p role="status" className="text-muted-foreground text-xs">
          {outcome.text}
        </p>
      ) : (
        <p role="alert" className="text-destructive text-xs">
          {outcome.text}
        </p>
      )}
    </section>
  )
}

interface CommandControlProps {
  readonly command: CommandDescriptor
  readonly pending: boolean
  readonly onRun: () => void
}

function CommandControl({ command, pending, onRun }: CommandControlProps): ReactElement {
  const marker =
    command.risk === "mutating" ? <Badge variant="secondary">Mutates state</Badge> : null

  if (command.risk !== "destructive") {
    return (
      <span className="inline-flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!command.available || pending}
          onClick={onRun}
        >
          {command.label}
        </Button>
        {marker}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!command.available || pending}
            >
              {command.label}
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{command.label}</AlertDialogTitle>
            <AlertDialogDescription>
              This is a destructive command. It cannot be undone from the inspector.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {/* The action atom does not close; the confirm is a Close styled as the destructive
                action so the dialog dismisses and the outcome is announced on the page. */}
            <AlertDialogCancel variant="destructive" onClick={onRun}>
              {`Confirm ${command.label}`}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  )
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "done"
  try {
    const text = JSON.stringify(value)
    return text.length > 120 ? `${text.slice(0, 117)}…` : text
  } catch {
    return "done"
  }
}

function errorText(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "message" in error.cause &&
    typeof error.cause.message === "string"
  ) {
    return error.cause.message
  }
  return error instanceof Error ? error.message : "Unknown error"
}
