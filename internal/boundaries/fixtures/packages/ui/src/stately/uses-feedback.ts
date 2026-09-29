// Fixture: an UNMAPPED neutral concern (`stately` is absent from UI_CONCERNS) importing a mapped
// client concern. Like its client-side twin it has no band, so only the fail-closed catch-all stops
// it reaching another concern. It must trip `unmapped-ui-concern-neutral` and only it, proving the
// hole is closed for neutral top-level folders too. A re-export satisfies `isolatedDeclarations`.
export { spinner } from "../client/feedback/index"
