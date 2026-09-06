/**
 * Product API handlers
 */

import type { Clock } from "@plainworks/std"
import type { HttpHandler } from "msw"
import type { EntityFactory, EntityStore } from "../data/common"
import type { CreateProductInput, Product } from "../types"
import type { LatencyController } from "../utils/delay"
import { createCrudHandlers, type InputSpec } from "./common"

const PRODUCT_INPUT_SPEC: InputSpec = {
  name: { kind: "string" },
  description: { kind: "string" },
  price: { kind: "number" },
  category: { kind: "string" },
  stock: { kind: "number" },
  status: {
    kind: "enum",
    values: ["available", "out_of_stock", "discontinued", "active", "draft", "archived"],
  },
}

/** Build the `/api/products` CRUD handlers against this server's store. */
export function createProductHandlers(
  factory: EntityFactory<Product, CreateProductInput>,
  store: EntityStore<Product>,
  latency: LatencyController,
  clock: Clock,
): HttpHandler[] {
  return createCrudHandlers<Product, CreateProductInput>({
    basePath: "/api/products",
    entityName: "Product",
    store,
    createEntity: factory.create,
    latency,
    clock,
    inputSpec: PRODUCT_INPUT_SPEC,
    searchFields: ["name", "description", "category"],
    sortFields: ["name", "category", "price", "stock", "createdAt"],
  })
}
