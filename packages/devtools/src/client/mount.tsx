"use client"

import { createRoot } from "react-dom/client"
import {
  createDevtoolsSession,
  type DevtoolsSession,
  type DevtoolsSessionOptions,
} from "../session"
import type { Source } from "../source"
import { DevtoolsShell, type DevtoolsShellProps } from "./shell/devtools-shell"

/** Options for {@link mountDevtools}; every one has a safe default. */
export interface MountDevtoolsOptions extends Omit<DevtoolsShellProps, "session"> {
  /** Sources to observe, registered into the owned session in order. */
  readonly sources?: readonly Source[]
  /** Retention, sanitize, and bridge bounds for the session the mount constructs. */
  readonly sessionOptions?: DevtoolsSessionOptions
  /** Where the inspector root is appended; defaults to `document.body`. */
  readonly container?: HTMLElement
}

/** A live inspector: the session it owns, and one teardown for everything it created. */
export interface DevtoolsMount {
  /** The owned session — register a late source or open another port against it. */
  readonly session: DevtoolsSession
  /** Unmount the shell and dispose the session and every source it holds. Idempotent. */
  dispose(): void
}

/**
 * Mount the embedded inspector: build a session, register the given sources beside the runtime
 * they observe, render the shell in an isolated React root, and hand back one teardown for all of
 * it. This performs no work at import time and infers nothing about the environment — the host
 * calls it only inside its own build-time development gate, e.g.
 * `if (import.meta.env.DEV) void import("@plainworks/devtools/client")`.
 *
 * Disposing releases every source the session holds, so a host never tracks registrations itself.
 * Pass {@link DevtoolsShellProps.session} to {@link DevtoolsShell} instead when the inspector must
 * render inside an existing React tree over a session the host already owns.
 *
 * The shell docks at the viewport edge and, by default, reserves that space on the document root so
 * it never covers application content; see {@link DevtoolsShellProps.reserveSpace}.
 */
export function mountDevtools({
  sources = [],
  sessionOptions,
  container,
  ...shellProps
}: MountDevtoolsOptions = {}): DevtoolsMount {
  const session = createDevtoolsSession(sessionOptions)
  try {
    for (const source of sources) session.registerSource(source)
  } catch (error) {
    session.dispose()
    throw error
  }

  const host = document.createElement("div")
  ;(container ?? document.body).append(host)
  const root = createRoot(host)
  root.render(<DevtoolsShell {...shellProps} session={session} />)

  let disposed = false
  return {
    session,
    dispose() {
      if (disposed) return
      disposed = true
      root.unmount()
      host.remove()
      session.dispose()
    },
  }
}
