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
import { Menu } from "lucide-react"
import { type ReactElement, useEffect, useRef, useState } from "react"
import { breadcrumbTrail, sectionForPath } from "../../app/navigation"
import { CommandMenu } from "../command"
import { NotificationsBell } from "../notifications/notifications-bell"
import { routerLinkRender, useRouter } from "../router"
import { ModeControl, THEME_ERROR_MESSAGE } from "../theme-studio"
import { AccountMenu } from "./account-menu"
import { SectionNav } from "./section-nav"
import { SectionOutlet } from "./section-outlet"

/**
 * The persistent application shell every section renders inside: a header (product mark, command
 * palette, mode control, account menu), a section navigation that is a rail on wide viewports and a
 * disclosure drawer on narrow ones, and the main region with breadcrumbs, the section title, and
 * the active section's outlet. It owns no section state — the active section is derived from the
 * router path, so navigation, breadcrumbs, and title stay in sync from one source. The rail/drawer
 * switch is a container query, so the shell adapts to the space it is given rather than the
 * viewport.
 */
export function AppShell(): ReactElement {
  const { path, navigate } = useRouter()
  const { error, resolvedMode } = useTheme()
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
      className="@container/shell grid min-h-dvh grid-rows-[auto_1fr] bg-background text-foreground"
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
      <header className="sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b border-border/70 bg-background/95 px-2 py-3 shadow-xs backdrop-blur sm:gap-3 sm:px-4">
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
          <NotificationsBell />
          <ModeControl announceError={false} compact className="h-8 sm:h-9" />
          <AccountMenu />
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-1 @3xl/shell:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-border/70 bg-muted/20 p-3 @3xl/shell:block">
          <SectionNav label="Primary" />
        </aside>
        <main
          id="main-content"
          tabIndex={-1}
          aria-labelledby="section-title"
          className="min-w-0 bg-background p-4 outline-none sm:p-6"
        >
          <div className="mx-auto w-full max-w-360">
            <Breadcrumbs items={crumbs} />
            <h1
              ref={headingRef}
              tabIndex={-1}
              id="section-title"
              className="mt-3 text-2xl font-semibold tracking-tight outline-none"
            >
              {active.label}
            </h1>
            {error === undefined ? null : (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {THEME_ERROR_MESSAGE}
              </p>
            )}
            <div className="mt-4">
              <SectionOutlet section={active} />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
