/**
 * User API handlers
 */

import type { Clock } from "@plainworks/std"
import type { HttpHandler } from "msw"
import type { EntityFactory, EntityStore } from "../data/common"
import type { CreateUserInput, User } from "../types"
import type { LatencyController } from "../utils/delay"
import { createCrudHandlers, type InputSpec } from "./common"

const USER_INPUT_SPEC: InputSpec = {
  email: { kind: "string" },
  name: { kind: "string" },
  firstName: { kind: "string" },
  lastName: { kind: "string" },
  department: {
    kind: "enum",
    values: [
      "Engineering",
      "Marketing",
      "Sales",
      "Support",
      "Design",
      "Finance",
      "HR",
      "Legal",
      "Operations",
      "Product",
    ],
  },
  role: { kind: "enum", values: ["admin", "user", "editor", "viewer", "moderator"] },
  status: { kind: "enum", values: ["active", "inactive", "pending", "suspended"] },
  age: { kind: "number" },
  score: { kind: "number" },
  verified: { kind: "boolean" },
}

/** Build the `/api/users` CRUD handlers against this server's store. */
export function createUserHandlers(
  factory: EntityFactory<User, CreateUserInput>,
  store: EntityStore<User>,
  latency: LatencyController,
  clock: Clock,
): HttpHandler[] {
  return createCrudHandlers<User, CreateUserInput>({
    basePath: "/api/users",
    entityName: "User",
    store,
    createEntity: factory.create,
    latency,
    clock,
    inputSpec: USER_INPUT_SPEC,
    searchFields: ["name", "email", "firstName", "lastName"],
    filterFields: ["role", "status", "department", "verified", "age", "score"],
    facetFields: ["role", "status", "department", "verified"],
    sortFields: ["name", "email", "firstName", "lastName", "age", "score", "createdAt"],
  })
}
