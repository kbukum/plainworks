import { createStore } from "@plainworks/state"
import { QueryClient } from "@tanstack/query-core"

/**
 * A realistic consumer entry following the host-owned development-gate pattern. The app builds its
 * runtime unconditionally; the query and state adapters, client UI, and stylesheet are dynamically
 * imported only inside the host's build-time development condition. Bundlers statically eliminate
 * the dead branch in production, so no devtools JavaScript or CSS reaches the production bundle.
 */
export async function boot(): Promise<void> {
  const queryClient = new QueryClient()
  const store = createStore(() => ({ count: 0 }))

  if (import.meta.env.DEV) {
    const [{ createQuerySource }, { createStateSource }, { mountDevtools }] = await Promise.all([
      import("@plainworks/devtools/query"),
      import("@plainworks/devtools/state"),
      import("@plainworks/devtools/client"),
      import("@plainworks/devtools/styles.css"),
    ])
    // The mount owns the session it builds; `dispose` releases the shell, sources, and session.
    const { dispose } = mountDevtools({
      sources: [
        createQuerySource({ client: queryClient, instance: "app" }),
        createStateSource({ store, instance: "app", snapshot: (state) => state }),
      ],
    })
    import.meta.hot?.dispose(dispose)
  }
}

void boot()
