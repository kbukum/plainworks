"use client"

import { useHttpClient } from "@plainworks/http/client"
import { asyncStatus } from "@plainworks/ui"
import { DataTable } from "@plainworks/ui/data/data-table"
import { Pagination } from "@plainworks/ui/data/pagination"
import { AsyncState } from "@plainworks/ui/feedback/async-state"
import { EmptyState } from "@plainworks/ui/feedback/empty-state"
import { ErrorState } from "@plainworks/ui/feedback/error-state"
import { LoadingState } from "@plainworks/ui/feedback/loading-state"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { type ReactElement, useState } from "react"
import { ORDER_LIST_PARAMS } from "../../app/constants"
import { orderList } from "../../app/lists"
import { CatalogLayout, FacetPanel, ListSearch, useCatalogList } from "../catalog"
import { orderColumns } from "./order-columns"
import { OrderDetail } from "./order-detail"
import { ORDER_STATUS_OPTIONS } from "./order-fields"
import { useOrderMutations } from "./order-mutations"

const PAGE_SIZE = ORDER_LIST_PARAMS.pageSize ?? 8

/**
 * The Orders catalog: a server-prefetched, hydrated table you filter by status, search by customer,
 * sort, and page entirely through the kit's list controls, with a detail overlay listing every line
 * item and total. An authorized operator advances an order's status from the overlay through an
 * optimistic, rolled-back-on-failure mutation. The initial request mirrors the SSR prefetch, so the
 * first paint is the hydrated page with no refetch flash.
 */
export function OrdersSection(): ReactElement {
  const httpClient = useHttpClient()
  const list = useCatalogList({
    pageSize: PAGE_SIZE,
    ...(ORDER_LIST_PARAMS.sortBy !== undefined ? { sortBy: ORDER_LIST_PARAMS.sortBy } : {}),
    ...(ORDER_LIST_PARAMS.order !== undefined ? { order: ORDER_LIST_PARAMS.order } : {}),
    ...(ORDER_LIST_PARAMS.facets !== undefined ? { facets: ORDER_LIST_PARAMS.facets } : {}),
  })
  const plan = orderList.options(httpClient, list.params)
  const query = useQuery({ ...plan, placeholderData: keepPreviousData })
  const mutations = useOrderMutations(plan.queryKey)

  const rows = query.data?.data ?? []
  const total = query.data?.pagination.total ?? 0
  const [selectedOrder, setSelectedOrder] = useState<(typeof rows)[number] | null>(null)

  return (
    <>
      <CatalogLayout
        filtersLabel="Order filters"
        activeFilters={list.filters.length}
        search={
          <ListSearch
            label="Search orders"
            value={list.search}
            onChange={list.setSearch}
            placeholder="Customer name or email"
          />
        }
        filters={
          <FacetPanel
            label="Filter by status"
            fields={[{ field: "status", label: "Status", options: ORDER_STATUS_OPTIONS }]}
            facets={query.data?.facets}
            value={list.filters}
            onChange={list.setFilters}
          />
        }
      >
        <AsyncState
          status={asyncStatus({
            pending: query.isPending,
            error: query.isError,
            empty: rows.length === 0,
          })}
          loading={<LoadingState label="Loading orders" lines={6} />}
          error={
            <ErrorState
              title="Orders are unavailable"
              description="The order list could not be loaded."
              onRetry={() => void query.refetch()}
            />
          }
          empty={
            <EmptyState
              title="No orders match"
              description="Adjust the filters or search to see more orders."
            />
          }
        >
          <DataTable
            columns={orderColumns({
              onView: (order) => {
                mutations.clearError()
                setSelectedOrder(order)
              },
            })}
            rows={rows}
            getRowId={(order) => order.id}
            sort={list.sort}
            onSortChange={list.setSort}
            caption="Orders, filterable by status and sortable."
          />
          <Pagination
            page={list.page}
            pageSize={PAGE_SIZE}
            total={total}
            siblingCount={0}
            onPageChange={list.setPage}
          />
        </AsyncState>
      </CatalogLayout>
      <OrderDetail
        order={selectedOrder ?? undefined}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOrder(null)
          }
        }}
        onChangeStatus={(status) => {
          if (selectedOrder !== null) {
            const previous = selectedOrder
            setSelectedOrder({ ...previous, status })
            void mutations.changeStatus(previous, status).then((saved) => {
              if (!saved) {
                setSelectedOrder((current) => (current?.id === previous.id ? previous : current))
              }
            })
          }
        }}
        pending={mutations.isPending}
        error={mutations.error}
      />
    </>
  )
}
