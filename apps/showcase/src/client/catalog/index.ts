"use client"

// Re-export-only barrel for the shared catalog concern — the list-state engine and the filter
// controls (faceted panel, free-text search) the Orders, Products, and Users surfaces reuse.
export type { CatalogLayoutProps } from "./catalog-layout"
export { CatalogLayout } from "./catalog-layout"
export type { FacetFieldDef, FacetOption, FacetPanelProps } from "./facet-panel"
export { FacetPanel } from "./facet-panel"
export type { ListSearchProps } from "./list-search"
export { ListSearch } from "./list-search"
export type { CatalogListBase, CatalogListState } from "./use-catalog-list"
export { useCatalogList } from "./use-catalog-list"
