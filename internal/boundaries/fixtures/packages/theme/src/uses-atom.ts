// Fixture: `theme` (L1) imports a vendored atom subpath of `elements` (L2) — an upward import the
// gate must catch even though the atom's export resolves to `dist`, not source.
export { Button } from "@plainworks/elements/button"
