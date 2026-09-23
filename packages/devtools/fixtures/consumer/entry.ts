/**
 * A realistic consumer entry following the host-owned development-gate pattern: the devtools
 * session, query and state adapters, client UI, and stylesheets are dynamically imported only
 * inside the host's build-time development condition. Bundlers statically eliminate the dead branch
 * in production, so no devtools JavaScript or CSS reaches the production bundle.
 */
export async function boot(): Promise<void> {
  if (import.meta.env.DEV) {
    const [
      { createDevtoolsSession },
      { createQuerySource },
      { createStateSource },
      { mountDevtools },
    ] = await Promise.all([
      import("@plainworks/devtools"),
      import("@plainworks/devtools/query"),
      import("@plainworks/devtools/state"),
      import("@plainworks/devtools/client"),
      import("@plainworks/devtools/styles.css"),
    ])
    const session = createDevtoolsSession()
    void createQuerySource
    void createStateSource
    mountDevtools({ session })
  }
}

void boot()
