"use client"

import type { Order } from "@plainworks/demo"
import { useHttpClient } from "@plainworks/http/client"
import { optimisticMutationOptions } from "@plainworks/query/mutation"
import type { PaginatedResult } from "@plainworks/std/list"
import { hashKey, type QueryKey, useMutation } from "@tanstack/react-query"
import { useCallback, useState } from "react"
import { updateOrderStatus } from "../../app/order-write"

type OrderPage = PaginatedResult<Order>

interface StatusChange {
  readonly order: Order
  readonly status: Order["status"]
}

/**
 * The order status mutation bound to the currently-viewed list, plus the last failure to surface.
 */
export interface OrderMutations {
  /**
   * Change an order's status optimistically; resolves `true` on success, `false` (error set) on
   * failure. Changes run one at a time in call order, so the server always ends on the latest one.
   */
  readonly changeStatus: (order: Order, status: Order["status"]) => Promise<boolean>
  /** `true` while a status change is in flight — drive a disabled control from it. */
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
 * The optimistic status mutation for the orders list under `queryKey`. It shows the new status at
 * once, PATCHes the order, swaps in the persisted row, and rolls back on failure. Changes to the
 * list share one mutation scope, so their PATCHes reach the server in call order and an older write
 * never lands after a newer one. The list re-syncs from the server once every change settles.
 */
export function useOrderMutations(queryKey: QueryKey): OrderMutations {
  const httpClient = useHttpClient()
  const [error, setError] = useState<unknown>(undefined)

  const mutation = useMutation(
    optimisticMutationOptions<Order, StatusChange, OrderPage>({
      queryKey,
      scope: { id: `orders:${hashKey(queryKey)}` },
      mutationFn: ({ order, status }) => updateOrderStatus(httpClient, order.id, status),
      apply: (page, { order, status }) =>
        replaceOrder(page, { ...order, status, updatedAt: new Date().toISOString() }),
      reconcile: (page, updated) => replaceOrder(page, updated),
    }),
  )
  const { mutateAsync } = mutation

  const changeStatus = useCallback(
    (order: Order, status: Order["status"]): Promise<boolean> => {
      if (order.status === status) {
        return Promise.resolve(true)
      }
      return mutateAsync({ order, status }).then(
        () => {
          setError(undefined)
          return true
        },
        (cause: unknown) => {
          setError(cause)
          return false
        },
      )
    },
    [mutateAsync],
  )

  const clearError = useCallback(() => setError(undefined), [])

  return { changeStatus, isPending: mutation.isPending, error, clearError }
}
