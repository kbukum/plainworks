"use client"

import { Button } from "@plainworks/elements/button"
import { Kbd } from "@plainworks/elements/kbd"
import type { StateSource } from "@plainworks/std/seam"
import { type Clock, systemClock } from "@plainworks/std/time"
import { cn } from "@plainworks/theme"
import { useKeyboardShortcuts } from "@plainworks/ui/hooks/use-keyboard-shortcuts"
import { Bug } from "lucide-react"
import { type ReactElement, useId, useRef, useState, useSyncExternalStore } from "react"
import type { DevtoolsSession } from "../../session"
import { DockSidePicker } from "../dock/dock-side-picker"
import { useHostReservation } from "../dock/host-reservation"
import { type DevtoolsDockSide, type DevtoolsLayout, withPanelSize } from "../dock/layout"
import { createDevtoolsLayoutSource } from "../dock/layout-source"
import { PanelResizeHandle } from "../dock/panel-resize-handle"
import { useDockLayout } from "../dock/use-dock-layout"
import { DevtoolsInspector } from "../inspector/devtools-inspector"
import type { SourceRendererMap } from "../inspector/source-panel"
import { DiagnosticsRail } from "../rail/diagnostics-rail"
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
  /**
   * Side the devtools dock to until the user picks one in the inspector; the user's choice then
   * wins. Defaults to `bottom`. Below a 48rem viewport every side falls back to the bottom.
   */
  readonly defaultDock?: DevtoolsDockSide
  /**
   * Where the user's dock side and panel sizes persist. Defaults to the browser's `localStorage`
   * under {@link DEVTOOLS_LAYOUT_KEY}; inject another source to keep the layout elsewhere.
   */
  readonly layoutSource?: StateSource<DevtoolsLayout>
  /**
   * Reserve the docked chrome's space on the document root, so it never covers host content or
   * focus. Defaults to `true`. Pass `false` when the host lays out around the published
   * `--plainworks-devtools-inset-bottom`/`-left`/`-right` custom properties itself.
   */
  readonly reserveSpace?: boolean
  /** Age in milliseconds after which a rail indicator reads as stale. Defaults to 10s. */
  readonly staleAfterMs?: number
  /** Freshness re-poll cadence in milliseconds; `0` freezes the clock. Defaults to 1000. */
  readonly tickMs?: number
  /** Clock shared by every view. Defaults to `systemClock`. */
  readonly clock?: Clock
  /** Rail entries shown before overflow. Defaults to 4. */
  readonly railMaxVisible?: number
}

/**
 * The embedded devtools shell over one host-owned session: a bar docked to one viewport edge with
 * the diagnostics rail and the inspector toggle, plus the non-modal inspector it opens beside the
 * bar. From the inspector the user moves the dock to the bottom, left, or right and resizes the
 * panel; that layout persists through `layoutSource`. The bar and the open panel reserve their
 * space on the document root (see {@link useHostReservation}), so they sit beside the host instead
 * of over it. Everything renders under the package's style root, so the
 * package stylesheet styles it without any host build. Mounting connects one port and store;
 * unmounting tears both down and clears the reservation. Render it only under the host's
 * build-time development gate — the shell itself never inspects the environment.
 */
export function DevtoolsShell({
  session,
  renderers,
  shortcut = "mod+shift+d",
  defaultDock = "bottom",
  layoutSource,
  reserveSpace = true,
  staleAfterMs = 10_000,
  tickMs = 1_000,
  clock = systemClock,
  railMaxVisible = 4,
}: DevtoolsShellProps): ReactElement {
  const { port, store, state } = useDevtoolsConnection(session)
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<string>()
  // The server renders the neutral hint; the client swaps in its platform's after hydration.
  const apple = useSyncExternalStore(subscribeToNothing, isApplePlatform, () => false)
  const scopeRef = useRef<HTMLDivElement>(null)
  const panelId = `${useId()}-inspector`
  // One per mount; it touches storage only on its first read, so an injected source costs nothing.
  const [browserSource] = useState(createDevtoolsLayoutSource)
  const { layout, dock, sideDockFits, failure, setLayout } = useDockLayout(
    layoutSource ?? browserSource,
    defaultDock,
  )
  const vertical = dock.side !== "bottom"

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
        data-dock={dock.side}
        className={cn(
          "@container/bar fixed z-overlay flex items-center gap-2 bg-popover px-2 text-popover-foreground",
          BAR_LAYOUT[dock.side],
        )}
      >
        <DiagnosticsRail
          sources={state.sources}
          failures={state.failures}
          indicators={state.indicators}
          droppedAggregate={state.droppedAggregate}
          clock={clock}
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
          className={cn("ms-auto shrink-0", vertical && "h-auto w-7 py-2.5")}
        >
          <Bug aria-hidden />
          Inspect
          {shortcut === null || vertical ? null : (
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
        side={dock.side}
        actions={
          <DockSidePicker
            side={dock.side}
            sideDockFits={sideDockFits}
            onSideChange={(side) => setLayout({ ...layout, side })}
            {...(failure === undefined ? {} : { failure })}
          />
        }
        resizeHandle={
          <PanelResizeHandle
            dock={dock}
            controls={panelId}
            onResize={(size) => setLayout(withPanelSize(layout, dock, size))}
          />
        }
        state={state}
        store={store}
        port={port}
        {...(renderers === undefined ? {} : { renderers })}
        {...(target === undefined ? {} : { target })}
      />
    </div>
  )
}

// The bar runs along the docked edge. On a side it turns vertical: its writing mode rotates, so
// the rail and the toggle keep their inline flow and read top to bottom. Placement is physical,
// because logical insets would rotate with that writing mode.
const BAR_LAYOUT: Readonly<Record<DevtoolsDockSide, string>> = {
  bottom: "right-0 bottom-0 left-0 h-(--plainworks-devtools-bar-size) border-t",
  left: "top-0 bottom-0 left-0 w-(--plainworks-devtools-bar-size) border-r [writing-mode:vertical-rl]",
  right:
    "top-0 right-0 bottom-0 w-(--plainworks-devtools-bar-size) border-l [writing-mode:vertical-rl]",
}

function subscribeToNothing(): () => void {
  return () => {}
}
