// Fixture: the `ui` `forms` concern (band 2) illegally importing the `data` concern (band 3) — the
// documented `forms → data` order is downward-only, so `forms` reaching UP into `data` must trip
// `no-ui-upward-forms`. A `forms`-needs-`data` case is solved by sinking the shared piece, never a
// back-edge. A re-export keeps the edge while satisfying `isolatedDeclarations`.
export { dataTable } from "../data-table/index"
