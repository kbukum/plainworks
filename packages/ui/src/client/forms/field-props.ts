// The prop shapes every labelled field wrapper builds on: the `Field` props it forwards, and a
// control's own props minus everything `Field` injects.
import type { FieldProps } from "./field"

// The field-level props every wrapper forwards to `Field`; the control-specific props are layered
// on per field. `children` is owned by the wrapper (it supplies the control), never by the caller.
export type BaseFieldProps = Omit<FieldProps, "children">

// A control's own props minus everything `Field` injects through its render prop, so a caller can
// never break the id/label/validation wiring by passing `id`, `name`, `disabled`, or the ARIA
// attributes directly. `children` is dropped too: every wrapper supplies its own control (and the
// select its own options), so a caller passing `children` would otherwise be spread onto a void
// `<input>` and crash at runtime.
export type ControlProps<T> = Omit<
  T,
  | "id"
  | "name"
  | "aria-invalid"
  | "aria-describedby"
  | "disabled"
  | "required"
  | "className"
  | "children"
>
