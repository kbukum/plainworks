---
"@plainworks/ui": patch
---

Add the `forms` and `list` concerns to `@plainworks/ui`, the two interwoven UI surfaces for editing and browsing records:

- **Forms** — build validated forms on React 19 Actions and any Standard Schema validator. `Form` runs the schema on submit, keeps field- and form-level errors in sync, and wires each `Field` with matching `id`, label, description, and ARIA state automatically. A failed submission keeps every entered value instead of resetting the form. A ready set of typed fields (text, number, date, textarea, select, checkbox, switch) and a pending-aware `FormSubmit` cover the common cases, importable from `@plainworks/ui/forms`.
- **List** — page and filter lists with controls that speak the neutral `std/list` contract. `Pagination` is a controlled offset pager with an accessible, ellipsis-aware page range; `FilterBar` is a controlled filter builder that emits `std/list` `ListFilter[]`, constraining each row's operators to what the field allows and coercing values into the right filter shape, importable from `@plainworks/ui/list`.

Both concerns reuse the elements inputs downward and keep record values and list state caller-controlled — `Form` owns only its per-submission validation errors — and ship accessible-by-default with axe-checked tests.
