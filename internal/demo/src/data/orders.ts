/**
 * Order data factory
 */

import {
  createEntityFactory,
  daysAgo,
  type EntityFactory,
  type FixtureSources,
  nowISOString,
  randomElement,
  randomFloat,
  randomInt,
} from "@plainworks/mocks"
import type { CreateOrderInput, Order, OrderItem } from "../types"

const CUSTOMER_NAMES = ["John Doe", "Jane Smith", "Mike Johnson", "Sarah Williams", "Tom Brown"]
const ORDER_STATUSES: Order["status"][] = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]

function createOrderItem(sources: FixtureSources): OrderItem {
  const { rng, nextId } = sources
  const quantity = randomInt(rng, 1, 5)
  const price = randomFloat(rng, 9.99, 99.99)

  return {
    productId: nextId("prod"),
    name: `Product ${randomInt(rng, 1, 100)}`,
    quantity,
    price,
  }
}

function createOrderEntity(sources: FixtureSources, input?: Partial<CreateOrderInput>): Order {
  const { rng, clock, nextId } = sources
  const customerName = input?.customerName || randomElement(rng, CUSTOMER_NAMES)
  const items =
    input?.items || Array.from({ length: randomInt(rng, 1, 5) }, () => createOrderItem(sources))
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  return {
    id: nextId("order"),
    customerId: input?.customerId || nextId("cust"),
    customerName,
    customerEmail:
      input?.customerEmail || `${customerName.toLowerCase().replace(" ", ".")}@example.com`,
    items,
    total: Number(total.toFixed(2)),
    status: input?.status || randomElement(rng, ORDER_STATUSES),
    createdAt: daysAgo(clock, randomInt(rng, 0, 90)),
    updatedAt: nowISOString(clock),
  }
}

/** Build an order factory driven by the injected per-domain FixtureSources (seeded → reproducible). */
export function createOrderFactory(
  sources: FixtureSources,
): EntityFactory<Order, CreateOrderInput> {
  return createEntityFactory<Order, CreateOrderInput>({
    create: (input) => createOrderEntity(sources, input),
    defaultSeedCount: 200,
  })
}
