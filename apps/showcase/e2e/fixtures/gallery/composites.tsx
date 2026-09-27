import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import { Input } from "@plainworks/elements/input"
import type { ListFilter, StandardSchemaV1 } from "@plainworks/std"
import { DataTable, type DataTableColumn } from "@plainworks/ui/data-table"
import { DateValue, NumberValue } from "@plainworks/ui/display"
import { Callout, EmptyState, ErrorState, LoadingState, Spinner } from "@plainworks/ui/feedback"
import {
  CheckboxField,
  DateField,
  Form,
  FormSubmit,
  NumberField,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from "@plainworks/ui/forms"
import { FilterBar, type FilterFieldDef, Pagination } from "@plainworks/ui/list"
import { Breadcrumbs } from "@plainworks/ui/navigation"
import { Drawer, Modal } from "@plainworks/ui/overlays"
import { Page, PageHeader, Section as PageSection, Toolbar } from "@plainworks/ui/page"
import { ThemeModeGroup, ThemeModeMenu } from "@plainworks/ui/theme"
import { type ReactElement, useState } from "react"
import { Category, FIXED_DATE, Section } from "./frame"

const CALLOUT_TONES = ["info", "success", "warning", "danger"] as const

interface Order {
  readonly id: string
  readonly customer: string
  readonly note: string
  readonly status: "paid" | "pending" | "refunded"
  readonly total: number
}

const ORDERS: readonly Order[] = [
  { id: "ORD-1001", customer: "Ada Lovelace", note: "Gift wrap", status: "paid", total: 129.5 },
  { id: "ORD-1002", customer: "Alan Turing", note: "—", status: "pending", total: 42 },
  {
    id: "ORD-1003",
    customer: "Grace Hopper",
    note: "Deliver to the loading dock at the rear entrance of the building, between 9am and 11am on a weekday; call ahead and ask for the facilities manager on duty.",
    status: "paid",
    total: 1840.25,
  },
  { id: "ORD-1004", customer: "Edsger Dijkstra", note: "—", status: "refunded", total: 12.99 },
  { id: "ORD-1005", customer: "Barbara Liskov", note: "Express", status: "paid", total: 310 },
  { id: "ORD-1006", customer: "Donald Knuth", note: "—", status: "pending", total: 64.64 },
  { id: "ORD-1007", customer: "Margaret Hamilton", note: "Fragile", status: "paid", total: 999.99 },
  { id: "ORD-1008", customer: "Ken Thompson", note: "—", status: "refunded", total: 7.5 },
]

const ORDER_COLUMNS: readonly DataTableColumn<Order>[] = [
  { id: "id", header: "Order", cell: (row) => row.id, sortable: true },
  { id: "customer", header: "Customer", cell: (row) => row.customer, sortable: true },
  { id: "note", header: "Note", cell: (row) => row.note, priority: "low" },
  {
    id: "status",
    header: "Status",
    cell: (row) => (
      <Badge variant={row.status === "refunded" ? "destructive" : "secondary"}>{row.status}</Badge>
    ),
  },
  {
    id: "total",
    header: "Total",
    align: "end",
    sortable: true,
    cell: (row) => (
      <NumberValue
        value={row.total}
        locale="en-US"
        options={{ style: "currency", currency: "USD" }}
      />
    ),
  },
]

const FILTER_FIELDS: readonly FilterFieldDef[] = [
  { field: "customer", label: "Customer" },
  { field: "total", label: "Total", type: "number" },
  {
    field: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "paid", label: "Paid" },
      { value: "pending", label: "Pending" },
      { value: "refunded", label: "Refunded" },
    ],
  },
]

interface ProfileValues {
  readonly email: string
}

// A tiny Standard Schema that always reports an `email` issue, so submitting the form shows its
// error state.
const rejectingSchema: StandardSchemaV1<unknown, ProfileValues> = {
  "~standard": {
    version: 1,
    vendor: "gallery",
    validate: () => ({
      issues: [
        { message: "Enter a valid work email.", path: ["email"] },
        { message: "The form could not be saved." },
      ],
    }),
  },
}

export function CompositesGroup(): ReactElement {
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" } | null>({
    columnId: "customer",
    direction: "asc",
  })
  const [page, setPage] = useState(2)
  const [filters, setFilters] = useState<readonly ListFilter[]>([
    { field: "status", op: "eq", value: "paid" },
  ])
  return (
    <Category title="ui composites">
      <Section name="DataTable">
        <div className="w-full">
          <DataTable
            caption="Orders"
            columns={ORDER_COLUMNS}
            rows={ORDERS}
            getRowId={(row) => row.id}
            getRowLabel={(row) => row.id}
            selectable
            defaultSelectedKeys={new Set(["ORD-1002"])}
            sort={sort}
            onSortChange={setSort}
          />
        </div>
        <div className="w-full">
          <DataTable
            caption="Loading orders"
            columns={ORDER_COLUMNS}
            rows={[]}
            getRowId={(row) => row.id}
            loading
            loadingRowCount={3}
          />
        </div>
        <div className="w-full">
          <DataTable
            caption="Empty orders"
            columns={ORDER_COLUMNS}
            rows={[]}
            getRowId={(row) => row.id}
          />
        </div>
      </Section>
      <Section name="Pagination (ui)">
        <Pagination page={page} pageSize={10} total={240} onPageChange={setPage} />
      </Section>
      <Section name="FilterBar">
        <div className="w-full">
          <FilterBar fields={FILTER_FIELDS} value={filters} onChange={setFilters} />
        </div>
      </Section>
      <Section name="Form">
        <div className="w-full max-w-lg">
          <Form onSubmit={() => undefined}>
            <TextField
              name="name"
              label="Full name"
              description="As on your ID."
              defaultValue="Ada"
            />
            <TextareaField name="bio" label="Bio" placeholder="Tell us about yourself" />
            <NumberField name="seats" label="Seats" defaultValue="3" />
            <SelectField
              name="plan"
              label="Plan"
              placeholder="Choose a plan"
              options={[
                { value: "free", label: "Free" },
                { value: "pro", label: "Pro" },
                { value: "team", label: "Team", disabled: true },
              ]}
            />
            <CheckboxField name="terms" label="Accept terms" />
            <SwitchField name="notify" label="Email notifications" orientation="horizontal" />
            <DateField name="start" label="Start date" defaultValue="2026-03-14" />
            <TextField name="disabled" label="Disabled field" disabled defaultValue="Locked" />
            <FormSubmit pendingLabel="Saving…">Save profile</FormSubmit>
          </Form>
        </div>
        <div className="w-full max-w-lg" data-gallery-form="error">
          <Form schema={rejectingSchema} onSubmit={() => undefined}>
            <TextField name="email" label="Work email" required defaultValue="ada@" />
            <FormSubmit>Submit invalid form</FormSubmit>
          </Form>
        </div>
      </Section>
      <Section name="Page">
        <div className="w-full">
          <Page>
            <PageHeader
              title="Orders"
              description="Every order across regions."
              actions={<Button>New order</Button>}
            />
            <PageSection title="Recent orders" description="The last seven days.">
              <Toolbar label="Order tools" actions={<Button variant="outline">Export</Button>}>
                <Input aria-label="Search orders" type="search" />
              </Toolbar>
            </PageSection>
          </Page>
        </div>
      </Section>
      <Section name="ErrorState">
        <ErrorState
          title="Orders failed to load"
          description="The orders service did not respond in time."
          onRetry={() => undefined}
          className="w-full max-w-md"
        />
      </Section>
      <Section name="EmptyState">
        <EmptyState
          title="No orders match"
          description="Try a broader filter."
          action={<Button variant="outline">Clear filters</Button>}
          className="w-full max-w-md"
        />
      </Section>
      <Section name="Spinner">
        <Spinner size="sm" label="Loading small" />
        <Spinner size="md" label="Loading medium" />
        <Spinner size="lg" label="Loading large" />
      </Section>
      <Section name="LoadingState">
        <div className="w-80">
          <LoadingState label="Loading orders" lines={3} />
        </div>
      </Section>
      <Section name="Callout">
        {CALLOUT_TONES.map((tone) => (
          <Callout key={tone} tone={tone} title={`${tone} callout`} className="w-full max-w-md">
            A {tone} message with supporting detail.
          </Callout>
        ))}
      </Section>
      <Section name="DateValue">
        <DateValue value={FIXED_DATE} locale="en-US" timeZone="UTC" />
        <DateValue
          value="2026-03-14T15:30:00Z"
          locale="en-GB"
          timeZone="Europe/London"
          options={{ dateStyle: "full", timeStyle: "short" }}
        />
        <DateValue
          value={FIXED_DATE}
          locale="de-DE"
          timeZone="UTC"
          options={{ dateStyle: "medium" }}
        />
      </Section>
      <Section name="NumberValue">
        <NumberValue value={1234567.891} locale="en-US" />
        <NumberValue
          value={1840.25}
          locale="en-US"
          options={{ style: "currency", currency: "USD" }}
        />
        <NumberValue value={0.4213} locale="en-US" options={{ style: "percent" }} />
        <NumberValue
          value={1840.25}
          locale="de-DE"
          options={{ style: "currency", currency: "EUR" }}
        />
      </Section>
      <Section name="Breadcrumbs">
        <Breadcrumbs
          items={[
            { label: "Home", href: "#home" },
            { label: "Orders", href: "#orders" },
            { label: "ORD-1003" },
          ]}
        />
      </Section>
      <Section name="Modal">
        <span data-gallery-trigger="modal">
          <Modal
            title="Confirm order"
            description="Review the order before submitting."
            trigger={<Button variant="outline">Open modal</Button>}
            footer={<Button>Submit order</Button>}
          >
            <p className="text-sm">3 items · $129.50</p>
          </Modal>
        </span>
      </Section>
      <Section name="Drawer">
        <span data-gallery-trigger="drawer">
          <Drawer
            title="Order details"
            description="ORD-1003"
            side="right"
            trigger={<Button variant="outline">Open drawer</Button>}
            footer={<Button>Close order</Button>}
          >
            <p className="p-4 text-sm">Shipping to the loading dock.</p>
          </Drawer>
        </span>
      </Section>
      <Section name="Theme mode">
        <ThemeModeMenu />
        <ThemeModeGroup />
      </Section>
    </Category>
  )
}
