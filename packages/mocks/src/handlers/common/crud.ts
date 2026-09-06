/**
 * Generic CRUD handler creator
 * Eliminates repetitive REST endpoint boilerplate
 */

import type { Clock } from "@plainworks/std"
import { type HttpHandler, HttpResponse, http } from "msw"
import type { EntityStore } from "../../data/common/store"
import { type FilterCondition, parseApiParams } from "../../filter"
import {
  computeFacetsWithFilters,
  filterByConditions,
  filterBySearch,
  paginate,
  sortBy,
} from "../../utils"
import type { LatencyController } from "../../utils/delay"
import { decodeInput, type InputSpec } from "./decode"

export interface CrudHandlerConfig<T, TInput> {
  /** Base API path (e.g., '/api/users') */
  basePath: string
  /** Entity name for error messages */
  entityName: string
  /** Entity store */
  store: EntityStore<T>
  /** Function to create new entity */
  createEntity: (input?: Partial<TInput>) => T
  /** Per-server latency control */
  latency: LatencyController
  /** Clock used for `updatedAt` timestamps */
  clock: Clock
  /** Client-writable fields and their shapes; bodies failing this decode are rejected with 400 */
  inputSpec: InputSpec
  /** Fields to search in (for text search) */
  searchFields?: (keyof T & string)[]
  /** Fields that can be filtered exactly */
  filterFields?: (keyof T & string)[]
  /** Fields to compute facets for (counts per value) */
  facetFields?: (keyof T & string)[]
  /** Fields allowed in `sortBy` (defaults to every search/filter/facet field) */
  sortFields?: (keyof T & string)[]
  /** ID field name (defaults to 'id') */
  idField?: keyof T & string
  /**
   * Merge decoded PATCH fields into the current entity. Override to recompute derived fields
   * (e.g. an order's `total` from its `items`); defaults to a shallow merge with a fresh
   * `updatedAt`.
   */
  applyUpdate?: (current: T, updates: Partial<T>) => T
}

/**
 * Parse filter query string to params object
 * e.g., "status=eq.active&priority=gt.5" -> { status: "eq.active", priority: "gt.5" }
 */
function parseFilterQueryString(queryString: string): Record<string, string> {
  const params: Record<string, string> = {}
  const searchParams = new URLSearchParams(queryString)
  for (const [key, value] of searchParams.entries()) {
    params[key] = value
  }
  return params
}

/** Read a JSON body as `unknown`; `null` when the payload is not valid JSON. */
async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

const badRequest = (error: string): Response =>
  HttpResponse.json({ data: null, error }, { status: 400 })

/**
 * Parse a positive-integer query parameter. Returns the default when absent, `null` when the
 * value is present but not a positive integer.
 */
function parsePositiveInt(value: string | null, defaultValue: number): number | null {
  if (value === null || value === "") return defaultValue
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return parsed
}

/**
 * Creates standard CRUD handlers for an entity
 * Returns: GET list, GET by id, POST, PATCH, DELETE
 */
export function createCrudHandlers<
  T extends { id: string; updatedAt?: string },
  TInput = Partial<T>,
>(config: CrudHandlerConfig<T, TInput>): HttpHandler[] {
  const {
    basePath,
    entityName,
    store,
    createEntity,
    latency,
    clock,
    inputSpec,
    searchFields = [],
    filterFields = [],
    facetFields = [],
    idField = "id" as keyof T & string,
    applyUpdate,
  } = config

  const sortFields = config.sortFields ?? [...searchFields, ...filterFields, ...facetFields]

  // Match the base path on any origin (leading `*`) so the same handler set intercepts both
  // same-origin relative requests in the browser and the absolute URLs used by `msw/node` in tests.
  const path = `*${basePath}`
  const itemPath = `${path}/:id`

  return [
    // GET list with pagination, sorting, filtering, facets
    http.get(path, async ({ request }) => {
      await latency.wait(request.signal)
      const url = new URL(request.url)

      // Query params are untrusted strings: validate before they drive slices/sorts.
      const page = parsePositiveInt(url.searchParams.get("page"), 1)
      const limit = parsePositiveInt(url.searchParams.get("limit"), 10)
      if (page === null || limit === null) {
        return badRequest("page and limit must be positive integers")
      }
      const search = url.searchParams.get("search") || ""
      const filter = url.searchParams.get("filter") || "" // PostgREST/Supabase style filter
      const sortField = url.searchParams.get("sortBy")
      // Support both 'order' and 'sortOrder' for flexibility
      const sortOrder = url.searchParams.get("order") || url.searchParams.get("sortOrder") || "asc"

      if (sortField !== null && !sortFields.includes(sortField as keyof T & string)) {
        return badRequest(`sortBy must be one of: ${sortFields.join(", ")}`)
      }
      if (sortOrder !== "asc" && sortOrder !== "desc") {
        return badRequest('order must be "asc" or "desc"')
      }

      let data = store.getAll()

      // Text search first (applies to all facets)
      if (search && searchFields.length > 0) {
        data = filterBySearch(data, search, searchFields)
      }

      // One unified condition set drives both facets and results, so facet counts always agree
      // with the filtered data. Legacy exact-field params fold in as eq/in conditions.
      const filterParams = filter ? parseFilterQueryString(filter) : {}
      const conditions: FilterCondition[] = [...(parseApiParams(filterParams)?.conditions ?? [])]
      for (const field of filterFields) {
        const value = url.searchParams.get(field)
        if (value) {
          conditions.push(
            value.includes(",")
              ? { field, operator: "in", value: value.split(",").map((v) => v.trim()) }
              : { field, operator: "eq", value },
          )
        }
      }

      // Compute facets with cross-filtering:
      // For each facet field, apply all filters EXCEPT that field's conditions
      // This shows "what count would I get if I clicked this option"
      const facets: Record<string, Record<string, number>> | undefined =
        facetFields.length > 0 ? computeFacetsWithFilters(data, facetFields, conditions) : undefined

      // Now apply the full filter for the actual data results
      if (conditions.length > 0) {
        data = filterByConditions(data, conditions)
      }

      // Sorting
      if (sortField) {
        data = sortBy(data, { field: sortField as keyof T & string, order: sortOrder })
      }

      const result = paginate(data, { page, limit })
      return HttpResponse.json({
        data: result.data,
        pagination: result.pagination,
        facets,
      })
    }),

    // GET by ID
    http.get(itemPath, async ({ params, request }) => {
      await latency.wait(request.signal)
      const item = store.find((i) => i[idField] === params.id)

      if (!item) {
        return HttpResponse.json({ data: null, error: `${entityName} not found` }, { status: 404 })
      }

      return HttpResponse.json({ data: item })
    }),

    // POST create
    http.post(path, async ({ request }) => {
      await latency.wait(request.signal)
      const input = decodeInput<TInput>(await readJsonBody(request), inputSpec)
      if (input === null) {
        return badRequest(`invalid ${entityName} create body`)
      }
      const newItem = createEntity(input)
      store.prepend(newItem)

      return HttpResponse.json({ data: newItem }, { status: 201 })
    }),

    // PATCH update
    http.patch(itemPath, async ({ params, request }) => {
      await latency.wait(request.signal)
      const decoded = decodeInput<T>(await readJsonBody(request), inputSpec)
      if (decoded === null) {
        return badRequest(`invalid ${entityName} update body`)
      }
      const index = store.findIndex((i) => i[idField] === params.id)

      if (index === -1) {
        return HttpResponse.json({ data: null, error: `${entityName} not found` }, { status: 404 })
      }

      const current = store.getAll()[index]
      if (!current) {
        return HttpResponse.json({ data: null, error: `${entityName} not found` }, { status: 404 })
      }

      // Immutable fields can never be patched, even if the client echoes the entity back.
      const updates: Record<string, unknown> = { ...decoded }
      delete updates[idField]
      delete updates.createdAt

      const updated = applyUpdate
        ? applyUpdate(current, updates as Partial<T>)
        : {
            ...current,
            ...updates,
            updatedAt: new Date(clock.now()).toISOString(),
          }
      store.update(index, updated)

      return HttpResponse.json({ data: updated })
    }),

    // DELETE
    http.delete(itemPath, async ({ params, request }) => {
      await latency.wait(request.signal)
      const index = store.findIndex((i) => i[idField] === params.id)

      if (index === -1) {
        return HttpResponse.json({ data: null, error: `${entityName} not found` }, { status: 404 })
      }

      store.remove(index)
      return HttpResponse.json({ data: { success: true } })
    }),
  ]
}
