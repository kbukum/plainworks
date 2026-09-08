import type * as std from "@plainworks/std"
import { describe, expect, expectTypeOf, it } from "vitest"
import type {
  CursorInfo,
  CursorResult,
  Facets,
  FilterOperator,
  FilterValue,
  ListFilter,
  ListMembershipFilter,
  ListQueryParams,
  PageInfo,
  PaginatedResult,
  PresenceFilter,
  ScalarFilter,
  SortDirection,
} from "../index"
import * as querySurface from "../index"

// `query` is protocol-agnostic: it derives cache keys from the abstract `ListQueryParams` and must
// never learn the REST wire dialect. This guards that invariant — the public surface re-exports the
// abstract list contract (including the `FilterOperator` vocabulary) but leaks no wire token, no
// token↔operator resolver, and not the `buildListQuery` serializer (an `@plainworks/http` concern).
describe("query list surface", () => {
  it("re-exports the abstract list contract for one-stop DX", () => {
    expect(querySurface).toHaveProperty("listQueryKey")
    expect(querySurface).toHaveProperty("infiniteListQueryKey")
    expect(querySurface).toHaveProperty("listQueryOptions")
    expect(querySurface).toHaveProperty("infiniteListQueryOptions")
  })

  // The facade's type-only exports have no runtime footprint, so this guard is compile-time: deleting
  // one of these re-exports reddens the typecheck gate, not a vitest run.
  it("re-exports the abstract list type contract, identical to std", () => {
    expectTypeOf<FilterOperator>().toEqualTypeOf<std.FilterOperator>()
    expectTypeOf<FilterValue>().toEqualTypeOf<std.FilterValue>()
    expectTypeOf<SortDirection>().toEqualTypeOf<std.SortDirection>()
    expectTypeOf<ScalarFilter>().toEqualTypeOf<std.ScalarFilter>()
    expectTypeOf<ListMembershipFilter>().toEqualTypeOf<std.ListMembershipFilter>()
    expectTypeOf<PresenceFilter>().toEqualTypeOf<std.PresenceFilter>()
    expectTypeOf<ListFilter>().toEqualTypeOf<std.ListFilter>()
    expectTypeOf<ListQueryParams>().toEqualTypeOf<std.ListQueryParams>()
    expectTypeOf<PageInfo>().toEqualTypeOf<std.PageInfo>()
    expectTypeOf<PaginatedResult<unknown>>().toEqualTypeOf<std.PaginatedResult<unknown>>()
    expectTypeOf<CursorInfo>().toEqualTypeOf<std.CursorInfo>()
    expectTypeOf<CursorResult<unknown>>().toEqualTypeOf<std.CursorResult<unknown>>()
    expectTypeOf<Facets>().toEqualTypeOf<std.Facets>()
  })

  it("exposes no REST wire dialect — tokens, resolver, or serializer", () => {
    const surface = querySurface as Record<string, unknown>
    for (const dialectName of [
      "FILTER_OPERATOR_TOKENS",
      "FILTER_OPERATOR_TOKENS_LONGEST_FIRST",
      "filterOperatorFromToken",
      "splitOperatorToken",
      "escapeScalarValue",
      "escapeListValue",
      "unescapeValue",
      "parseDelimitedList",
      "buildListQuery",
    ]) {
      expect(surface[dialectName]).toBeUndefined()
    }
  })
})
