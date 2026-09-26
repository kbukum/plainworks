"use client"

export type {
  ColumnAlign,
  DataTableColumn,
  DataTableIcons,
  DataTableLabels,
  DataTableProps,
  DataTableSort,
  SortDirection,
} from "./client/data-table"
export { DataTable, defaultDataTableLabels } from "./client/data-table"
export type { DateInput, DateValueProps, NumberValueProps } from "./client/display"
export { DateValue, NumberValue } from "./client/display"
// Client public entry for `@plainworks/ui` — re-export-only barrel over every client concern
// module (never the server `.` barrel). The per-module `"use client"` directives make tsdown emit
// this (and only the client graph) as the client entry; the server `.` entry stays clean. Per-
// concern subpaths (`@plainworks/ui/data-table`, `@plainworks/ui/layout`, …) let consumers import a
// single concern; this aggregate is the convenience surface. The DOM-free stately behaviour hooks
// live in the neutral-compiled `src/hooks/` folder but are React, so they ship from here — never
// from the neutral `.` entry.
export type {
  AsyncStateProps,
  CalloutProps,
  CalloutTone,
  EmptyStateProps,
  ErrorStateAction,
  ErrorStateProps,
  LoadingStateProps,
  SpinnerProps,
} from "./client/feedback"
export {
  AsyncState,
  Callout,
  EmptyState,
  ErrorState,
  LoadingState,
  Spinner,
} from "./client/feedback"
export type {
  CheckboxFieldProps,
  DateFieldProps,
  FieldControlProps,
  FieldErrors,
  FieldOrientation,
  FieldProps,
  FormContextValue,
  FormFieldValue,
  FormLabels,
  FormProps,
  FormSubmitProps,
  FormValues,
  NumberFieldProps,
  SchemaFormProps,
  SchemalessFormProps,
  SelectFieldOption,
  SelectFieldProps,
  SwitchFieldProps,
  TextareaFieldProps,
  TextFieldProps,
} from "./client/forms"
export {
  CheckboxField,
  DateField,
  defaultFormLabels,
  Field,
  Form,
  FormSubmit,
  NumberField,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
  useFieldErrors,
  useFormContext,
} from "./client/forms"
export type {
  Clipboard,
  ClipboardErrorKind,
  ShortcutHandler,
  UseClipboardOptions,
  UseKeyboardShortcutsOptions,
} from "./client/hooks"
export {
  ClipboardError,
  useClipboard,
  useKeyboardShortcuts,
  useMediaQuery,
} from "./client/hooks"
export type { Gap, GridProps, SplitProps, StackProps } from "./client/layout"
export { Grid, Split, Stack } from "./client/layout"
export type {
  FilterBarLabelOverrides,
  FilterBarLabels,
  FilterBarProps,
  FilterFieldDef,
  FilterFieldOption,
  FilterFieldType,
  PaginationLabels,
  PaginationProps,
  PaginationSlot,
} from "./client/list"
export {
  buildFilter,
  defaultFilterBarLabels,
  defaultPaginationLabels,
  encodeListValues,
  FilterBar,
  getPaginationRange,
  operatorsForField,
  Pagination,
  parseListValues,
} from "./client/list"
export type { BreadcrumbEntry, BreadcrumbsProps } from "./client/navigation"
export { Breadcrumbs } from "./client/navigation"
export type { DrawerProps, DrawerSide, ModalProps } from "./client/overlays"
export { Drawer, Modal } from "./client/overlays"
export type {
  PageHeaderProps,
  PageProps,
  PageWidth,
  SectionHeadingLevel,
  SectionProps,
  ToolbarProps,
} from "./client/page"
export { Page, PageHeader, Section, Toolbar } from "./client/page"
export type {
  ThemeContextValue,
  ThemeProviderProps,
  ThemeToggleProps,
} from "./client/theme"
export { ThemeProvider, ThemeToggle, useTheme } from "./client/theme"
export type {
  Disclosure,
  ListState,
  Selection,
  SelectionMode,
  StateUpdater,
  UseControllableStateOptions,
  UseDisclosureOptions,
  UseListStateOptions,
  UseSelectionOptions,
} from "./hooks"
export { useControllableState, useDisclosure, useListState, useSelection } from "./hooks"
