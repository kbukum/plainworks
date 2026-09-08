import { describe, expectTypeOf, it } from "vitest"
import type {
  FilterOperator,
  FilterValue,
  ListFilter,
  ListMembershipFilter,
  ListQueryParams,
  PresenceFilter,
  ScalarFilter,
  SortDirection,
} from "./params"

// `params.ts` is pure type surface, so the contract it must keep is its *shape*: each operator
// carries exactly the value it needs, and a mismatched combination does not compile. These are
// compile-time assertions — they redden the typecheck gate, not a runtime run, if the discriminated
// union drifts.
describe("FilterOperator vocabulary", () => {
  it("is the single union of operator names, independent of any wire dialect", () => {
    expectTypeOf<FilterOperator>().toEqualTypeOf<
      | "eq"
      | "neq"
      | "gt"
      | "gte"
      | "lt"
      | "lte"
      | "in"
      | "nin"
      | "like"
      | "ilike"
      | "null"
      | "notNull"
    >()
    // The vocabulary is derived from the variants, not maintained beside them — an operator cannot
    // exist in the picker without a value shape a caller can express.
    expectTypeOf<FilterOperator>().toEqualTypeOf<ListFilter["op"]>()
  })
})

describe("ListFilter discriminated union", () => {
  it("binds a scalar operator to a single FilterValue", () => {
    expectTypeOf<ScalarFilter["op"]>().toEqualTypeOf<
      "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike"
    >()
    expectTypeOf<ScalarFilter["value"]>().toEqualTypeOf<FilterValue>()
    expectTypeOf<FilterValue>().toEqualTypeOf<string | number | boolean>()
  })

  it("binds a membership operator to an array of FilterValue", () => {
    expectTypeOf<ListMembershipFilter["op"]>().toEqualTypeOf<"in" | "nin">()
    expectTypeOf<ListMembershipFilter["value"]>().toEqualTypeOf<readonly FilterValue[]>()
  })

  it("binds a presence operator to no value at all", () => {
    expectTypeOf<PresenceFilter["op"]>().toEqualTypeOf<"null" | "notNull">()
    expectTypeOf<PresenceFilter>().not.toHaveProperty("value")
  })

  it("accepts each variant and rejects a mismatched value shape", () => {
    const scalar = { field: "status", op: "eq", value: "active" } satisfies ListFilter
    const membership = { field: "role", op: "in", value: ["admin", "editor"] } satisfies ListFilter
    const presence = { field: "deletedAt", op: "null" } satisfies ListFilter
    expectTypeOf(scalar).toMatchTypeOf<ListFilter>()
    expectTypeOf(membership).toMatchTypeOf<ListFilter>()
    expectTypeOf(presence).toMatchTypeOf<ListFilter>()
    // @ts-expect-error a scalar operator cannot carry an array value
    const bad = { field: "status", op: "eq", value: ["a"] } satisfies ListFilter
    void bad
  })
})

describe("ListQueryParams", () => {
  it("keeps every request field optional and typed", () => {
    expectTypeOf<ListQueryParams["filters"]>().toEqualTypeOf<readonly ListFilter[] | undefined>()
    expectTypeOf<ListQueryParams["order"]>().toEqualTypeOf<SortDirection | undefined>()
    expectTypeOf<SortDirection>().toEqualTypeOf<"asc" | "desc">()
    expectTypeOf({
      page: 1,
      pageSize: 5,
    } satisfies ListQueryParams).toMatchTypeOf<ListQueryParams>()
  })
})
