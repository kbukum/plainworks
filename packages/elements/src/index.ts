// Server-safe public entry for `@plainworks/elements` — re-export-only barrel (no logic here). It
// exposes the owned-atom manifest (data only), so the `.` entry stays DOM-free and runs anywhere
// (Node, edge, RSC). Each interactive atom is published as its own `"use client"` subpath
// (`@plainworks/elements/button`, …), never re-exported through this barrel.
export type { ElementName } from "./registry"
export { ELEMENT_NAMES } from "./registry"
