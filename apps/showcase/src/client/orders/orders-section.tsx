"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@plainworks/elements/card"
import { DataTable } from "@plainworks/ui/data-table"
import { Pagination } from "@plainworks/ui/list"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { type ReactElement, useState } from "react"
import { ORDER_LIST_PARAMS } from "../../app/constants"
import { orderListPlan } from "../../app/order-read"
import { CatalogLayout, FacetPanel, ListSearch, useCatalogList } from "../catalog"
import { SectionState } from "../feedback"
import { useHttpClient } from "../http-client"
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
  const plan = orderListPlan(httpClient, list.params)
  const query = useQuery({ ...plan, placeholderData: keepPreviousData })
  const mutations = useOrderMutations(plan.queryKey, list.params)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = query.data?.data ?? []
  const total = query.data?.pagination.total ?? 0
  const selected = rows.find((order) => order.id === selectedId)

  return (
    <section aria-label="Orders" className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Browse orders, filter by status, and review each order's line items and total.
      </p>
      <CatalogLayout
        filtersLabel="Order controls"
        filters={
          <>
            <ListSearch
              label="Search orders"
              value={list.search}
              onChange={list.setSearch}
              placeholder="Customer name or email"
            />
            <FacetPanel
              label="Order filters"
              fields={[{ field: "status", label: "Status", options: ORDER_STATUS_OPTIONS }]}
              facets={query.data?.facets}
              value={list.filters}
              onChange={list.setFilters}
            />
          </>
        }
      >
        <Card className="min-w-0 border-border/70">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle>Orders</CardTitle>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-4 px-4 sm:px-6">
            <SectionState
              pending={query.isPending}
              error={query.isError}
              loadingLabel="Loading orders"
              errorTitle="Orders are unavailable"
              errorBody="The order list could not be loaded. Try again shortly."
              isEmpty={!query.isPending && rows.length === 0}
              empty={{
                title: "No orders match",
                body: "Adjust the filters or search to see more orders.",
              }}
            >
              <DataTable
                columns={orderColumns({
                  onView: (order) => {
                    mutations.clearError()
                    setSelectedId(order.id)
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
            </SectionState>
          </CardContent>
        </Card>
      </CatalogLayout>
      <OrderDetail
        order={selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null)
          }
        }}
        onChangeStatus={(status) => {
          if (selected !== undefined) {
            void mutations.changeStatus(selected, status)
          }
        }}
        pending={mutations.isPending}
        error={mutations.error}
      />
    </section>
  )
}
