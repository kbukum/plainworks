"use client"

import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field"
import { cn } from "@plainworks/theme"
import { MinusIcon, PlusIcon } from "lucide-react"
import type { ReactElement } from "react"

// shadcn ships no number field, so this owned atom wraps Base UI NumberField in the same visual
// language as the vendored `input` and `input-group`. Base UI owns parsing, locale formatting,
// clamping, keyboard stepping and the ARIA; this file only styles the parts.

function NumberField({ className, ...props }: NumberFieldPrimitive.Root.Props): ReactElement {
  return (
    <NumberFieldPrimitive.Root
      data-slot="number-field"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

function NumberFieldGroup({ className, ...props }: NumberFieldPrimitive.Group.Props): ReactElement {
  return (
    <NumberFieldPrimitive.Group
      data-slot="number-field-group"
      className={cn(
        "flex h-8 w-full min-w-0 items-center rounded-lg border border-input bg-transparent transition-colors has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50 has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-3 has-[input[aria-invalid=true]]:ring-destructive/20 data-disabled:cursor-not-allowed data-disabled:bg-input/50 data-disabled:opacity-50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  )
}

function NumberFieldInput({ className, ...props }: NumberFieldPrimitive.Input.Props): ReactElement {
  return (
    <NumberFieldPrimitive.Input
      data-slot="number-field-input"
      className={cn(
        "h-full w-full min-w-0 flex-1 bg-transparent px-2.5 py-1 text-base tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm",
        className,
      )}
      {...props}
    />
  )
}

const STEPPER =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5"

function NumberFieldDecrement({
  className,
  children,
  ...props
}: NumberFieldPrimitive.Decrement.Props): ReactElement {
  return (
    <NumberFieldPrimitive.Decrement
      data-slot="number-field-decrement"
      aria-label="Decrease"
      className={cn(STEPPER, "ml-1", className)}
      {...props}
    >
      {children ?? <MinusIcon aria-hidden="true" />}
    </NumberFieldPrimitive.Decrement>
  )
}

function NumberFieldIncrement({
  className,
  children,
  ...props
}: NumberFieldPrimitive.Increment.Props): ReactElement {
  return (
    <NumberFieldPrimitive.Increment
      data-slot="number-field-increment"
      aria-label="Increase"
      className={cn(STEPPER, "mr-1", className)}
      {...props}
    >
      {children ?? <PlusIcon aria-hidden="true" />}
    </NumberFieldPrimitive.Increment>
  )
}

export {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
}
