import { type RenderOptions, type RenderResult, render } from "@testing-library/react"
import { createElement, type ReactElement, type ReactNode } from "react"
import type { ClientCapability } from "../client/capability"
import { AppProvider } from "../client/provider"
import type { AppSnapshot } from "../kernel/snapshot"

/** Options for {@link renderWithProviders}, extending Testing Library's own render options. */
export type RenderWithProvidersOptions = Omit<RenderOptions, "wrapper"> & {
  /**
   * The capability registry's **client half** — the provider components to mount, exactly as
   * production hands them to `AppProvider`. `AppProvider` orders them by `dependsOn`. Defaults to
   * none (a bare root). A shared query client is not a harness knob — mount it as a capability with
   * `createQueryCapability`, mirroring production.
   */
  readonly capabilities?: readonly ClientCapability[]
  /**
   * Server-resolved snapshot to hydrate from, exactly as in production — produce it with
   * `createApp({ capabilities }).resolve(context)` over the neutral capability halves. Omit for a
   * client-only render (capabilities start unresolved).
   */
  readonly snapshot?: AppSnapshot
}

/** What {@link renderWithProviders} returns: Testing Library's result plus the capabilities it rendered under. */
export interface RenderWithProvidersResult extends RenderResult {
  /** The capability providers the component was rendered under. */
  readonly capabilities: readonly ClientCapability[]
}

/**
 * Render a component inside the full composition root — the shipped `./testing` harness. It mounts
 * the component under `AppProvider` with whatever capability providers and snapshot the test
 * injects, exactly as production composes them, so a test exercises the real assembly, not a
 * bespoke provider stack. There is one way to configure it — the client capability registry plus an
 * optional snapshot — so a test can never contradict itself; the server resolve step
 * (`createApp(...).resolve`) runs in the test and feeds its snapshot here, mirroring the
 * server→client boundary. It is **self-contained**: external test libs plus the injected providers
 * — no `@plainworks/testkit`/`mocks` (the L4 sideways rule), and it starts no network mock, so the
 * harness stays decoupled from any handler set (wire MSW per suite).
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  const { capabilities = [], snapshot, ...renderOptions } = options
  const result = render(ui, {
    ...renderOptions,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(AppProvider, {
        capabilities,
        children,
        ...(snapshot !== undefined ? { snapshot } : {}),
      }),
  })
  return { ...result, capabilities }
}
