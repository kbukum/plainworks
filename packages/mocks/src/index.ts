// Small prelude for the latency seam shared by every mock handler. Data, handlers, fixtures,
// control, query, dispatch, server lifecycle, and the mock IdP use concern subpaths.
export { createLatency, type LatencyController, MAX_LATENCY_MS } from "./latency"
