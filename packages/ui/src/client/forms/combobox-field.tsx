"use client"

import { Button } from "@plainworks/elements/button"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  useComboboxAnchor,
} from "@plainworks/elements/combobox"
import { type ReactElement, type ReactNode, useMemo, useRef, useState } from "react"
import { Field } from "./field"
import type { BaseFieldProps } from "./field-props"

/** One option in a {@link ComboboxField}. */
export interface ComboboxOption {
  /** The submitted value; unique across every group. */
  readonly value: string
  /** The visible name, also what the search matches first. */
  readonly label: string
  /** A second line under the label, such as a family or size. */
  readonly description?: ReactNode
  /** Trailing detail, such as a badge. */
  readonly meta?: ReactNode
  /** Extra words the search matches, such as a family or a runtime. */
  readonly keywords?: readonly string[]
  /** Why the option cannot be picked. A disabled option always shows its reason. */
  readonly disabledReason?: string
}

/** A labelled group of options. */
export interface ComboboxOptionGroup {
  readonly label: string
  readonly options: readonly ComboboxOption[]
}

/** The visible strings a {@link ComboboxField} renders, for localization. */
export interface ComboboxFieldLabels {
  /** Shown in the list when the search matches nothing. */
  readonly empty: string
  /** The accessible name of a chip's remove button. */
  readonly remove: (label: string) => string
}

export const defaultComboboxFieldLabels: ComboboxFieldLabels = {
  empty: "No matches",
  remove: (label) => `Remove ${label}`,
}

interface CommonProps extends BaseFieldProps {
  /** Options, flat or in labelled groups, in display order. */
  readonly options: readonly ComboboxOption[] | readonly ComboboxOptionGroup[]
  readonly placeholder?: string | undefined
  readonly labels?: Partial<ComboboxFieldLabels> | undefined
}

/** Props for a single-select {@link ComboboxField}. */
export interface SingleComboboxFieldProps extends CommonProps {
  readonly multiple?: false | undefined
  readonly value?: string | null | undefined
  readonly defaultValue?: string | null | undefined
  readonly onValueChange?: ((value: string | null) => void) | undefined
}

/** Props for a multi-select {@link ComboboxField}; picks show as removable chips. */
export interface MultipleComboboxFieldProps extends CommonProps {
  readonly multiple: true
  readonly value?: readonly string[] | undefined
  readonly defaultValue?: readonly string[] | undefined
  readonly onValueChange?: ((value: string[]) => void) | undefined
}

export type ComboboxFieldProps = SingleComboboxFieldProps | MultipleComboboxFieldProps

interface SharedRootProps {
  readonly items: readonly ComboboxOption[] | readonly { value: string; items: ComboboxOption[] }[]
  readonly name: string
  readonly required: boolean | undefined
  readonly disabled: boolean | undefined
  readonly itemToStringLabel: (o: ComboboxOption) => string
  readonly itemToStringValue: (o: ComboboxOption) => string
  readonly isItemEqualToValue: (a: ComboboxOption, b: ComboboxOption) => boolean
  readonly filter: (o: ComboboxOption, query: string) => boolean
  readonly open: boolean
  readonly onOpenChange: (open: boolean, details: { readonly event: Event }) => void
}

interface ListOpen {
  readonly open: boolean
  readonly onOpenChange: (open: boolean, details: { readonly event: Event }) => void
  readonly close: (event: Event) => void
}

// Base UI opens a tapped input after a short touch delay and does not cancel that delay when the
// list closes first, so a tap made before a pick could reopen the list after it. A press older than
// the event that last closed it is ignored; both timestamps come from the same clock.
function useListOpen(): ListOpen {
  const [open, setOpen] = useState(false)
  const closedAt = useRef(Number.NEGATIVE_INFINITY)
  const close = (event: Event) => {
    closedAt.current = Math.max(closedAt.current, event.timeStamp)
    setOpen(false)
  }
  const onOpenChange = (next: boolean, details: { readonly event: Event }) => {
    if (!next) return close(details.event)
    if (details.event.timeStamp < closedAt.current) return
    setOpen(true)
  }
  return { open, onOpenChange, close }
}

function grouped(
  options: readonly ComboboxOption[] | readonly ComboboxOptionGroup[],
): options is readonly ComboboxOptionGroup[] {
  return options.length > 0 && "options" in (options[0] as object)
}

/** Matches the label, then the keywords, ignoring case. */
export function matchesOption(option: ComboboxOption, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === "") return true
  return [option.label, ...(option.keywords ?? [])].some((text) =>
    text.toLocaleLowerCase().includes(needle),
  )
}

function OptionContent({ option }: { readonly option: ComboboxOption }): ReactElement {
  return (
    <span className="flex min-w-0 flex-1 items-start gap-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{option.label}</span>
        {option.description === undefined ? null : (
          <span className="truncate text-xs text-muted-foreground">{option.description}</span>
        )}
        {option.disabledReason === undefined ? null : (
          <span className="text-xs text-muted-foreground">{option.disabledReason}</span>
        )}
      </span>
      {option.meta === undefined ? null : <span className="shrink-0">{option.meta}</span>}
    </span>
  )
}

function Item({ option }: { readonly option: ComboboxOption }): ReactElement {
  return (
    <ComboboxItem
      value={option}
      disabled={option.disabledReason !== undefined}
      className="min-h-9 py-1.5"
    >
      <OptionContent option={option} />
    </ComboboxItem>
  )
}

interface MultipleComboboxProps {
  readonly shared: SharedRootProps
  readonly anchor: ReturnType<typeof useComboboxAnchor>
  readonly list: ReactNode
  readonly inputProps: Record<string, unknown>
  readonly pick: (value: string) => ComboboxOption | undefined
  readonly removeLabel: (label: string) => string
  readonly close: (event: Event) => void
  readonly value: readonly string[] | undefined
  readonly defaultValue: readonly string[] | undefined
  readonly onValueChange: ((value: string[]) => void) | undefined
}

// The atom's chip remove button has no accessible name, so the wrapper renders its own named one
// and keeps the picks itself when the caller does not control them.
function MultipleCombobox({
  shared,
  anchor,
  list,
  inputProps,
  pick,
  removeLabel,
  close,
  value,
  defaultValue,
  onValueChange,
}: MultipleComboboxProps): ReactElement {
  const [inner, setInner] = useState<readonly string[]>(defaultValue ?? [])
  const current = value ?? inner
  const selected = current.map(pick).filter((o): o is ComboboxOption => o !== undefined)
  const change = (next: string[]) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
  }
  return (
    <Combobox<ComboboxOption, true>
      {...shared}
      multiple
      value={selected}
      onValueChange={(next, details) => {
        // Close after a pick, so on a phone the list never stays over the controls below it.
        if (next.length > current.length) close(details.event)
        change(next.map((o) => o.value))
      }}
    >
      {/* Fits one row of h-7 chips (28px + py-1 + border), so preselected chips never change its height. */}
      <ComboboxChips ref={anchor} className="min-h-9.5">
        {selected.map((option) => (
          <ComboboxChip key={option.value} showRemove={false} className="h-7 pr-0">
            {option.label}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              tabIndex={-1}
              aria-label={removeLabel(option.label)}
              disabled={shared.disabled}
              className="size-6 opacity-70 hover:opacity-100"
              onClick={() => change(current.filter((v) => v !== option.value))}
            >
              <span aria-hidden="true">×</span>
            </Button>
          </ComboboxChip>
        ))}
        <ComboboxChipsInput {...inputProps} />
      </ComboboxChips>
      {list}
    </Combobox>
  )
}

/**
 * A labelled editable combobox (WAI-ARIA APG pattern): typing filters the options, the arrow keys
 * move through them, Enter picks, and Escape closes. Options can be grouped and carry a
 * description, trailing detail and search keywords. A disabled option stays visible with its
 * reason. With `multiple`, picks show as chips with a remove button, and Backspace in an empty
 * input removes the last one. The value submits under `name`.
 */
export function ComboboxField(props: ComboboxFieldProps): ReactElement {
  const {
    name,
    label,
    description,
    orientation,
    required,
    disabled,
    className,
    options,
    placeholder,
    labels,
  } = props
  const names = { ...defaultComboboxFieldLabels, ...labels }
  const anchor = useComboboxAnchor()
  const popup = useListOpen()
  const flat = useMemo(
    () => (grouped(options) ? options.flatMap((g) => g.options) : options),
    [options],
  )
  const byValue = useMemo(() => new Map(flat.map((o) => [o.value, o])), [flat])
  const items = useMemo(
    () =>
      grouped(options) ? options.map((g) => ({ value: g.label, items: [...g.options] })) : flat,
    [options, flat],
  )
  const pick = (value: string) => byValue.get(value)
  const base: Omit<SharedRootProps, "disabled"> = {
    items,
    name,
    required,
    itemToStringLabel: (o: ComboboxOption) => o.label,
    itemToStringValue: (o: ComboboxOption) => o.value,
    isItemEqualToValue: (a: ComboboxOption, b: ComboboxOption) => a.value === b.value,
    filter: (o: ComboboxOption, query: string) => matchesOption(o, query),
    open: popup.open,
    onOpenChange: popup.onOpenChange,
  }
  const list = (
    <ComboboxContent anchor={props.multiple ? anchor : undefined}>
      <ComboboxEmpty>{names.empty}</ComboboxEmpty>
      <ComboboxList>
        {grouped(options)
          ? (group: { value: string; items: ComboboxOption[] }) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(option: ComboboxOption) => <Item key={option.value} option={option} />}
                </ComboboxCollection>
              </ComboboxGroup>
            )
          : (option: ComboboxOption) => <Item key={option.value} option={option} />}
      </ComboboxList>
    </ComboboxContent>
  )
  return (
    <Field
      name={name}
      label={label}
      description={description}
      orientation={orientation}
      required={required}
      disabled={disabled}
      className={className}
    >
      {(control) => {
        // Field disables its control while the form is pending, not only when `disabled` is set.
        // The atom's input defaults to enabled, so it takes the state as well as the root.
        const shared: SharedRootProps = { ...base, disabled: control.disabled }
        const inputProps = {
          id: control.id,
          disabled: control.disabled,
          placeholder,
          "aria-describedby": control["aria-describedby"],
          "aria-invalid": control["aria-invalid"],
        }
        if (props.multiple) {
          return (
            <MultipleCombobox
              shared={shared}
              anchor={anchor}
              list={list}
              inputProps={inputProps}
              pick={pick}
              removeLabel={names.remove}
              close={popup.close}
              value={props.value}
              defaultValue={props.defaultValue}
              onValueChange={props.onValueChange}
            />
          )
        }
        const toOption = (value: string | null | undefined) =>
          value === undefined ? undefined : value === null ? null : (pick(value) ?? null)
        return (
          <Combobox<ComboboxOption>
            {...shared}
            value={toOption(props.value)}
            defaultValue={toOption(props.defaultValue)}
            onValueChange={(next) => props.onValueChange?.(next?.value ?? null)}
          >
            {/* The atom's chevron trigger has no accessible name; the input opens on click and
                ArrowDown on its own. */}
            <ComboboxInput {...inputProps} showTrigger={false} className="w-full" />
            {list}
          </Combobox>
        )
      }}
    </Field>
  )
}
