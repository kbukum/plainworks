"use client"

import { Button } from "@plainworks/elements/button"
import { Kbd } from "@plainworks/elements/kbd"
import { cn } from "@plainworks/theme"
import { useKeyboardShortcuts } from "@plainworks/ui/hooks"
import { Bug } from "lucide-react"
import { type ReactElement, useState } from "react"
import type { DevtoolsSession } from "../../session"
import { DevtoolsInspector } from "../inspector/devtools-inspector"
import type { SourceRendererMap } from "../inspector/source-panel"
import { DiagnosticsRail } from "../rail/diagnostics-rail"
import { useDevtoolsConnection } from "./use-devtools-connection"

/** Which ambient presentation the shell renders. */
export type DevtoolsPresentation = "launcher" | "rail" | "both"

/** Props for {@link DevtoolsShell}. */
export interface DevtoolsShellProps {
  /** The host-owned session; the shell connects to it and never disposes it. */
  readonly session: DevtoolsSession
  /** Kind-keyed custom panels, injected at the call site. */
  readonly renderers?: SourceRendererMap
  /** Ambient presentation: a floating launcher, the diagnostics rail, or both. Defaults to `both`. */
  readonly presentation?: DevtoolsPresentation
  /** Keyboard shortcut opening the inspector (`"mod+shift+d"`); `null` disables it. */
  readonly shortcut?: string | null
  /** Edge the inspector docks to. Defaults to `right`. */
  readonly dock?: "right" | "bottom"
  /** Age in milliseconds after which a rail indicator reads as stale. Defaults to 10s. */
  readonly staleAfterMs?: number
  /** Freshness re-poll cadence in milliseconds; `0` freezes the clock. Defaults to 1000. */
  readonly tickMs?: number
  /** Injected clock shared by every view. Defaults to `Date.now`. */
  readonly now?: () => number
  /** Rows the rail shows before overflow. Defaults to 4. */
  readonly railMaxVisible?: number
}

/**
 * The embedded devtools shell: a diagnostics rail and/or floating launcher over one host-owned
 * session, plus the focus-managed inspector they open. Mounting performs all work (one port, one
 * store); unmounting tears both down. Render it only under the host's build-time development
 * gate — the shell itself never inspects the environment.
 */
export function DevtoolsShell({
  session,
  renderers,
  presentation = "both",
  shortcut = "mod+shift+d",
  dock = "right",
  staleAfterMs = 10_000,
  tickMs = 1_000,
  now = Date.now,
  railMaxVisible = 4,
}: DevtoolsShellProps): ReactElement {
  const { port, store, state } = useDevtoolsConnection(session)
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<string>()
  const [apple] = useState(isApplePlatform)

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

  const showLauncher = presentation !== "rail"
  const showRail = presentation !== "launcher"

  return (
    <>
      {showLauncher ? (
        <Button
          type="button"
          onClick={() => openAt(undefined)}
          aria-label="Open Plainworks inspector"
          className={cn(
            "fixed right-4 z-40 min-h-11 gap-2 shadow-lg",
            showRail ? "bottom-12" : "bottom-4",
          )}
        >
          <Bug aria-hidden className="size-4" />
          Inspect
          {shortcut === null ? null : <Kbd>{shortcutLabel(shortcut, apple)}</Kbd>}
        </Button>
      ) : null}
      {showRail ? (
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
      ) : null}
      <DevtoolsInspector
        open={open}
        onOpenChange={handleOpenChange}
        dock={dock}
        state={state}
        store={store}
        port={port}
        {...(renderers === undefined ? {} : { renderers })}
        {...(target === undefined ? {} : { target })}
      />
    </>
  )
}

/** `"mod+shift+d"` → a platform-appropriate hint for the launcher Kbd. */
function shortcutLabel(shortcut: string, apple: boolean): string {
  return shortcut
    .split("+")
    .map((part) => {
      const token = part.trim().toLowerCase()
      // `mod` binds Meta (⌘) on Apple platforms and Ctrl elsewhere; the hint follows suit.
      if (token === "mod") return apple ? "⌘" : "Ctrl"
      if (token === "shift") return apple ? "⇧" : "Shift"
      if (token === "alt" || token === "option") return apple ? "⌥" : "Alt"
      if (token === "ctrl" || token === "control") return apple ? "⌃" : "Ctrl"
      return token.toUpperCase()
    })
    .join(apple ? "" : "+")
}

/** Whether the host platform uses ⌘ as its primary modifier, resolved once at mount. */
function isApplePlatform(): boolean {
  return typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform)
}
