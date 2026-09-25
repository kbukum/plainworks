"use client"

import "@plainworks/devtools/styles.css"

import type { Channel } from "@plainworks/channel"
import { mountDevtools } from "@plainworks/devtools/client"
import { createQuerySource } from "@plainworks/devtools/query"
import type { QueryClient } from "@plainworks/query"
import type { DevtoolsSeams } from "./seams"

/** Live runtime handles the inspector observes, read from the provider tree at mount time. */
export interface MountNextHostDevtoolsArgs {
  readonly seams: DevtoolsSeams
  readonly queryClient: QueryClient
  readonly channel: Channel
}

/**
 * Observe the live runtime and render the shell; return teardown. This is the only module that
 * pulls the devtools CSS and DOM, so it is loaded exclusively through the host's development gate
 * and never appears in a production bundle. The HTTP and channel sources were created up front
 * (their seams already wrap the client and the channel options); the query source and channel
 * frame observation attach here, post-construction.
 */
export function mountNextHostDevtools({
  seams,
  queryClient,
  channel,
}: MountNextHostDevtoolsArgs): () => void {
  const observation = seams.channel.observe(channel)
  try {
    const { dispose } = mountDevtools({
      sources: [
        seams.http.source,
        seams.channel.source,
        createQuerySource({ client: queryClient, instance: "app", label: "App cache" }),
      ],
    })
    return () => {
      dispose()
      observation.unsubscribe()
    }
  } catch (error) {
    observation.unsubscribe()
    throw error
  }
}
