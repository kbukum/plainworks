// Fixture: `theme` (L1) illegally re-exports from `elements` (L2) — an upward import among the UI
// family the gate must catch (`no-upward-theme`). `state` (also L1) importing this file is a
// separate sideways proof; `elements` itself imports nothing.
export { atom } from "../../elements/src/index"
export const token = "token"
