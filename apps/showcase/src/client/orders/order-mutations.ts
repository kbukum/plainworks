"use client"

import type { Order } from "@plainworks/demo"
import { optimisticUpdate, type PaginatedResult, writeQueryData } from "@plainworks/query"
import type { ListQueryParams } from "@plainworks/std"
import type { QueryKey } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"
import { updateOrderStatus } from "../../app/order-write"
import { useHttpClient } from "../http-client"

type OrderPage = PaginatedResult<Order>

/**
 * The order status mutation bound to the currently-viewed list, plus the last failure to surface.
 */
export interface OrderMutations {
  /**
   * Advance an order's status optimistically; resolves `true` on success, `false` (error set) on
   * failure. Writes are serialized per hook: each change's PATCH is issued only after the previous
   * one settles, so the server commits changes in the order they were made and an older write can
   * never land after a newer one. A change superseded before its PATCH is sent resolves `false`
   * without touching the server or reconciling the cache.
   */
  readonly changeStatus: (order: Order, status: Order["status"]) => Promise<boolean>
  /** `true` while a status change is in flight — drive a disabled control from it so writes cannot
   * overlap. */
  readonly isPending: boolean
  /** The last mutation failure, or `undefined` — surfaced as a typed error, never swallowed. */
  readonly error: unknown
  /** Clear the surfaced error. */
  readonly clearError: () => void
}

/** Replace the row sharing `order.id` with `order`; unchanged when the page holds no such row. */
function replaceOrder(page: OrderPage | undefined, order: Order): OrderPage | undefined {
  if (page === undefined || !page.data.some((row) => row.id === order.id)) {
    return page
  }
  return { ...page, data: page.data.map((row) => (row.id === order.id ? order : row)) }
}

/**
 * The optimistic status mutation for the orders list under `queryKey`. It writes the new status
 * into the cache immediately, PATCHes the order, reconciles the cache with the persisted row on
 * success, and rolls back on failure — surfacing a typed error instead of a silent fallback.
 * When the list is filtered or sorted by status, or requests status facet counts, a successful
 * change invalidates the query to re-sync membership, ordering, and counts from the server. Every
 * request carries an `AbortSignal` that fires on unmount, so an in-flight write never settles onto
 * a torn-down component. Writes are serialized per hook: each change's PATCH is issued only after
 * the previous one settles, so the server commits changes in call order and an older write can
 * never land after a newer one. Only the latest change reconciles the cache and surfaces failure;
 * `isPending` lets the caller disable the control while a change is in flight.
 */
export function useOrderMutations(queryKey: QueryKey, params: ListQueryParams): OrderMutations {
  const httpClient = useHttpClient()
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(undefined)
  const [isPending, setIsPending] = useState(false)
  const [lifecycle] = useState(() => new AbortController())
  const signal = lifecycle.signal
  // Monotonic id of the latest change; a settled request that is no longer the latest is stale.
  const latestRequest = useRef(0)
  // The tail of the write chain: each change awaits it before issuing its PATCH, so the server
  // commits status changes in the order they were made rather than in whichever order they settle.
  const writeChain = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    return () => lifecycle.abort()
  }, [lifecycle])

  const clearError = useCallback(() => setError(undefined), [])

  const statusMayInvalidateList =
    params.filters?.some((filter) => filter.field === "status") === true ||
    params.sortBy === "status" ||
    params.facets?.includes("status") === true

  const changeStatus = useCallback(
    async (order: Order, status: Order["status"]): Promise<boolean> => {
      if (order.status === status) {
        return true
      }
      const requestId = latestRequest.current + 1
      latestRequest.current = requestId
      setIsPending(true)
      const optimistic: Order = { ...order, status, updatedAt: new Date().toISOString() }
      const update =
        queryClient.getQueryData<OrderPage>(queryKey) === undefined
          ? undefined
          : optimisticUpdate<OrderPage>({
              client: queryClient,
              queryKey,
              apply: (page) => replaceOrder(page, optimistic),
            })

      const previous = writeChain.current
      const settle = (async (): Promise<boolean> => {
        // Wait behind any in-flight write so the PATCHes reach the server in call order; a prior
        // failure must not break the chain, so its rejection is swallowed here.
        await previous.catch(() => undefined)
        // Superseded while queued: skip the network write entirely so the server never sees the
        // stale value, leaving the newer optimistic write in place.
        if (requestId !== latestRequest.current) {
          return false
        }
        try {
          const updated = await updateOrderStatus(httpClient, order.id, status, signal)
          if (requestId !== latestRequest.current) {
            return false
          }
          if (queryClient.getQueryData<OrderPage>(queryKey) !== undefined) {
            writeQueryData<OrderPage>(queryClient, queryKey, (page) => replaceOrder(page, updated))
          }
          if (statusMayInvalidateList) {
            void queryClient.invalidateQueries({ queryKey })
          }
          setError(undefined)
          return true
        } catch (cause) {
          // Only the latest change reconciles: a superseded one neither rolls back (its snapshot
          // predates the newer optimistic write) nor surfaces its failure.
          if (requestId === latestRequest.current) {
            update?.rollback()
            setError(cause)
          }
          return false
        } finally {
          if (requestId === latestRequest.current) {
            setIsPending(false)
          }
        }
      })()
      writeChain.current = settle
      return settle
    },
    [httpClient, queryClient, queryKey, signal, statusMayInvalidateList],
  )

  return { changeStatus, isPending, error, clearError }
}
