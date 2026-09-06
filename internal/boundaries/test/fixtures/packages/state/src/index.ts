// Fixture: `state` (L1) illegally re-exports from `ui` (also L1) — a same-layer ("sideways")
// import the gate must catch just as strictly as an upward one — and reaches into `rogue`,
// which has no LAYERS entry, the mapped-to-unmapped edge the gate must also catch.
export { helper } from "../../rogue/src/util"
export { widget } from "../../ui/src/index"
