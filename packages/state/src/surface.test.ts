import ts from "typescript"
import { describe, expect, test } from "vitest"
import clientBindingSource from "./client/binding.ts?raw"
import clientContextSource from "./client/context.ts?raw"
import clientSuppliedSource from "./client/supplied.ts?raw"
import errorsSource from "./errors.ts?raw"
import facadeSource from "./facade.ts?raw"
import seamSource from "./seam.ts?raw"
import storeSource from "./store.ts?raw"

/**
 * The type-neutrality guarantee: Zustand is the internal default engine, never part of the public
 * contract. `isolatedDeclarations` lets each module emit its `.d.ts` in isolation, so if any
 * exported type referenced a Zustand type the engine import would survive into the declaration.
 * Asserting the emitted declarations name no engine keeps `Store` (and the rest of the surface)
 * plainworks-owned — the engine stays swappable without a breaking change.
 */
function emitDeclaration(source: string): string {
  return ts.transpileDeclaration(source, {
    compilerOptions: { isolatedDeclarations: true, removeComments: true },
  }).outputText
}

describe("public surface is engine-neutral", () => {
  test.each([
    ["store", storeSource],
    ["seam", seamSource],
    ["facade", facadeSource],
    ["errors", errorsSource],
    ["client/binding", clientBindingSource],
    ["client/context", clientContextSource],
  ])("%s emits no Zustand type into its declaration", (_name, source) => {
    expect(emitDeclaration(source)).not.toMatch(/zustand/i)
  })
})

/**
 * The bring-your-own-store subpath (`@plainworks/state/client/supplied`) must load **zero**
 * default-engine code, even in a bundler-free native-ESM host that cannot tree-shake. That holds
 * only if its whole static value-import graph avoids `createStore`/`zustand`: the subpath
 * re-exports just `./binding`, and `./binding` reaches the store solely through an erased
 * `import type`.
 */
describe("bring-your-own client subpath carries no default engine", () => {
  test("client/supplied re-exports only the engine-neutral binding", () => {
    const specifiers = [...clientSuppliedSource.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1])
    expect(specifiers.length).toBeGreaterThan(0)
    for (const specifier of specifiers) {
      expect(specifier).toBe("./binding")
    }
  })

  test("client/binding never value-imports the default engine", () => {
    expect(clientBindingSource).not.toMatch(/from\s+"zustand/)
    // `../store` may appear only as an `import type` (erased at runtime), never a value import.
    const storeImports = [
      ...clientBindingSource.matchAll(/^import\s+(type\s+)?[^\n]*from\s+"\.\.\/store"/gm),
    ]
    expect(storeImports.length).toBeGreaterThan(0)
    for (const [, typeOnly] of storeImports) {
      expect(typeOnly).toBe("type ")
    }
  })
})
