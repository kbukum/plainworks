// Fixture: the @plainworks/app (L4) composition kernel illegally importing @plainworks/ui (L1).
// The layer model *permits* this edge (downward, higher -> lower), so nothing here proves the
// charter rule except `no-app-into-ui`: app is ui-free, and its ui-backed batteries live in the
// showcase/starter, not in app core. This fixture must trip that rule and only that rule. A
// re-export keeps the dependency edge while satisfying `isolatedDeclarations` (no inferred export).
export { widget } from "../../ui/src/index"
