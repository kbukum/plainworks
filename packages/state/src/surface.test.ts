import ts from "typescript"
import { describe, expect, test } from "vitest"
import clientBindingSource from "./client/binding.ts?raw"
import clientContextSource from "./client/context.ts?raw"
import stateConfigErrorSource from "./errors/state-config-error.ts?raw"
import stateErrorSource from "./errors/state-error.ts?raw"
import stateSourceErrorSource from "./errors/state-source-error.ts?raw"
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
    ["errors/state-error", stateErrorSource],
    ["errors/state-config-error", stateConfigErrorSource],
    ["errors/state-source-error", stateSourceErrorSource],
    ["client/binding", clientBindingSource],
    ["client/context", clientContextSource],
  ])("%s emits no Zustand type into its declaration", (_name, source) => {
    expect(emitDeclaration(source)).not.toMatch(/zustand/i)
  })
})
