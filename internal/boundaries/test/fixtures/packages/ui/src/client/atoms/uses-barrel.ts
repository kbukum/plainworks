// Fixture: a foundation concern (`atoms`, band 0) trying to launder an upward import by pulling the
// aggregate `client.ts` barrel, which re-exports the high `data` band. The fail-closed rule forbids
// a concern importing anything under `ui/src` outside its own folder and strictly-lower bands — the
// barrel included — so this must trip `no-ui-upward-atoms`, proving the transitive hole is closed.
export { dataTable } from "../../client"
