/**
 * Product-related types
 */

/** A product entity. */
export interface Product {
  id: string
  name: string
  description?: string
  price: number
  category: string
  stock: number
  image?: string
  status: "available" | "out_of_stock" | "discontinued" | "active" | "draft" | "archived"
  createdAt: string
  updatedAt: string
}

/** Client input for creating a product. */
export interface CreateProductInput {
  name: string
  description?: string
  price: number
  category: string
  stock?: number
  status?: Product["status"]
}

/** Client input for updating a product. */
export interface UpdateProductInput {
  name?: string
  description?: string
  price?: number
  category?: string
  stock?: number
  status?: Product["status"]
}
