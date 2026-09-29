// Fixture: `rogue` is NOT in the LAYERS map. It illegally imports an internal package (`auth`)
// and app code (`apps/demo`), and legally imports its own sibling module. The gate must flag the
// first two and leave the self-import alone.

export { demo } from "../../../apps/demo/src/index"
export { token } from "../../auth/src/index"
export { helper } from "./util"
