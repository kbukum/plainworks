// Fixture: a *test* file in `state` (L1) importing `testkit` (L4). This upward edge is the ONE
// deliberate exception — shared test fakes are a shipped product for tests — so the gate must NOT
// flag it. Its production sibling (`uses-testkit.ts`) importing the same module must still fail.
import { fake } from "../../testkit/src/index"

export const usedInTest: string = fake
