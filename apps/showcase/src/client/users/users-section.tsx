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
import { USER_LIST_PARAMS } from "../../app/constants"
import { userList } from "../../app/lists"
import { CatalogLayout, FacetPanel, ListSearch, useCatalogList } from "../catalog"
import { userColumns } from "./user-columns"
import { USER_DEPARTMENT_OPTIONS, USER_ROLE_OPTIONS, USER_STATUS_OPTIONS } from "./user-fields"
import { UserProfile } from "./user-profile"

const PAGE_SIZE = USER_LIST_PARAMS.pageSize ?? 10

/**
 * The Users directory: a server-prefetched, hydrated member table faceted three ways at once — by
 * role, status, and department — with cross-filtered counts, searchable by name or email, sortable,
 * and paged through the kit's list controls. Selecting a member opens a read-only profile overlay
 * with contact, department, verification, and activity. The initial request mirrors the SSR
 * prefetch, so the first paint is the hydrated page with no refetch flash.
 */
export function UsersSection(): ReactElement {
  const httpClient = useHttpClient()
  const list = useCatalogList({
    pageSize: PAGE_SIZE,
    ...(USER_LIST_PARAMS.sortBy !== undefined ? { sortBy: USER_LIST_PARAMS.sortBy } : {}),
    ...(USER_LIST_PARAMS.order !== undefined ? { order: USER_LIST_PARAMS.order } : {}),
    ...(USER_LIST_PARAMS.facets !== undefined ? { facets: USER_LIST_PARAMS.facets } : {}),
  })
  const plan = userList.options(httpClient, list.params)
  const query = useQuery({ ...plan, placeholderData: keepPreviousData })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = query.data?.data ?? []
  const total = query.data?.pagination.total ?? 0
  const selected = rows.find((user) => user.id === selectedId)

  return (
    <>
      <CatalogLayout
        filtersLabel="Directory filters"
        activeFilters={list.filters.length}
        search={
          <ListSearch
            label="Search users"
            value={list.search}
            onChange={list.setSearch}
            placeholder="Name or email"
          />
        }
        filters={
          <FacetPanel
            label="Filter by role, status, and department"
            fields={[
              { field: "role", label: "Role", options: USER_ROLE_OPTIONS },
              { field: "status", label: "Status", options: USER_STATUS_OPTIONS },
              { field: "department", label: "Department", options: USER_DEPARTMENT_OPTIONS },
            ]}
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
          loading={<LoadingState label="Loading users" lines={6} />}
          error={
            <ErrorState
              title="Users are unavailable"
              description="The member directory could not be loaded."
              onRetry={() => void query.refetch()}
            />
          }
          empty={
            <EmptyState
              title="No members match"
              description="Adjust the filters or search to see more members."
            />
          }
        >
          <DataTable
            columns={userColumns({ onView: (user) => setSelectedId(user.id) })}
            rows={rows}
            getRowId={(user) => user.id}
            sort={list.sort}
            onSortChange={list.setSort}
            caption="Users, filterable by role, status, and department, and sortable."
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
      <UserProfile
        user={selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null)
          }
        }}
      />
    </>
  )
}
