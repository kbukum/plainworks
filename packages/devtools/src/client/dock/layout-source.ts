"use client"

import { jsonSerializer } from "@plainworks/state"
import { createWebStorageScope, type WebStorageLike } from "@plainworks/state/client/scope"
import { guardSchema, type StateSource } from "@plainworks/std"
import { type DevtoolsLayout, isDevtoolsLayout } from "./layout"

/** The Web Storage key the default layout source persists under. */
export const DEVTOOLS_LAYOUT_KEY = "plainworks-devtools-layout"

/** Options for {@link createDevtoolsLayoutSource}. */
export interface DevtoolsLayoutSourceOptions {
  /** The storage to persist in. Defaults to the browser's `localStorage`, resolved on first use. */
  readonly storage?: WebStorageLike
}

const layoutSchema = guardSchema(isDevtoolsLayout, "Not a devtools layout")

/**
 * The browser default for where the devtools remember their dock side and size: a
 * `@plainworks/state` persistent-scope slot, so the choice survives reloads and follows other tabs.
 * Building it touches no storage; the first read does. A stored value is untrusted, so it is
 * validated on read, and a tampered one is rejected with a typed error rather than adopted.
 */
export function createDevtoolsLayoutSource(
  options: DevtoolsLayoutSourceOptions = {},
): StateSource<DevtoolsLayout> {
  const scope = createWebStorageScope({
    kind: "persistent",
    ...(options.storage === undefined ? {} : { storage: options.storage }),
  })
  return scope.createSource({
    key: DEVTOOLS_LAYOUT_KEY,
    serializer: jsonSerializer<DevtoolsLayout>(),
    schema: layoutSchema,
  })
}
