// App-owned capability fakes for `@plainworks/app`'s own tests. They stand in for real capabilities
// a consumer would write (a theme, a session, a marker), so the composition/SSR/ordering tests
// exercise the real machinery through app-owned doubles — never `@plainworks/testkit` (the L4
// sideways rule forbids it). Each fake returns the two halves a real capability is authored as — a
// neutral `resolve` (built with `defineCapability`, server-safe) and a client `provider` (built
// with `defineProvider`) joined by the same `id` — so the tests drive the real split. Deliberately
// NOT re-exported from `./testing`: these are test scaffolding, not shipped surface.
import { isRecord } from "@plainworks/std"
import { createContext, createElement, type ReactNode, useContext } from "react"
import { type ClientCapability, defineProvider } from "../client/capability"
import { AppConfigError } from "../errors"
import {
  type Capability,
  type CapabilityResolveContext,
  defineCapability,
} from "../kernel/capability"

/** A capability fake's two halves — its neutral server resolver and its client provider, joined by id. */
export interface FakeCapability<Resolved> {
  /** The neutral server-resolve half, for `createApp({ capabilities })`. */
  readonly resolve: Capability<Resolved>
  /** The client provider half, for `<AppProvider capabilities={[...]} />`. */
  readonly provider: ClientCapability
}

/** Read a single cookie value from a request's `Cookie` header — the fakes' server-resolve helper. */
function readCookie(context: CapabilityResolveContext, name: string): string | undefined {
  const header = context.headers.get("cookie")
  if (header === null) {
    return undefined
  }
  for (const part of header.split("; ")) {
    if (part.startsWith(`${name}=`)) {
      return decodeURIComponent(part.slice(name.length + 1))
    }
  }
  return undefined
}

/** The theme fake's resolved shape: the class a host would render onto `<html>` before hydration. */
export interface FakeTheme {
  readonly className: "dark" | "light"
}

function readFakeTheme(value: unknown): FakeTheme | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!isRecord(value) || (value.className !== "dark" && value.className !== "light")) {
    throw new AppConfigError("Malformed theme snapshot.")
  }
  return { className: value.className }
}

/**
 * A fake **theme** capability. Its resolver reads the `theme` cookie server-side; its provider
 * applies the resolved class on the **first** render (from the `resolved` prop, no mount effect) —
 * the mechanism the no-FOUC test asserts.
 */
export function fakeThemeCapability(dependsOn?: readonly string[]): FakeCapability<FakeTheme> {
  return {
    resolve: defineCapability<FakeTheme>({
      id: "theme",
      resolve: (context) => ({
        className: readCookie(context, "theme") === "dark" ? "dark" : "light",
      }),
    }),
    provider: defineProvider({
      id: "theme",
      ...(dependsOn === undefined ? {} : { dependsOn }),
      provider: ({ resolved, children }) => {
        const theme = readFakeTheme(resolved)
        return createElement(
          "div",
          { "data-testid": "theme-root", className: theme?.className ?? "unset" },
          children,
        )
      },
    }),
  }
}

/** The session fake's resolved shape: the client-safe view a host resolves from the session cookie. */
export interface FakeSession {
  readonly status: "authenticated" | "unauthenticated"
  readonly name: string | null
}

const FakeSessionContext = createContext<FakeSession>({ status: "unauthenticated", name: null })

function readFakeSession(value: unknown): FakeSession | undefined {
  if (value === undefined) {
    return undefined
  }
  if (
    !isRecord(value) ||
    (value.status !== "authenticated" && value.status !== "unauthenticated") ||
    (typeof value.name !== "string" && value.name !== null)
  ) {
    throw new AppConfigError("Malformed session snapshot.")
  }
  return { status: value.status, name: value.name }
}

/** Read the fake session inside a subtree of {@link fakeSessionCapability}'s provider. */
export function useFakeSession(): FakeSession {
  return useContext(FakeSessionContext)
}

/**
 * A fake **session** capability. Its resolver reads the `session` cookie server-side; its provider
 * publishes the resolved session through context so a child reads the authed state on the **first**
 * render — the mechanism the no-auth-flash test asserts.
 */
export function fakeSessionCapability(dependsOn?: readonly string[]): FakeCapability<FakeSession> {
  return {
    resolve: defineCapability<FakeSession>({
      id: "session",
      resolve: (context) => {
        const name = readCookie(context, "session")
        return name === undefined
          ? { status: "unauthenticated", name: null }
          : { status: "authenticated", name }
      },
    }),
    provider: defineProvider({
      id: "session",
      ...(dependsOn === undefined ? {} : { dependsOn }),
      provider: ({ resolved, children }) => {
        const session = readFakeSession(resolved)
        return createElement(
          FakeSessionContext.Provider,
          { value: session ?? { status: "unauthenticated", name: null } },
          children,
        )
      },
    }),
  }
}

/**
 * A fake **marker** capability — a provider-only client half whose provider wraps children in a
 * `data-cap` element. Because it nests (outer provider contains inner), a document-order walk of
 * the `data-cap` elements yields outermost->innermost — what the registry-order test asserts,
 * without any render-phase side effect.
 */
export function fakeMarkerCapability(id: string, dependsOn?: readonly string[]): ClientCapability {
  return defineProvider({
    id,
    ...(dependsOn === undefined ? {} : { dependsOn }),
    provider: ({ children }): ReactNode => createElement("div", { "data-cap": id }, children),
  })
}
