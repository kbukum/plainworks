/**
 * Order API handlers
 */

import type { Clock } from "@plainworks/std"
import type { HttpHandler } from "msw"
import type { EntityFactory, EntityStore } from "../data/common"
import type { CreateOrderInput, Order } from "../types"
import type { LatencyController } from "../utils/delay"
import { createCrudHandlers, type InputSpec } from "./common"

const ORDER_INPUT_SPEC: InputSpec = {
  customerId: { kind: "string" },
  customerName: { kind: "string" },
  customerEmail: { kind: "string" },
  status: { kind: "enum", values: ["pending", "processing", "shipped", "delivered", "cancelled"] },
  items: {
    kind: "objectArray",
    item: {
      productId: { kind: "string", required: true },
      name: { kind: "string", required: true },
      quantity: { kind: "number", required: true },
      price: { kind: "number", required: true },
    },
  },
}

/** Build the `/api/orders` CRUD handlers against this server's store. */
export function createOrderHandlers(
  factory: EntityFactory<Order, CreateOrderInput>,
  store: EntityStore<Order>,
  latency: LatencyController,
  clock: Clock,
): HttpHandler[] {
  return createCrudHandlers<Order, CreateOrderInput>({
    basePath: "/api/orders",
    entityName: "Order",
    store,
    createEntity: factory.create,
    latency,
    clock,
    inputSpec: ORDER_INPUT_SPEC,
    searchFields: ["customerName", "customerEmail"],
    sortFields: ["customerName", "customerEmail", "total", "status", "createdAt"],
    applyUpdate: (current, updates) => {
      const merged = { ...current, ...updates }
      // Derived invariant: patching items must recompute the total.
      if (updates.items) {
        merged.total = Number(
          updates.items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2),
        )
      }
      return { ...merged, updatedAt: new Date(clock.now()).toISOString() }
    },
  })
}
