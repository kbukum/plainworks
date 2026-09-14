import { describe, expect, it } from "vitest"
import {
  isListOperator,
  isPresenceOperator,
  isScalarOperator,
  LIST_OPERATORS,
  PRESENCE_OPERATORS,
  SCALAR_OPERATORS,
} from "./operators"
import type { FilterOperator } from "./params"

const ALL_OPERATORS: readonly FilterOperator[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "in",
  "nin",
  "null",
  "notNull",
]

describe("operator classification", () => {
  it("partitions every operator into exactly one group", () => {
    for (const op of ALL_OPERATORS) {
      const groups = [isPresenceOperator(op), isListOperator(op), isScalarOperator(op)].filter(
        Boolean,
      )
      expect(groups).toHaveLength(1)
    }
  })

  it("classifies presence, list, and scalar operators by their value shape", () => {
    expect(PRESENCE_OPERATORS.every(isPresenceOperator)).toBe(true)
    expect(LIST_OPERATORS.every(isListOperator)).toBe(true)
    expect(SCALAR_OPERATORS.every(isScalarOperator)).toBe(true)
  })

  it("covers the whole vocabulary across the three groups", () => {
    const classified = new Set<FilterOperator>([
      ...PRESENCE_OPERATORS,
      ...LIST_OPERATORS,
      ...SCALAR_OPERATORS,
    ])
    expect(classified).toEqual(new Set(ALL_OPERATORS))
  })
})
