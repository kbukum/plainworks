---
"@plainworks/elements": patch
"@plainworks/ui": patch
---

Let a host control how a breadcrumb destination renders. Each `Breadcrumbs` entry now accepts a
`render` element, so a Next.js `<Link>` or a typed-router link renders in place of the default
anchor and receives the destination — a router-aware app gets client navigation and preloading
instead of a full page reload. Omit it and the entry stays a plain anchor, so server-rendered pages
keep real links and existing usage is unchanged. The breadcrumb atom exposes its `BreadcrumbLinkProps`
so the injected link is fully typed.
