import { createClient } from "@connectrpc/connect"
import { createAuthStore } from "@plainworks/auth/session"
import { createChannel } from "@plainworks/channel"
import { createSseTransport } from "@plainworks/channel/transport"
import { createConnectRpcTransport } from "@plainworks/connect"
import { IdentityService } from "./identity_pb.js"

/**
 * Minimal real browser consumer of the shared opaque-session lifecycle. It wires the published
 * `@plainworks/*` browser exports against the real gokit auth HTTPS host served at the same origin:
 * `createAuthStore` owns the cookie session, the Connect transport borrows the session lease for a
 * protected `WhoAmI`, and the channel borrows the same lease for a protected SSE stream. No session
 * credential is ever read, stored, or placed in a URL here; the cookie stays HttpOnly.
 *
 * One `start()` owns the whole lifetime: the store, transport, channel, subscriptions and DOM
 * listeners. Its `stop()` releases all of them, and `pagehide` calls it.
 */

function errorLabel(error: unknown): string {
  if (error !== null && typeof error === "object") {
    const detail = error as { kind?: unknown; code?: unknown }
    const kind =
      typeof detail.kind === "string" ? detail.kind : ((error as Error).name ?? "unknown")
    const code = typeof detail.code === "string" ? `:${detail.code}` : ""
    return `error=${kind}${code}`
  }
  return "error=unknown"
}

function text(id: string, value: string): void {
  const node = document.getElementById(id)
  if (node !== null) node.textContent = value
}

/** Start the consumer; the returned `stop` closes the channel and session and drops every listener. */
function start(): () => void {
  const lifetime = new AbortController()
  const store = createAuthStore({ baseUrl: "/auth" })
  const transport = createConnectRpcTransport({
    baseUrl: window.location.origin,
    protectedSession: store.protectedSession,
  })
  const identity = createClient(IdentityService, transport)
  const channel = createChannel({
    transport: createSseTransport({ url: "/events" }),
    protectedSession: store.protectedSession,
    reconnect: true,
    onStatusChange: () => renderEvents(),
  })
  let frames = 0

  function renderAuth(): void {
    const snapshot = store.getSnapshot()
    const parts: string[] = [snapshot.status]
    if (snapshot.identity !== null) parts.push(snapshot.identity.subject)
    if (snapshot.expiresAt !== undefined) parts.push(`expires=${snapshot.expiresAt}`)
    if (snapshot.revocation !== undefined) parts.push(`revocation=${snapshot.revocation}`)
    if (snapshot.error !== undefined) parts.push(`error=${snapshot.error.name}`)
    text("auth-state", parts.join(" "))
  }

  function renderEvents(): void {
    const parts = [`status=${channel.status}`, `ready=${channel.ready}`, `frames=${frames}`]
    if (channel.error !== undefined) parts.push(`error=${channel.error.kind}`)
    text("events-state", parts.join(" "))
  }

  function wire(id: string, handler: () => Promise<void> | void): void {
    document.getElementById(id)?.addEventListener(
      "click",
      (event) => {
        event.preventDefault()
        void Promise.resolve()
          .then(handler)
          .catch((error: unknown) => text("app-ready", errorLabel(error)))
      },
      { signal: lifetime.signal },
    )
  }

  const frameSubscription = channel.onAny(() => {
    frames += 1
    renderEvents()
  })
  const errorSubscription = channel.onError(() => renderEvents())
  const offAuth = store.subscribe(() => renderAuth())

  wire("sign-in", async () => {
    const usernameInput = document.getElementById("username") as HTMLInputElement
    const passwordInput = document.getElementById("password") as HTMLInputElement
    const credentials = { username: usernameInput.value, password: passwordInput.value }
    // The password leaves the page's DOM as soon as it is submitted.
    passwordInput.value = ""
    text("login-state", "pending")
    try {
      await store.login(credentials)
      text("login-state", "ok")
    } catch (error) {
      text("login-state", errorLabel(error))
    }
  })

  wire("check-status", async () => {
    text("status-result", "pending")
    try {
      await store.revalidate()
      text("status-result", "ok")
    } catch (error) {
      text("status-result", errorLabel(error))
    }
  })

  wire("who-am-i", async () => {
    text("whoami-result", "pending")
    try {
      const response = await identity.whoAmI({}, { signal: lifetime.signal })
      text("whoami-result", response.value)
    } catch (error) {
      text("whoami-result", errorLabel(error))
    }
  })

  wire("open-events", () => {
    frames = 0
    channel.connect()
    renderEvents()
  })

  wire("close-events", () => {
    channel.close()
    renderEvents()
  })

  wire("sign-out", async () => {
    text("logout-state", "pending")
    try {
      await store.logout()
      text("logout-state", "confirmed")
    } catch (error) {
      text("logout-state", `unconfirmed=${errorLabel(error).slice(6)}`)
    }
  })

  renderAuth()
  renderEvents()
  text("app-ready", "ready")

  return () => {
    lifetime.abort()
    frameSubscription.unsubscribe()
    errorSubscription.unsubscribe()
    offAuth()
    channel.close()
    store.close()
  }
}

const stop = start()
window.addEventListener("pagehide", stop, { once: true })
