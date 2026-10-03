import "../../src/client/styles.css"

import { createChannel } from "@plainworks/channel"
import { createEventRouter, protobufDecoder } from "@plainworks/channel/events"
import { createSseTransport } from "@plainworks/channel/transport"
import { Button } from "@plainworks/elements/button"
import { createHttpClient, HttpError } from "@plainworks/http"
import { createQueryClient } from "@plainworks/query"
import { createLiveQuery, type LiveQueryStatus } from "@plainworks/query/cache"
import { createRemoteSource } from "@plainworks/query/remote"
import { jsonSerializer, memoryScope } from "@plainworks/state"
import { createSourceReconciler, guardSchema } from "@plainworks/std/seam"
import { ProfileInputSchema } from "@plainworks/testkit/connect"
import { ThemeProvider } from "@plainworks/theme/client"
import type { ThemePreference } from "@plainworks/theme/preference"
import { type ReactElement, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

function LiveJourney(): ReactElement {
  const [value, setValue] = useState("Waiting for a snapshot")
  const [status, setStatus] = useState<LiveQueryStatus>("waiting")
  const [failure, setFailure] = useState<string>()
  const [composition] = useState(() => {
    const mode = { value: "initial" }
    const client = createQueryClient()
    return {
      mode,
      client,
      http: createHttpClient({ baseUrl: window.location.origin }),
      source: createRemoteSource<string>(client, ["live-snapshot"]),
      channel: createChannel({
        transport: createSseTransport({ url: () => `/live-stream?mode=${mode.value}` }),
        minUptimeMs: 0,
        reconnect: false,
        onError: (error) =>
          setFailure(
            error.authentication === "unauthenticated" ? "Sign in to continue" : error.message,
          ),
      }),
    }
  })
  useEffect(() => {
    const live = createLiveQuery(composition.client, {
      queryKey: ["live-snapshot"],
      queryFn: async ({ signal }) => {
        const response = await composition.http.get("/live-snapshot", {
          signal,
          schema: guardSchema((input): input is string => typeof input === "string"),
        })
        if (response === undefined) throw HttpError.decode()
        return response
      },
    })
    const statusSubscription = live.subscribe(() => setStatus(live.status))
    const stop = createSourceReconciler({
      source: composition.source,
      adopt: setValue,
      reset: () => setValue("Waiting for a snapshot"),
      report: () => setFailure("The snapshot could not be read"),
    }).start()
    const router = createEventRouter({
      channel: composition.channel,
      decode: protobufDecoder(ProfileInputSchema),
      sinks: [live],
      onError: (error) => setFailure(error.message),
    })
    composition.channel.connect()
    return () => {
      statusSubscription.unsubscribe()
      stop()
      router.close()
      composition.channel.close()
      composition.client.clear()
    }
  }, [composition])
  const reconnect = (mode: string): void => {
    composition.mode.value = mode
    composition.channel.close()
    composition.channel.connect()
  }
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Live data recovery</h1>
      <p>A remote-only subscriber stays current. Resets share one fetch; expired sessions stop.</p>
      <p>{value}</p>
      <output aria-label="Synchronization">{status}</output>
      {failure === undefined ? null : <p role="alert">{failure}</p>}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => reconnect("reset")}>Reconnect after reset</Button>
        <Button onClick={() => reconnect("auth")}>Expired session</Button>
      </div>
    </main>
  )
}

const container = document.getElementById("fixture")
if (container === null) throw new Error("Missing fixture container")
const themeSource = memoryScope.createSource<ThemePreference>({
  key: "live-theme",
  serializer: jsonSerializer<ThemePreference>(),
})
createRoot(container).render(
  <ThemeProvider source={themeSource}>
    <LiveJourney />
  </ThemeProvider>,
)
