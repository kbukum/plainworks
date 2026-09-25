/**
 * The control plane's HTTP paths, shared by the server handlers and {@link createMockControlClient}
 * so both sides agree on one wire contract.
 */
export const MOCK_CONTROL_PATHS = {
  requests: "/mock/requests",
  state: "/mock/state",
  error: "/mock/error",
  latency: "/mock/latency",
  reset: "/mock/reset",
} as const
