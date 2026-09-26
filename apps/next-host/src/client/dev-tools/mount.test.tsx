// @vitest-environment jsdom

import { type Channel, createChannel } from "@plainworks/channel"
import { createQueryClient } from "@plainworks/query"
import type { Subscription } from "@plainworks/std"
import { fakeStreamTransport } from "@plainworks/testkit"
import { describe, expect, it, vi } from "vitest"
import { mountNextHostDevtools } from "./mount"
import { createDevtoolsSeams, type DevtoolsSeams } from "./seams"

/** A never-connected channel over the kit's scripted transport — no network, no timers. */
function idleChannel(): Channel {
  return createChannel({ transport: fakeStreamTransport().factory })
}

/** Wrap the seams so the test can observe whether the channel observation is released. */
function trackObservation(seams: DevtoolsSeams): { seams: DevtoolsSeams; released: () => boolean } {
  let released = false
  return {
    released: () => released,
    seams: {
      http: seams.http,
      channel: {
        ...seams.channel,
        observe(channel: Channel): Subscription {
          const subscription = seams.channel.observe(channel)
          return {
            unsubscribe() {
              released = true
              subscription.unsubscribe()
            },
          }
        },
      },
    },
  }
}

describe("mountNextHostDevtools", () => {
  it("mounts the inspector beside the runtime and tears it down on cleanup", async () => {
    const tracked = trackObservation(createDevtoolsSeams())

    const teardown = mountNextHostDevtools({
      seams: tracked.seams,
      queryClient: createQueryClient(),
      channel: idleChannel(),
    })
    await vi.waitFor(() =>
      expect(document.querySelector("[data-plainworks-devtools]")).not.toBeNull(),
    )

    teardown()
    expect(document.querySelector("[data-plainworks-devtools]")).toBeNull()
    expect(tracked.released()).toBe(true)
  })
  it("releases the channel observation when the inspector fails to mount", () => {
    const tracked = trackObservation(createDevtoolsSeams())
    // Registering one source twice makes the mount throw after the observation attached.
    const seams = {
      ...tracked.seams,
      channel: { ...tracked.seams.channel, source: tracked.seams.http.source },
    }

    expect(() =>
      mountNextHostDevtools({ seams, queryClient: createQueryClient(), channel: idleChannel() }),
    ).toThrow()
    expect(tracked.released()).toBe(true)
  })
})
