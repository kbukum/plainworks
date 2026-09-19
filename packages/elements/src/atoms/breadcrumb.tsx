"use client"

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "@plainworks/theme"
import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"
import type * as React from "react"

/**
 * Props for {@link BreadcrumbLink}, including its `render` extension point: pass a host link
 * element (a Next.js `<Link>`, a typed-router link) and it renders in place of the default anchor,
 * receiving the merged link props — the destination included — so a router-aware app gets client
 * navigation.
 */
export type BreadcrumbLinkProps = useRender.ComponentProps<"a">

function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">): React.ReactElement {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" className={cn(className)} {...props} />
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">): React.ReactElement {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">): React.ReactElement {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

function BreadcrumbLink({ className, render, ...props }: BreadcrumbLinkProps): React.ReactElement {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "inline-flex min-h-6 min-w-6 items-center justify-center transition-colors hover:text-foreground",
          className,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "breadcrumb-link",
    },
  })
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">): React.ReactElement {
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn("font-normal text-foreground", className)}
      {...props}
    />
  )
}

function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">): React.ReactElement {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? <ChevronRightIcon />}
    </li>
  )
}

function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">): React.ReactElement {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-5 items-center justify-center [&>svg]:size-4", className)}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className="sr-only">More</span>
    </span>
  )
}

export {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
}
