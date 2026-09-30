// @vitest-environment jsdom

import { launchDevtools } from "@plainworks/devtools/launch"
import { createQueryClient } from "@plainworks/query"
import { QueryProvider } from "@plainworks/query/client"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { fakeStreamTransport } from "@plainworks/testkit/fakes"
import { createTestQueryClient } from "@plainworks/testkit/query"
import { render, waitFor } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { LiveChannelProvider } from "../live"
import { DevtoolsMount } from "./devtools-mount"

function inspectorRoot(): Element | null {
  return document.querySelector("[data-plainworks-devtools]")
}

// Load the lazily imported shell up front, so the mount below waits on rendering, not on a cold
// module transform.
beforeAll(async () => {
  await import("./inspector")
})

describe("DevtoolsMount", () => {
  it("mounts the inspector over the live runtime and removes it on unmount", async () => {
    const report = vi.fn()
    const launcher = launchDevtools({
      report,
      http: { instance: "api", label: "Demo API" },
      channel: { instance: "live", label: "Live tasks" },
    })
    const transport = fakeStreamTransport()

    const { unmount } = render(
      <QueryProvider client={createTestQueryClient(createQueryClient)}>
        <LiveChannelProvider options={{ transport: transport.factory }}>
          <DevtoolsMount launcher={launcher} />
        </LiveChannelProvider>
      </QueryProvider>,
    )
    await waitFor(() => expect(inspectorRoot()).not.toBeNull())
    await expectNoAxeViolations(document.body)

    unmount()
    expect(inspectorRoot()).toBeNull()
    expect(report).not.toHaveBeenCalled()
  })
})
