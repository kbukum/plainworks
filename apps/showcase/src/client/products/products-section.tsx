"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@plainworks/elements/card"
import { Pagination } from "@plainworks/ui/list"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { type ReactElement, useState } from "react"
import { PRODUCT_LIST_PARAMS } from "../../app/constants"
import { productListPlan } from "../../app/product-read"
import { CatalogLayout, FacetPanel, ListSearch, useCatalogList } from "../catalog"
import { SectionState } from "../feedback"
import { useHttpClient } from "../http-client"
import { PriceRange } from "./price-range"
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
  const list = useCatalogList({
    pageSize: PAGE_SIZE,
    ...(PRODUCT_LIST_PARAMS.sortBy !== undefined ? { sortBy: PRODUCT_LIST_PARAMS.sortBy } : {}),
    ...(PRODUCT_LIST_PARAMS.order !== undefined ? { order: PRODUCT_LIST_PARAMS.order } : {}),
    ...(PRODUCT_LIST_PARAMS.facets !== undefined ? { facets: PRODUCT_LIST_PARAMS.facets } : {}),
  })
  const plan = productListPlan(httpClient, list.params)
  const query = useQuery({ ...plan, placeholderData: keepPreviousData })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = query.data?.data ?? []
  const total = query.data?.pagination.total ?? 0
  const selected = rows.find((product) => product.id === selectedId)

  return (
    <section aria-label="Products" className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Browse the catalog, filter by category, status, and price, and open a product for details.
      </p>
      <CatalogLayout
        filtersLabel="Product controls"
        filters={
          <>
            <ListSearch
              label="Search products"
              value={list.search}
              onChange={list.setSearch}
              placeholder="Product name"
            />
            <FacetPanel
              label="Catalog filters"
              fields={[
                { field: "category", label: "Category", options: PRODUCT_CATEGORY_OPTIONS },
                { field: "status", label: "Status", options: PRODUCT_STATUS_OPTIONS },
              ]}
              facets={query.data?.facets}
              value={list.filters}
              onChange={list.setFilters}
            />
            <PriceRange value={list.filters} onChange={list.setFilters} />
          </>
        }
      >
        <Card className="min-w-0 border-border/70">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle>Products</CardTitle>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-4 px-4 sm:px-6">
            <SectionState
              pending={query.isPending}
              error={query.isError}
              loadingLabel="Loading products"
              errorTitle="Products are unavailable"
              errorBody="The catalog could not be loaded. Try again shortly."
              isEmpty={!query.isPending && rows.length === 0}
              empty={{
                title: "No products match",
                body: "Adjust the filters, price range, or search to see more products.",
              }}
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
            </SectionState>
          </CardContent>
        </Card>
      </CatalogLayout>
      <ProductDetail
        product={selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null)
          }
        }}
      />
    </section>
  )
}
