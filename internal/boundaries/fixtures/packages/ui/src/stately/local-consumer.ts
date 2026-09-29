// Fixture: an UNMAPPED neutral concern (`stately`) importing WITHIN its own folder. The fail-closed
// `unmapped-ui-concern-neutral` rule exempts the source's own folder (`$2`), so this same-folder
// edge must NOT trip — proving the catch-all closes the vacuous-green hole without breaking an
// unlisted concern's internal relative imports. A re-export satisfies `isolatedDeclarations`.
export { localUtil } from "./local-util"
