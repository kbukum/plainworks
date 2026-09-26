"use client"

import { Button } from "@plainworks/elements/button"
import { Kbd } from "@plainworks/elements/kbd"
import { useKeyboardShortcuts } from "@plainworks/ui/hooks"
import { Bug } from "lucide-react"
import { type ReactElement, useId, useRef, useState, useSyncExternalStore } from "react"
import type { DevtoolsSession } from "../../session"
import { DevtoolsInspector } from "../inspector/devtools-inspector"
import type { SourceRendererMap } from "../inspector/source-panel"
import { DiagnosticsRail } from "../rail/diagnostics-rail"
import { type DevtoolsDock, useHostReservation } from "./host-reservation"
import { isApplePlatform, shortcutAriaKeys, shortcutHint } from "./shortcut"
import { useDevtoolsConnection } from "./use-devtools-connection"

/** Props for {@link DevtoolsShell}. */
export interface DevtoolsShellProps {
  /** The host-owned session; the shell connects to it and never disposes it. */
  readonly session: DevtoolsSession
  /** Kind-keyed custom panels, injected at the call site. */
  readonly renderers?: SourceRendererMap
  /** Keyboard shortcut toggling the inspector (`"mod+shift+d"`); `null` disables it. */
  readonly shortcut?: string | null
  /** Edge the inspector docks to. Defaults to `auto`: right on wide viewports, else bottom. */
  readonly dock?: DevtoolsDock
  /**
   * Reserve the docked chrome's space on the document root, so it never covers host content or
   * focus. Defaults to `true`. Pass `false` when the host lays out around the published
   * `--plainworks-devtools-inset-*` custom properties itself.
   */
  readonly reserveSpace?: boolean
  /** Age in milliseconds after which a rail indicator reads as stale. Defaults to 10s. */
  readonly staleAfterMs?: number
  /** Freshness re-poll cadence in milliseconds; `0` freezes the clock. Defaults to 1000. */
  readonly tickMs?: number
  /** Injected clock shared by every view. Defaults to `Date.now`. */
  readonly now?: () => number
  /** Rail entries shown before overflow. Defaults to 4. */
  readonly railMaxVisible?: number
}

/**
 * The embedded devtools shell over one host-owned session: a docked bar with the diagnostics rail
 * and the inspector toggle, plus the non-modal inspector it opens. The bar and the open panel
 * reserve their space on the document root (see {@link useHostReservation}), so they sit beside
 * the host instead of over it. Everything renders under the package's style root, so the
 * package stylesheet styles it without any host build. Mounting connects one port and store;
 * unmounting tears both down and clears the reservation. Render it only under the host's
 * build-time development gate — the shell itself never inspects the environment.
 */
export function DevtoolsShell({
  session,
  renderers,
  shortcut = "mod+shift+d",
  dock = "auto",
  reserveSpace = true,
  staleAfterMs = 10_000,
  tickMs = 1_000,
  now = Date.now,
  railMaxVisible = 4,
}: DevtoolsShellProps): ReactElement {
  const { port, store, state } = useDevtoolsConnection(session)
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<string>()
  // The server renders the neutral hint; the client swaps in its platform's after hydration.
  const apple = useSyncExternalStore(subscribeToNothing, isApplePlatform, () => false)
  const scopeRef = useRef<HTMLDivElement>(null)
  const panelId = `${useId()}-inspector`

  useHostReservation(scopeRef, { dock, open, reserve: reserveSpace })

  useKeyboardShortcuts(
    shortcut === null
      ? {}
      : {
          [shortcut]: (event) => {
            event.preventDefault()
            setTarget(undefined)
            setOpen((current) => !current)
          },
        },
  )

  const openAt = (nextTarget?: string): void => {
    setTarget(nextTarget)
    setOpen(true)
  }
  const handleOpenChange = (nextOpen: boolean): void => {
    setOpen(nextOpen)
    // Consume the rail target: reopening by shortcut shows the last-used tab, not a stale jump.
    if (!nextOpen) setTarget(undefined)
  }

  return (
    <div ref={scopeRef} data-plainworks-devtools="" className="contents">
      <section
        aria-label="Plainworks devtools"
        className="@container/bar fixed inset-x-0 bottom-0 z-overlay flex h-(--plainworks-devtools-bar-size) items-center gap-2 border-t bg-popover px-2 text-popover-foreground"
      >
        <DiagnosticsRail
          sources={state.sources}
          failures={state.failures}
          indicators={state.indicators}
          droppedAggregate={state.droppedAggregate}
          now={now}
          staleAfterMs={staleAfterMs}
          tickMs={tickMs}
          maxVisible={railMaxVisible}
          onOpen={openAt}
        />
        <Button
          type="button"
          variant={open ? "secondary" : "default"}
          size="sm"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-keyshortcuts={shortcut === null ? undefined : shortcutAriaKeys(shortcut, apple)}
          onClick={() => (open ? handleOpenChange(false) : openAt(undefined))}
          className="ms-auto shrink-0"
        >
          <Bug aria-hidden />
          Inspect
          {shortcut === null ? null : (
            <Kbd aria-hidden className="@max-md/bar:hidden">
              {shortcutHint(shortcut, apple)}
            </Kbd>
          )}
        </Button>
      </section>
      <DevtoolsInspector
        id={panelId}
        open={open}
        onOpenChange={handleOpenChange}
        dock={dock}
        state={state}
        store={store}
        port={port}
        {...(renderers === undefined ? {} : { renderers })}
        {...(target === undefined ? {} : { target })}
      />
    </div>
  )
}

function subscribeToNothing(): () => void {
  return () => {}
}
