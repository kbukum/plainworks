"use client"

import type { Authorizer } from "@plainworks/std"
import { type ReactNode, useEffect, useState } from "react"
import type { SessionContext } from "./session-context"

/** Props for the {@link AuthGates.RequireAuth} gate. */
export interface RequireAuthProps {
  /** Rendered only when the caller is authenticated. */
  readonly children: ReactNode
  /** Rendered when the caller is unauthenticated; nothing renders when omitted. */
  readonly fallback?: ReactNode
}

/** Props for the {@link AuthGates.Can} gate. */
export interface CanProps {
  /** The decision seam consulted for this action — may be a sync predicate or an async policy. */
  readonly authorizer: Authorizer
  /** The action being gated (`"post:delete"`), passed to the authorizer. */
  readonly action: string
  /** What the action targets, narrowed by the policy; omit for an action with no target. */
  readonly resource?: unknown
  /** Rendered only when the authorizer permits the action. */
  readonly children: ReactNode
  /** Rendered while the decision is pending or once it denies; nothing renders when omitted. */
  readonly fallback?: ReactNode
}

/** A pair of client authorization gates bound to one {@link SessionContext}. */
export interface AuthGates {
  /** Renders its children only for an authenticated caller, else the fallback. */
  readonly RequireAuth: (props: RequireAuthProps) => ReactNode
  /** Renders its children only when the authorizer permits the action, else the fallback. */
  readonly Can: (props: CanProps) => ReactNode
}

/**
 * Resolve a (possibly async) {@link Authorizer} for the current identity into an allow boolean.
 * Fail-closed and default-deny: a decision is honored only while it still matches the exact inputs
 * it was computed for, so changing the identity, action, resource, or authorizer synchronously
 * reverts the gate to `false` on the very next render — before the effect re-runs — and a prior
 * `allow` can never flash over newly-unauthorized inputs. A rejected or thrown policy is a denial,
 * and a decision that lands after unmount or an input change is discarded (`active`).
 */
function useIsAllowed(
  authorizer: Authorizer,
  identity: SessionContextIdentity,
  action: string,
  resource: unknown,
): boolean {
  const [decided, setDecided] = useState<{
    readonly deps: readonly [Authorizer, SessionContextIdentity, string, unknown]
    readonly allow: boolean
  } | null>(null)
  useEffect(() => {
    let active = true
    const deps = [authorizer, identity, action, resource] as const
    // `Promise.resolve().then(run)` defers the call so a synchronous throw is caught here too.
    Promise.resolve()
      .then(() => authorizer({ identity, action, resource }))
      .then(
        (decision) => {
          if (active) {
            setDecided({ deps, allow: decision.allow })
          }
        },
        () => {
          if (active) {
            setDecided({ deps, allow: false })
          }
        },
      )
    return () => {
      active = false
    }
  }, [authorizer, identity, action, resource])
  // Trust a resolved decision only for the inputs it was made against; any change fails closed
  // until the fresh decision settles.
  if (
    decided !== null &&
    decided.deps[0] === authorizer &&
    decided.deps[1] === identity &&
    decided.deps[2] === action &&
    decided.deps[3] === resource
  ) {
    return decided.allow
  }
  return false
}

type SessionContextIdentity = ReturnType<SessionContext["useIdentity"]>

/**
 * Build the client authorization gates for a session binding. A factory over the injected
 * {@link SessionContext} (no module-level singleton), so the gates read the same per-mount session
 * the rest of the app does. The gates are UX affordances — the real authorization gate is
 * enforced on the server; here they only decide what an already-authenticated user is shown, and
 * never touch a token.
 */
export function createAuthGates(context: SessionContext): AuthGates {
  function RequireAuth({ children, fallback }: RequireAuthProps): ReactNode {
    return context.useIsAuthenticated() ? children : (fallback ?? null)
  }

  function Can({ authorizer, action, resource, children, fallback }: CanProps): ReactNode {
    const identity = context.useIdentity()
    return useIsAllowed(authorizer, identity, action, resource) ? children : (fallback ?? null)
  }

  return { RequireAuth, Can }
}
