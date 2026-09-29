// Fixture: the `ui` `data` concern (band 3) LEGALLY importing the strictly-lower `forms` concern
// (band 2). `data → forms` is the sanctioned downward direction, so no boundary rule may flag it —
// proving the concern gate rejects only sideways/upward edges, not the legal lower-band imports. A
// re-export keeps the edge while satisfying `isolatedDeclarations`.
export { field } from "../forms/field"
