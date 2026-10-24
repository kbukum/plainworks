/**
 * Order-related types
 */

/** A line item within an order. */
export interface OrderItem {
  productId: string
  name: string
  quantity: number
  price: number
}

/** An order entity. */
export interface Order {
  id: string
  customerId: string
  customerName: string
  customerEmail: string
  items: OrderItem[]
  total: number
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled"
  createdAt: string
  updatedAt: string
}

/** Client input for creating an order. */
export interface CreateOrderInput {
  customerId: string
  customerName: string
  customerEmail: string
  items: OrderItem[]
  /** Status override (generated randomly when omitted). */
  status?: Order["status"]
}
