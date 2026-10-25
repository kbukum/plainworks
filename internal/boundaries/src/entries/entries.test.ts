import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"
import { checkEntries, sourceEntries } from "./entries"

const packages = resolve(dirname(fileURLToPath(import.meta.url)), "../../fixtures/entries/packages")

test("reports a name exported by two entries, and only that package", () => {
  expect(checkEntries(packages)).toEqual(
    new Map([["doubled", [{ name: "shared", entries: [".", "./second"] }]]]),
  )
})

test("reads only script entries under the source condition", () => {
  const dir = join(packages, "doubled")
  expect(sourceEntries(dir)).toEqual(
    new Map([
      [".", resolve(dir, "../../first.ts")],
      ["./second", resolve(dir, "../../second.ts")],
    ]),
  )
})

test("a package without an exports map has no entries", () => {
  expect(sourceEntries(join(packages, "bare"))).toEqual(new Map())
})

test("an entry that does not resolve is a typed failure, not a pass", () => {
  expect(() => checkEntries(resolve(packages, "../broken"))).toThrow(/did not compile/)
})
