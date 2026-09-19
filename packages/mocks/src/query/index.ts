// Re-export-only barrel for the list-response query primitives: the filter/sort/paginate/field
// selection a mock backend applies to a collection before responding. Concern modules hold the
// logic.
export { applyFieldSelection } from "./field-selection"
export {
  computeFacets,
  computeFacetsWithFilters,
  filterByApiParams,
  filterByConditions,
  filterByField,
  filterByFields,
  filterBySearch,
} from "./filtering"
export { type PaginationParams, type PaginationResult, paginate } from "./pagination"
export { type SortDirection, type SortParams, sortBy, type ValueComparator } from "./sorting"
