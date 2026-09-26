"use client"

import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import {
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
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
 * The command surface of a source, separated from observation by risk. Safe commands run on intent;
 * mutating commands carry a visible marker; destructive commands gate behind an inline confirmation
 * that keeps the inspector non-modal and puts focus on the safe choice. Outcomes are announced
 * (`status` / `alert`) and failures stay actionable — the typed error message is shown, never
 * swallowed. Generic commands run with `null` input; a custom panel that needs arguments calls
 * `port.runCommand` itself.
 */
export function CommandSection({ port, source }: CommandSectionProps): ReactElement | null {
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const [outcome, setOutcome] = useState<Outcome>()
  const controllers = useRef(new Map<string, AbortController>())
  const sectionRef = useRef<HTMLElement>(null)
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
    <section
      ref={sectionRef}
      aria-label={`${source.label} commands`}
      tabIndex={-1}
      className="grid gap-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        {source.commands.map((command) => (
          <CommandControl
            key={command.id}
            command={command}
            pending={pendingIds.has(command.id)}
            focusFallback={sectionRef}
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
  /** Takes focus when a closed confirmation cannot return it to a disabled trigger. */
  readonly focusFallback: RefObject<HTMLElement | null>
}

function CommandControl({
  command,
  pending,
  onRun,
  focusFallback,
}: CommandControlProps): ReactElement {
  const disabled = !command.available || pending
  if (command.risk === "destructive") {
    return (
      <DestructiveCommand
        command={command}
        disabled={disabled}
        onRun={onRun}
        focusFallback={focusFallback}
      />
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onRun}>
        {command.label}
      </Button>
      {command.risk === "mutating" ? <Badge variant="secondary">Mutates state</Badge> : null}
    </span>
  )
}

interface DestructiveCommandProps {
  readonly command: CommandDescriptor
  readonly disabled: boolean
  readonly onRun: () => void
  readonly focusFallback: RefObject<HTMLElement | null>
}

function DestructiveCommand({
  command,
  disabled,
  onRun,
  focusFallback,
}: DestructiveCommandProps): ReactElement {
  const [confirming, setConfirming] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const descriptionId = useId()

  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus()
    } else if (restoreFocus.current) {
      restoreFocus.current = false
      const trigger = triggerRef.current
      // A confirmed run disables the trigger while pending; keep focus in the section instead.
      if (trigger !== null && !trigger.disabled) trigger.focus()
      else focusFallback.current?.focus()
    }
  }, [confirming, focusFallback])

  const cancel = (): void => {
    restoreFocus.current = true
    setConfirming(false)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>): void => {
    if (event.key !== "Escape") return
    // Consumed here, so the inspector around the confirmation stays open.
    event.preventDefault()
    cancel()
  }

  if (!confirming) {
    return (
      <Button
        ref={triggerRef}
        type="button"
        variant="destructive"
        size="sm"
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        {command.label}
      </Button>
    )
  }

  return (
    <fieldset
      aria-label={`Confirm ${command.label}`}
      aria-describedby={descriptionId}
      onKeyDown={handleKeyDown}
      className="flex min-w-0 basis-full flex-wrap items-center gap-2 rounded-md border border-destructive p-2"
    >
      <p id={descriptionId} className="min-w-0 flex-1 basis-48 text-xs">
        {`${command.label} is destructive and cannot be undone from the inspector.`}
      </p>
      <Button ref={cancelRef} type="button" variant="outline" size="sm" onClick={cancel}>
        Cancel
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={disabled}
        onClick={() => {
          restoreFocus.current = true
          setConfirming(false)
          onRun()
        }}
      >
        {`Confirm ${command.label}`}
      </Button>
    </fieldset>
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
