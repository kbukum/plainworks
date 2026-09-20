"use client"

import type { Task } from "@plainworks/demo"
import { Button } from "@plainworks/elements/button"
import { Card, CardContent, CardHeader, CardTitle } from "@plainworks/elements/card"
import type { ListFilter, ListQueryParams } from "@plainworks/query"
import type { StreamTransportFactory } from "@plainworks/std"
import type { DataTableSort } from "@plainworks/ui/data-table"
import { DataTable } from "@plainworks/ui/data-table"
import { Callout } from "@plainworks/ui/feedback"
import { FilterBar, type FilterFieldDef, Pagination } from "@plainworks/ui/list"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { type ReactElement, useMemo, useState } from "react"
import { TASK_LIST_PARAMS } from "../../app/constants"
import { taskListPlan } from "../../app/task-read"
import { useHttpClient } from "../http-client"
import { Can, canManageTasks, hasName, useIdentity } from "../session"
import { createDemoTaskStream } from "./demo-task-stream"
import { LiveTaskChannelProvider, LiveTaskFold, LiveToggle } from "./live-tasks"
import { taskColumns } from "./task-columns"
import { TaskDialog } from "./task-dialog"
import { PRIORITY_FILTER_OPTIONS, STATUS_FILTER_OPTIONS } from "./task-fields"
import { useTaskMutations } from "./task-mutations"
import type { TaskFormValues } from "./task-schema"

const PAGE_SIZE = TASK_LIST_PARAMS.pageSize ?? 8

// The filterable columns the FilterBar offers — a free-text title match plus the two enumerations.
const FILTER_FIELDS: readonly FilterFieldDef[] = [
  { field: "title", label: "Title", type: "text" },
  { field: "status", label: "Status", type: "select", options: STATUS_FILTER_OPTIONS },
  { field: "priority", label: "Priority", type: "select", options: PRIORITY_FILTER_OPTIONS },
]

type DialogState = { readonly open: boolean; readonly task?: Task }

/** Props for {@link TasksSection}. */
export interface TasksSectionProps {
  /**
   * The live stream transport, injectable for tests. Defaults to the app-local demo stream; a test
   * passes a fake transport to drive deterministic upserts.
   */
  readonly streamFactory?: StreamTransportFactory
}

/**
 * The flagship Tasks board: a server-prefetched, hydrated list you filter, sort, and page entirely
 * through the kit's list controls; create and edit through an optimistic, roll-back-on-failure
 * mutation gated to authorized callers; and watch update live from a pushed stream — all reconciled
 * into one cache key. The initial request mirrors the SSR prefetch, so the first paint is the
 * hydrated page with no refetch flash.
 */
export function TasksSection({ streamFactory }: TasksSectionProps): ReactElement {
  const httpClient = useHttpClient()
  const stream = useMemo(() => streamFactory ?? createDemoTaskStream(), [streamFactory])
  const [filters, setFilters] = useState<readonly ListFilter[]>([])
  const [sort, setSort] = useState<DataTableSort | null>({
    columnId: TASK_LIST_PARAMS.sortBy ?? "priority",
    direction: TASK_LIST_PARAMS.order ?? "desc",
  })
  const [page, setPage] = useState(TASK_LIST_PARAMS.page ?? 1)
  const [dialog, setDialog] = useState<DialogState>({ open: false })
  const [liveEnabled, setLiveEnabled] = useState(true)

  const params = useMemo<ListQueryParams>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(sort ? { sortBy: sort.columnId, order: sort.direction } : {}),
      ...(filters.length > 0 ? { filters } : {}),
    }),
    [page, sort, filters],
  )

  const plan = taskListPlan(httpClient, params)
  const query = useQuery({ ...plan, placeholderData: keepPreviousData })
  const mutations = useTaskMutations(plan.queryKey, params)

  // The same rule the `canManageTasks` policy enforces, read synchronously through the shared
  // `hasName` predicate so the per-row edit action is gated alongside the create control.
  const identity = useIdentity()
  const canManage = hasName(identity?.claims.name)

  const rows = query.data?.data ?? []
  const total = query.data?.pagination.total ?? 0

  const submit = async (values: TaskFormValues): Promise<boolean> =>
    dialog.task === undefined ? mutations.create(values) : mutations.edit(dialog.task, values)

  const openCreate = (): void => {
    mutations.clearError()
    setDialog({ open: true })
  }
  const openEdit = (task: Task): void => {
    mutations.clearError()
    setDialog({ open: true, task })
  }

  return (
    <LiveTaskChannelProvider options={{ transport: stream }}>
      <section aria-label="Task board" className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground text-sm">
              Filter, sort, and edit tasks while live updates arrive.
            </p>
            <LiveToggle enabled={liveEnabled} onToggle={() => setLiveEnabled((prev) => !prev)} />
          </div>
          <Can
            authorizer={canManageTasks}
            action="tasks:manage"
            fallback={
              <p className="text-muted-foreground text-sm">Sign in to create and edit tasks.</p>
            }
          >
            <Button onClick={openCreate}>New task</Button>
          </Can>
        </div>

        {/* Safe updates land immediately; uncertain list placement triggers a server refresh. */}
        <LiveTaskFold queryKey={plan.queryKey} params={params} enabled={liveEnabled} />

        <FilterBar
          fields={FILTER_FIELDS}
          value={filters}
          onChange={(next) => {
            setFilters(next)
            setPage(1)
          }}
        />

        <Card className="min-w-0 border-border/70">
          <CardHeader className="px-4 sm:px-6">
            <CardTitle>Tasks</CardTitle>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-4 px-4 sm:px-6">
            {query.isError ? (
              <Callout tone="danger" title="Tasks are unavailable">
                The task list could not be loaded. Try again shortly.
              </Callout>
            ) : (
              <>
                <DataTable
                  columns={taskColumns(canManage ? { onEdit: openEdit } : {})}
                  rows={rows}
                  getRowId={(task) => task.id}
                  sort={sort}
                  onSortChange={(next) => {
                    setSort(next)
                    setPage(1)
                  }}
                  loading={query.isPending}
                  caption="Tasks, filterable and sortable, updated live."
                />
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={total}
                  siblingCount={0}
                  onPageChange={setPage}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Can authorizer={canManageTasks} action="tasks:manage" fallback={null}>
          <TaskDialog
            open={dialog.open}
            onOpenChange={(open) => setDialog((prev) => ({ ...prev, open }))}
            task={dialog.task}
            error={mutations.error}
            onSubmit={submit}
          />
        </Can>
      </section>
    </LiveTaskChannelProvider>
  )
}
