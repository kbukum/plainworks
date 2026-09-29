// Fixture: an UNMAPPED client concern (`experimental`) importing WITHIN its own folder. The
// fail-closed `unmapped-ui-concern-client` rule exempts the source's own folder (`$2`), so this
// same-folder edge must NOT trip — an unlisted concern is still born gate-passing for its internal
// relative imports. A re-export keeps the edge while satisfying `isolatedDeclarations`.
export { localUtil } from "./local-util"
