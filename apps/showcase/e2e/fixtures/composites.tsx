import "../../src/client/styles.css"

import { Button } from "@plainworks/elements/button"
import { Input } from "@plainworks/elements/input"
import type { ListFilter } from "@plainworks/std"
import { DataTable, type DataTableColumn } from "@plainworks/ui/data-table"
import { EmptyState, ErrorState, LoadingState } from "@plainworks/ui/feedback"
import { FilterBar, type FilterFieldDef } from "@plainworks/ui/list"
import { Page, PageHeader, Section, Toolbar } from "@plainworks/ui/page"
import { type ReactElement, useState } from "react"
import { createRoot } from "react-dom/client"

interface Order {
  readonly id: string
  readonly customer: string
  readonly total: string
  readonly placed: string
  readonly region: string
}

const ORDERS: readonly Order[] = [
  { id: "o-1", customer: "Ada Lovelace", total: "$120.00", placed: "2024-05-01", region: "EMEA" },
  { id: "o-2", customer: "Grace Hopper", total: "$89.50", placed: "2024-05-03", region: "AMER" },
]

const COLUMNS: readonly DataTableColumn<Order>[] = [
  { id: "customer", header: "Customer", cell: (row) => row.customer },
  { id: "total", header: "Total", cell: (row) => row.total, align: "end", nowrap: true },
  { id: "placed", header: "Placed", cell: (row) => row.placed, priority: "low" },
  { id: "region", header: "Region", cell: (row) => row.region, priority: "low" },
]

const FIELDS: readonly FilterFieldDef[] = [
  { field: "customer", label: "Customer", type: "text" },
  { field: "total", label: "Total", type: "number" },
]

// One page composed only from ui composites (page structure, table, filters, region states), so
// the browser gate measures their contrast, target size, reflow, and keyboard flow on real layout.
function CompositeGallery(): ReactElement {
  const [filters, setFilters] = useState<readonly ListFilter[]>([
    { field: "customer", op: "eq", value: "Ada" },
  ])
  return (
    <main>
      <Page>
        <PageHeader
          title="Composite gallery"
          description="Page structure, data, filters, and region states."
          actions={<Button>New order</Button>}
        />
        <Section title="Orders" description="Recent orders.">
          <Toolbar label="Order tools" actions={<Button variant="outline">Export</Button>}>
            <Input aria-label="Search orders" type="search" className="w-full" />
          </Toolbar>
          <FilterBar fields={FIELDS} value={filters} onChange={setFilters} />
          <DataTable
            caption="Orders"
            columns={COLUMNS}
            rows={ORDERS}
            getRowId={(row) => row.id}
            getRowLabel={(row) => row.customer}
            selectable
          />
        </Section>
        <Section title="Region states">
          <LoadingState label="Loading orders" />
          <EmptyState
            title="No orders match"
            description="Try a broader filter."
            action={<Button variant="outline">Clear filters</Button>}
          />
          <ErrorState
            title="Orders are unavailable"
            description="Check your connection."
            onRetry={() => undefined}
          />
        </Section>
      </Page>
    </main>
  )
}

const root = document.getElementById("fixture")
if (root === null) throw new Error("Missing composite gallery root")
createRoot(root).render(<CompositeGallery />)
