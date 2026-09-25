"use client"

// Re-export-only barrel for the page-structure concern (page · page header · section · toolbar).
export { Page, type PageProps, type PageWidth } from "./page"
export { PageHeader, type PageHeaderProps } from "./page-header"
export { Section, type SectionHeadingLevel, type SectionProps } from "./section"
export { Toolbar, type ToolbarProps } from "./toolbar"
