// @vitest-environment jsdom

import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient } from "@plainworks/query"
import { fakeStateSource } from "@plainworks/testkit"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { ThemeProvider } from "@plainworks/theme/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ToastProvider } from "../feedback"
import { HttpClientProvider } from "../http-client"
import { RouterProvider } from "../router"
import { SessionProvider } from "../session"
import { LocalPreferencesProvider } from "./local-preferences-provider"
import { SettingsSection } from "./settings-section"

// The Settings hub proven from the user's vantage over the real kit stack: `@plainworks/ui` forms
// and `@plainworks/elements` atoms, an `@plainworks/http` client against the `@plainworks/demo` MSW
// backend, a hydrated `@plainworks/query` read, `@plainworks/auth` gating, and the
// `@plainworks/state` persistent scope for the device-local motion preference. Every assertion is a
// role/label query driven with `user-event`; no real network or timer.

const handle = createMockServerHandle()
const AUTHED = {
  status: "authenticated" as const,
  identity: { subject: "user-123", claims: { name: "Ada" } },
}

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => installMatchMedia())
afterEach(() => {
  cleanup()
  handle.server.resetHandlers()
  handle.api.reset()
  localStorage.clear()
  vi.unstubAllGlobals()
})
afterAll(() => handle.server.close())

function renderSettings(options: { authed?: boolean; named?: boolean; path?: string } = {}) {
  const { authed = true, named = true, path = "/settings" } = options
  const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } })
  const snapshot = named
    ? AUTHED
    : {
        status: "authenticated" as const,
        identity: { subject: "user-123", claims: {} },
      }
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider {...(authed ? { initialSnapshot: snapshot } : {})}>
        <HttpClientProvider client={httpClient}>
          <ThemeProvider source={fakeStateSource()}>
            <RouterProvider initialPath={path}>
              <ToastProvider>
                <LocalPreferencesProvider>
                  <SettingsSection />
                </LocalPreferencesProvider>
              </ToastProvider>
            </RouterProvider>
          </ThemeProvider>
        </HttpClientProvider>
      </SessionProvider>
    </QueryClientProvider>,
  )
}

async function findProfileForm(): Promise<HTMLElement> {
  return screen.findByLabelText(/^Display name/)
}

describe("settings section", () => {
  it("shows the profile panel seeded from the server on first load", async () => {
    renderSettings()
    const displayName = (await findProfileForm()) as HTMLInputElement
    expect(displayName.value).toBe("Ada Lovelace")
    expect(screen.getByRole("tab", { name: "Profile" })).toBeDefined()
  })

  it("blocks a save and shows an inline error when the display name is cleared", async () => {
    const user = userEvent.setup()
    renderSettings()
    const displayName = (await findProfileForm()) as HTMLInputElement

    await user.clear(displayName)
    await user.click(screen.getByRole("button", { name: "Save profile" }))

    expect(await screen.findByText("Display name is required.")).toBeDefined()
    expect(screen.queryByText("Profile saved")).toBeNull()
  })

  it("saves a valid profile change and confirms with a toast", async () => {
    const user = userEvent.setup()
    renderSettings()
    const displayName = (await findProfileForm()) as HTMLInputElement

    await user.clear(displayName)
    await user.type(displayName, "Grace Hopper")
    await user.click(screen.getByRole("button", { name: "Save profile" }))

    expect(await screen.findByText("Profile saved")).toBeDefined()
    expect(handle.api.settings.get("user-123").profile.displayName).toBe("Grace Hopper")
  })

  it("reconciles normalized profile values after a save", async () => {
    const user = userEvent.setup()
    renderSettings()
    const displayName = (await findProfileForm()) as HTMLInputElement

    await user.clear(displayName)
    await user.type(displayName, "  Grace Hopper  ")
    await user.click(screen.getByRole("button", { name: "Save profile" }))

    expect(await screen.findByText("Profile saved")).toBeDefined()
    await waitFor(() =>
      expect((screen.getByLabelText(/^Display name/) as HTMLInputElement).value).toBe(
        "Grace Hopper",
      ),
    )
  })

  it("surfaces a failure toast when the save request fails", async () => {
    const user = userEvent.setup()
    renderSettings()
    const displayName = (await findProfileForm()) as HTMLInputElement
    handle.server.use(http.patch("*/api/settings", () => new HttpResponse(null, { status: 500 })))

    await user.clear(displayName)
    await user.type(displayName, "Grace Hopper")
    await user.click(screen.getByRole("button", { name: "Save profile" }))

    expect(await screen.findByText("Your profile could not be saved")).toBeDefined()
  })

  it("deep-links a panel through the tablist and saves the number field", async () => {
    const user = userEvent.setup()
    renderSettings()
    await findProfileForm()

    await user.click(screen.getByRole("tab", { name: "Preferences" }))

    const rows = (await screen.findByLabelText("Rows per page")) as HTMLInputElement
    expect(rows.value).toBe("20")
    await user.clear(rows)
    await user.type(rows, "40")
    await user.click(screen.getByRole("button", { name: "Save preferences" }))

    expect(await screen.findByText("Preferences saved")).toBeDefined()
    expect(handle.api.settings.get("user-123").preferences.itemsPerPage).toBe(40)
  })

  it("opens the deep-linked panel from the initial path", async () => {
    renderSettings({ path: "/settings/notifications" })
    expect(await screen.findByText("Delivery channels")).toBeDefined()
  })

  it("saves the notification switches and privacy checkboxes as booleans", async () => {
    const user = userEvent.setup()
    renderSettings({ path: "/settings/notifications" })
    const sms = await screen.findByRole("switch", { name: "SMS" })

    await user.click(sms)
    await user.click(screen.getByRole("checkbox", { name: /Show my profile/ }))
    await user.click(screen.getByRole("button", { name: "Save notifications" }))

    expect(await screen.findByText("Notification settings saved")).toBeDefined()
    const saved = handle.api.settings.get("user-123")
    expect(saved.notifications.sms).toBe(true)
    expect(saved.privacy.profileVisible).toBe(false)
  })

  it("persists the device-local motion preference across a remount", async () => {
    const user = userEvent.setup()
    const first = renderSettings({ path: "/settings/appearance" })
    await user.click(await screen.findByRole("radio", { name: /Reduced motion/ }))

    first.unmount()
    renderSettings({ path: "/settings/appearance" })

    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: /Reduced motion/ }).getAttribute("aria-checked"),
      ).toBe("true"),
    )
  })

  it("surfaces a device-preference persistence failure", async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError")
    })
    renderSettings({ path: "/settings/appearance" })

    await user.click(await screen.findByRole("radio", { name: /Reduced motion/ }))

    expect(await screen.findByText("Your device preferences could not be saved")).toBeDefined()
  })

  it("shows a sign-in prompt to a guest instead of the panels", async () => {
    renderSettings({ authed: false })
    expect(await screen.findByText("Sign in to manage your account settings.")).toBeDefined()
    expect(screen.queryByLabelText("Display name")).toBeNull()
  })

  it("hides edit controls when the server policy would deny the identity", async () => {
    renderSettings({ named: false })
    expect(await screen.findByText("You cannot manage account settings.")).toBeDefined()
    expect(screen.queryByLabelText("Display name")).toBeNull()
  })

  it("keeps device-local appearance controls available without account-write permission", async () => {
    renderSettings({ named: false, path: "/settings/appearance" })
    expect(await screen.findByRole("radiogroup", { name: "Motion" })).toBeDefined()
  })

  it("renders an error state when the settings read fails", async () => {
    handle.server.use(http.get("*/api/settings", () => new HttpResponse(null, { status: 500 })))
    renderSettings()
    expect(await screen.findByText("Settings are unavailable")).toBeDefined()
  })

  it.each([
    {
      panel: "profile",
      path: "/settings",
      ready: () => screen.findByLabelText(/^Display name/),
    },
    {
      panel: "preferences",
      path: "/settings/preferences",
      ready: () => screen.findByLabelText("Rows per page"),
    },
    {
      panel: "notifications",
      path: "/settings/notifications",
      ready: () => screen.findByRole("switch", { name: "Email" }),
    },
    {
      panel: "appearance",
      path: "/settings/appearance",
      ready: () => screen.findByRole("radiogroup", { name: "Motion" }),
    },
  ])("carries no axe violations in the $panel panel", async ({ path, ready }) => {
    const { container } = renderSettings({ path })
    await ready()
    await expectNoAxeViolations(container)
  })
})
