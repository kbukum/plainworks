// Public entry for `@plainworks/app/testing` — the shipped test harness. Re-export-only barrel over
// the composition-root render helper. Self-contained by design (external test libs + `app`'s own
// providers); it never imports `@plainworks/testkit`/`mocks` (the L4 sideways rule) and starts no
// network mock, so it stays decoupled from any handler set.
export type {
  RenderWithProvidersOptions,
  RenderWithProvidersResult,
} from "./testing/render-with-providers"
export { renderWithProviders } from "./testing/render-with-providers"
