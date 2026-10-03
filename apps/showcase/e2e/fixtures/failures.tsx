import "../../src/client/styles.css"

import { createClient } from "@connectrpc/connect"
import { createFailureHandler } from "@plainworks/app"
import { createConnectRpcTransport } from "@plainworks/connect"
import { createProtobufForm } from "@plainworks/connect/forms"
import { createQueryOptions } from "@plainworks/connect/query"
import { Button } from "@plainworks/elements/button"
import { createQueryClient } from "@plainworks/query"
import { jsonSerializer, memoryScope } from "@plainworks/state"
import { RemoteFailure } from "@plainworks/std/failure"
import { type ProfileInput, ProfileInputSchema, ProfileService } from "@plainworks/testkit/connect"
import { ThemeProvider } from "@plainworks/theme/client"
import type { ThemePreference } from "@plainworks/theme/preference"
import { Form } from "@plainworks/ui/forms/form"
import { FormSubmit } from "@plainworks/ui/forms/form-submit"
import { TextField } from "@plainworks/ui/forms/text-field"
import { type ReactElement, useEffect, useState, useTransition } from "react"
import { createRoot } from "react-dom/client"

function FailureJourney(): ReactElement {
  const [status, setStatus] = useState("Ready")
  const [pending, startTransition] = useTransition()
  const [composition] = useState(() => {
    const transport = createConnectRpcTransport({
      baseUrl: window.location.origin,
      retry: {
        maxAttempts: 3,
        budgetMs: 1000,
        backoff: { baseMs: 10, maxMs: 100, factor: 2, jitter: "full" },
      },
    })
    return {
      transport,
      query: createQueryClient(),
      client: createClient(ProfileService, transport),
      schema: createProtobufForm(ProfileInputSchema),
      owner: new AbortController(),
      handle: createFailureHandler({
        onFailure: ({ message }) => setStatus(message),
        onUnauthenticated: () => setStatus("Sign in to continue"),
      }),
    }
  })
  useEffect(
    () => () => {
      composition.owner.abort()
      composition.query.clear()
    },
    [composition],
  )

  const read = (label: string): void =>
    startTransition(async () => {
      try {
        const result = await composition.query.fetchQuery(
          createQueryOptions(
            ProfileService.method.getProfile,
            { displayName: label },
            { transport: composition.transport },
          ),
        )
        setStatus(result.displayName)
      } catch (error) {
        if (!(error instanceof RemoteFailure)) throw error
        composition.handle(error)
      }
    })

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Failures and forms</h1>
      <p>
        Server validation stays with the field. Transient reads retry once here; an expired session
        asks you to sign in.
      </p>
      <Form<ProfileInput>
        schema={composition.schema}
        onFailure={composition.handle}
        onSubmit={async (input: ProfileInput) => {
          await composition.client.saveProfile(input, { signal: composition.owner.signal })
        }}
      >
        <TextField name="label" label="Name" defaultValue="Ada" />
        <TextField name="addresses[0].zip" label="Postal code" defaultValue="10001" />
        <FormSubmit>Save profile</FormSubmit>
      </Form>
      <div className="flex flex-wrap gap-3">
        <Button disabled={pending} onClick={() => read("retry")}>
          Retryable read
        </Button>
        <Button disabled={pending} onClick={() => read("auth")}>
          Expired session
        </Button>
      </div>
      <output>{status}</output>
    </main>
  )
}

const container = document.getElementById("fixture")
if (container === null) throw new Error("Missing fixture container")
const themeSource = memoryScope.createSource<ThemePreference>({
  key: "failure-theme",
  serializer: jsonSerializer<ThemePreference>(),
})
createRoot(container).render(
  <ThemeProvider source={themeSource}>
    <FailureJourney />
  </ThemeProvider>,
)
