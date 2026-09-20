"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@plainworks/elements/card"
import { DataTable } from "@plainworks/ui/data-table"
import { Pagination } from "@plainworks/ui/list"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { type ReactElement, useState } from "react"
import { USER_LIST_PARAMS } from "../../app/constants"
import { userListPlan } from "../../app/user-read"
import { CatalogLayout, FacetPanel, ListSearch, useCatalogList } from "../catalog"
import { SectionState } from "../feedback"
import { useHttpClient } from "../http-client"
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
  const plan = userListPlan(httpClient, list.params)
  const query = useQuery({ ...plan, placeholderData: keepPreviousData })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = query.data?.data ?? []
  const total = query.data?.pagination.total ?? 0
  const selected = rows.find((user) => user.id === selectedId)

  return (
    <section aria-label="Users" className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Browse the member directory, filter by role, status, and department, and open a profile.
      </p>
      <CatalogLayout
        filtersLabel="Directory controls"
        filters={
          <>
            <ListSearch
              label="Search users"
              value={list.search}
              onChange={list.setSearch}
              placeholder="Name or email"
            />
            <FacetPanel
              label="Directory filters"
              fields={[
                { field: "role", label: "Role", options: USER_ROLE_OPTIONS },
                { field: "status", label: "Status", options: USER_STATUS_OPTIONS },
                { field: "department", label: "Department", options: USER_DEPARTMENT_OPTIONS },
              ]}
              facets={query.data?.facets}
              value={list.filters}
              onChange={list.setFilters}
            />
          </>
        }
      >
        <Card className="min-w-0 border-border/70">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-4 px-4 sm:px-6">
            <SectionState
              pending={query.isPending}
              error={query.isError}
              loadingLabel="Loading users"
              errorTitle="Users are unavailable"
              errorBody="The member directory could not be loaded. Try again shortly."
              isEmpty={!query.isPending && rows.length === 0}
              empty={{
                title: "No members match",
                body: "Adjust the filters or search to see more members.",
              }}
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
            </SectionState>
          </CardContent>
        </Card>
      </CatalogLayout>
      <UserProfile
        user={selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null)
          }
        }}
      />
    </section>
  )
}
