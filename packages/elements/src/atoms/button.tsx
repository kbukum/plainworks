"use client"

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "@plainworks/theme"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

type ButtonVariantSchema = {
  variant: Record<"default" | "destructive" | "outline" | "secondary" | "ghost" | "link", string>
  size: Record<"default" | "sm" | "lg" | "icon" | "icon-sm" | "icon-lg", string>
}

const createButtonVariants: ReturnType<typeof cva<ButtonVariantSchema>> = cva<ButtonVariantSchema>(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-hidden focus-visible:border-ring focus-visible:ring-ring focus-visible:ring-[3px] aria-invalid:ring-destructive dark:aria-invalid:ring-destructive aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive dark:focus-visible:ring-destructive",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)
const buttonVariants: typeof createButtonVariants = createButtonVariants

function Button({
  className,
  variant = "default",
  size = "default",
  render,
  ...props
}: useRender.ComponentProps<"button"> & VariantProps<typeof buttonVariants>): React.ReactElement {
  const type: React.ButtonHTMLAttributes<HTMLButtonElement>["type"] = render ? undefined : "button"
  const defaultProps = {
    "data-slot": "button",
    "data-variant": variant,
    "data-size": size,
    className: cn(buttonVariants({ variant, size, className })),
    type,
  }

  return useRender({
    defaultTagName: "button",
    render,
    props: mergeProps<"button">(defaultProps, props),
  })
}

export { Button, buttonVariants }
