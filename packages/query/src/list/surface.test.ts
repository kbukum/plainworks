import { describe, expect, it } from "vitest"
import * as listSurface from "./index"

// `query` is protocol-agnostic: it derives cache keys from the abstract `ListQueryParams` in
// `@plainworks/std/list` and must never learn the REST wire dialect. This guards that invariant —
// the list concern exports only key and option builders, and no wire token, token↔operator
// resolver, or the `buildListQuery` serializer (an `@plainworks/http/list` concern).
describe("query list surface", () => {
  it("exports only the cache-key and option builders", () => {
    expect(Object.keys(listSurface).sort()).toEqual([
      "infiniteListQueryKey",
      "infiniteListQueryOptions",
      "listQueryKey",
      "listQueryOptions",
    ])
  })
})
