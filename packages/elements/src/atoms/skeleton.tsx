"use client"

import { cn } from "@plainworks/theme"
import type * as React from "react"

function Skeleton({ className, ...props }: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

export { Skeleton }
