/**
 * Product data factory
 */

import type { CreateProductInput, Product } from "../types"
import { daysAgo, nowISOString } from "../utils"
import { randomElement, randomFloat, randomInt } from "../utils/random"
import { createEntityFactory, type EntityFactory, type FixtureSources } from "./common"

const PRODUCT_NAMES = [
  "Wireless Headphones",
  "Smart Watch",
  "Laptop Stand",
  "USB-C Hub",
  "Mechanical Keyboard",
  "Gaming Mouse",
  "Monitor Light",
  "Webcam HD",
  "Desk Mat",
  "Cable Organizer",
  "Phone Stand",
  "Bluetooth Speaker",
]
const CATEGORIES = ["Electronics", "Accessories", "Office", "Audio", "Gaming"]
// Available product statuses
const PRODUCT_STATUSES: Product["status"][] = ["available", "out_of_stock", "discontinued"]

function createProductEntity(
  sources: FixtureSources,
  input?: Partial<CreateProductInput>,
): Product {
  const { rng, clock, nextId } = sources
  const name = input?.name || randomElement(rng, PRODUCT_NAMES)
  const stock = input?.stock ?? randomInt(rng, 0, 500)
  // Auto-determine status based on stock if not provided, or use random from available statuses
  const status =
    input?.status ||
    (stock === 0
      ? "out_of_stock"
      : randomElement(
          rng,
          PRODUCT_STATUSES.filter((s) => s !== "out_of_stock"),
        ))

  return {
    id: nextId("prod"),
    name,
    description: input?.description || `High-quality ${name.toLowerCase()} for everyday use.`,
    price: input?.price ?? randomFloat(rng, 9.99, 299.99),
    category: input?.category || randomElement(rng, CATEGORIES),
    stock,
    image: `https://picsum.photos/seed/${encodeURIComponent(name)}/400/300`,
    status,
    createdAt: daysAgo(clock, randomInt(rng, 1, 180)),
    updatedAt: nowISOString(clock),
  }
}

/** Build a product factory driven by the injected per-domain FixtureSources (seeded → reproducible). */
export function createProductFactory(
  sources: FixtureSources,
): EntityFactory<Product, CreateProductInput> {
  return createEntityFactory<Product, CreateProductInput>({
    create: (input) => createProductEntity(sources, input),
    defaultSeedCount: 100,
  })
}
