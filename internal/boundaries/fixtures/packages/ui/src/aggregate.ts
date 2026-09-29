// Fixture: a top-level `ui` module outside every concern folder that re-exports the high `data`
// band. It is not itself a concern folder, so no `no-ui-upward-*` rule constrains it as a source; it
// exists to prove a LOWER concern can't launder an upward import THROUGH such a module.
export { dataTable } from "./client/data/index"
