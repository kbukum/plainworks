// Fixture: *production* source in `state` (L1) importing `testkit` (L4). Test tooling must never be
// pulled into the shipped graph, so this edge must trip `no-production-testkit-import` — proving the
// test-file exception did not weaken the production boundary.
export { fake } from "../../testkit/src/index"
