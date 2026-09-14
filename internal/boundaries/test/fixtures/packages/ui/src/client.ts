// Fixture: the `ui` aggregate client barrel — it re-exports every concern, including the high
// `data` band. It is not itself a concern folder, so no `no-ui-upward-*` rule constrains it as a
// source; it exists to prove a LOWER concern can't launder an upward import THROUGH it.
export { dataTable } from "./client/data-table/index"
