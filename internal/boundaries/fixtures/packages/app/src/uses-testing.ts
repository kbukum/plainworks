// Fixture: *production* source importing the package's own `./testing` helpers. Test-only code must
// never reach the shipped graph, so this edge must trip `no-production-testing-import`.
export { renderHarness } from "./testing"
