"use client"

import { useHttpClient } from "@plainworks/http/client"
import { asyncStatus } from "@plainworks/ui"
import { FacetPanel } from "@plainworks/ui/data/facet-panel"
import { ListLayout } from "@plainworks/ui/data/list-layout"
import { ListSearch } from "@plainworks/ui/data/list-search"
import { Pagination } from "@plainworks/ui/data/pagination"
import { RangeFilter } from "@plainworks/ui/data/range-filter"
import { useListQueryState } from "@plainworks/ui/data/use-list-query-state"
import { AsyncState } from "@plainworks/ui/feedback/async-state"
import { EmptyState } from "@plainworks/ui/feedback/empty-state"
import { ErrorState } from "@plainworks/ui/feedback/error-state"
import { LoadingState } from "@plainworks/ui/feedback/loading-state"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { SlidersHorizontal } from "lucide-react"
import { type ReactElement, useState } from "react"
import { PRODUCT_LIST_PARAMS } from "../../app/constants"
import { productList } from "../../app/lists"
import { ProductCard } from "./product-card"
import { ProductDetail } from "./product-detail"
import { PRODUCT_CATEGORY_OPTIONS, PRODUCT_STATUS_OPTIONS } from "./product-fields"

const PAGE_SIZE = PRODUCT_LIST_PARAMS.pageSize ?? 12

/**
 * The Products catalog: a server-prefetched, hydrated grid you filter by category and status, bound
 * by a price range, search by name, and page through the kit's list controls. Unlike the tabular
 * surfaces this renders a fluid `auto-fit` / `minmax()` card grid — no fixed pixel widths — so it
 * reflows from one column on a narrow container up to as many cards as fit. Selecting a card opens
 * a detail overlay. The initial request mirrors the SSR prefetch, so the first paint is the
 * hydrated page with no refetch flash.
 */
export function ProductsSection(): ReactElement {
  const httpClient = useHttpClient()
  const list = useListQueryState({
    pageSize: PAGE_SIZE,
    ...(PRODUCT_LIST_PARAMS.sortBy !== undefined ? { sortBy: PRODUCT_LIST_PARAMS.sortBy } : {}),
    ...(PRODUCT_LIST_PARAMS.order !== undefined ? { order: PRODUCT_LIST_PARAMS.order } : {}),
    ...(PRODUCT_LIST_PARAMS.facets !== undefined ? { facets: PRODUCT_LIST_PARAMS.facets } : {}),
  })
  const plan = productList.options(httpClient, list.params)
  const query = useQuery({ ...plan, placeholderData: keepPreviousData })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = query.data?.data ?? []
  const total = query.data?.pagination.total ?? 0
  const selected = rows.find((product) => product.id === selectedId)

  return (
    <>
      <ListLayout
        labels={{ filters: "Product filters" }}
        filtersIcon={<SlidersHorizontal aria-hidden />}
        activeFilters={list.filters.length}
        search={
          <ListSearch
            labels={{ label: "Search products", placeholder: "Product name" }}
            value={list.search}
            onChange={list.setSearch}
          />
        }
        filters={
          <>
            <FacetPanel
              labels={{ region: "Filter by category and status" }}
              fields={[
                { field: "category", label: "Category", options: PRODUCT_CATEGORY_OPTIONS },
                { field: "status", label: "Status", options: PRODUCT_STATUS_OPTIONS },
              ]}
              facets={query.data?.facets}
              value={list.filters}
              onChange={list.setFilters}
            />
            <RangeFilter
              field="price"
              labels={{ legend: "Price" }}
              value={list.filters}
              onChange={list.setFilters}
            />
          </>
        }
      >
        <AsyncState
          status={asyncStatus({
            pending: query.isPending,
            error: query.isError,
            empty: rows.length === 0,
          })}
          loading={<LoadingState label="Loading products" lines={6} />}
          error={
            <ErrorState
              title="Products are unavailable"
              description="The catalog could not be loaded."
              onRetry={() => void query.refetch()}
            />
          }
          empty={
            <EmptyState
              title="No products match"
              description="Adjust the filters, price range, or search to see more products."
            />
          }
        >
          <ul
            aria-label="Product results"
            className="grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4 p-0"
          >
            {rows.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} onView={() => setSelectedId(product.id)} />
              </li>
            ))}
          </ul>
          <Pagination
            page={list.page}
            pageSize={PAGE_SIZE}
            total={total}
            siblingCount={0}
            onPageChange={list.setPage}
          />
        </AsyncState>
      </ListLayout>
      <ProductDetail
        product={selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null)
          }
        }}
      />
    </>
  )
}
