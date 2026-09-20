"use client"

import { buttonVariants } from "@plainworks/elements/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@plainworks/elements/sheet"
import { cn } from "@plainworks/theme"
import { useTheme } from "@plainworks/theme/client"
import { Breadcrumbs, type BreadcrumbsProps } from "@plainworks/ui/navigation"
import { ThemeToggle } from "@plainworks/ui/theme"
import { Menu } from "lucide-react"
import { type ReactElement, useEffect, useRef, useState } from "react"
import { breadcrumbTrail, sectionForPath } from "../../app/navigation"
import { CommandMenu } from "../command"
import { routerLinkRender, useRouter } from "../router"
import { AccountMenu } from "./account-menu"
import { SectionNav } from "./section-nav"
import { SectionOutlet } from "./section-outlet"

/**
 * The persistent application shell every section renders inside: a header (product mark, command
 * palette, theme toggle, account menu), a section navigation that is a rail on wide viewports and a
 * disclosure drawer on narrow ones, and the main region with breadcrumbs, the section title, and
 * the active section's outlet. It owns no section state — the active section is derived from the
 * router path, so navigation, breadcrumbs, and title stay in sync from one source. The rail/drawer
 * switch is a container query, so the shell adapts to the space it is given rather than the
 * viewport.
 */
export function AppShell(): ReactElement {
  const { path, navigate } = useRouter()
  const { resolvedMode } = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isInitialRender = useRef(true)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const active = sectionForPath(path)
  const linkRender = routerLinkRender(navigate)

  useEffect(() => {
    void path
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [path])

  const crumbs: BreadcrumbsProps["items"] = breadcrumbTrail(active).map((crumb) =>
    crumb.path === undefined
      ? { label: crumb.label }
      : { label: crumb.label, href: crumb.path, render: linkRender },
  )

  return (
    <div
      data-mode={resolvedMode}
      className="@container/shell min-h-dvh bg-background text-foreground"
    >
      <a
        href="#main-content"
        className={cn(
          buttonVariants({ variant: "default" }),
          "sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50",
        )}
      >
        Skip to main content
      </a>
      <header className="flex flex-wrap items-center gap-2 border-b px-2 py-3 sm:gap-3 sm:px-4">
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger
            aria-label="Open sections menu"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "@3xl/shell:hidden")}
          >
            <Menu aria-hidden className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-4">
            <SheetHeader className="p-0">
              <SheetTitle>Sections</SheetTitle>
            </SheetHeader>
            <SectionNav label="Sections" onNavigate={() => setDrawerOpen(false)} className="mt-4" />
          </SheetContent>
        </Sheet>
        <span className="font-semibold tracking-tight">plainworks</span>
        <div className="ml-auto flex items-center gap-2">
          <CommandMenu />
          <ThemeToggle className="h-8 px-2 text-xs sm:h-9 sm:px-4 sm:text-sm" />
          <AccountMenu />
        </div>
      </header>

      <div className="flex">
        <aside className="hidden w-64 shrink-0 border-r p-3 @3xl/shell:block">
          <SectionNav label="Primary" />
        </aside>
        <main
          id="main-content"
          tabIndex={-1}
          aria-labelledby="section-title"
          className="min-w-0 grow p-4 sm:p-6 outline-none"
        >
          <Breadcrumbs items={crumbs} />
          <h1
            ref={headingRef}
            tabIndex={-1}
            id="section-title"
            className="mt-3 text-2xl font-semibold tracking-tight outline-none"
          >
            {active.label}
          </h1>
          <div className="mt-4">
            <SectionOutlet section={active} />
          </div>
        </main>
      </div>
    </div>
  )
}
