// Fixture: an UNMAPPED client concern (`experimental` is absent from UI_CONCERNS) importing the
// mapped `feedback` concern. With no band assigned it matches none of the `no-ui-upward-*` source
// rules, so without the fail-closed catch-all it could reach any concern freely. It must trip
// `unmapped-ui-concern-client` and only it, proving an unlisted concern folder is not vacuously
// green. A re-export keeps the edge while satisfying `isolatedDeclarations`.
export { spinner } from "../feedback/index"
