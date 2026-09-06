// Fixture: `std` (L0) illegally re-exports from `auth` (L3) — an upward import the gate must catch.
export { token } from "../../auth/src/index"
