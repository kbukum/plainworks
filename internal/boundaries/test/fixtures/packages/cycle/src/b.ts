// Fixture: the other half of the `a` <-> `b` cycle (see ./a).
import { a } from "./a"

export function b(): string {
  return `b:${a()}`
}
