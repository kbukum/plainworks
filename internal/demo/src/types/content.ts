/**
 * Content/CMS-related types
 */

/** A content page entity. */
export interface ContentPage {
  id: string
  title: string
  slug: string
  author: string
  status: "draft" | "published" | "archived"
  category: string
  content: string
  createdAt: string
  updatedAt: string
}

/** Client input for creating a content page. */
export interface CreateContentPageInput {
  title: string
  status?: ContentPage["status"]
  category?: string
  content: string
}

/** Client input for updating a content page. */
export interface UpdateContentPageInput {
  title?: string
  status?: ContentPage["status"]
  category?: string
  content?: string
}
