// Fixture: a stand-in `auth` (L3) surface. It legally imports `std` (L0) — a downward import the
// gate must allow — while `std` and `rogue` importing THIS module is the upward violation.
export { ok } from "../../std/src/result"
export { OIDC_ADAPTER_KIND } from "./adapter/oidc/config"
export const token = "fixture"
