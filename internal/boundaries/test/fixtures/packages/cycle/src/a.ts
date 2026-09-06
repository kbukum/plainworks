// Fixture: `a` and `b` import each other — a real two-module cycle (a -> b -> a) the `no-circular`
// rule must catch. Without it, a regression disabling cycle detection would leave every other test
// green despite the gate promising a layer-AND-cycle guarantee.
import { b } from "./b"

export function a(): string {
  return `a:${b()}`
}
