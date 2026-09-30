// Fixture: a foundation concern (`keyboard`, band 0) trying to launder an upward import through
// a top-level module (`aggregate.ts`) that re-exports the high `data` band. The fail-closed rule
// forbids a concern importing anything under `ui/src` outside its own folder and strictly-lower
// bands — that module included — so this must trip `no-ui-upward-keyboard`, proving the
// transitive hole is closed.
export { dataTable } from "../../aggregate"
