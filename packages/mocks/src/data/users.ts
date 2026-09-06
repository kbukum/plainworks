/**
 * User data factory
 */

import type { CreateUserInput, User, UserDepartment } from "../types"
import { daysAgo, nowISOString } from "../utils"
import { randomBoolean, randomElement, randomInt } from "../utils/random"
import { createEntityFactory, type EntityFactory, type FixtureSources } from "./common"

const FIRST_NAMES = [
  "Alice",
  "Bob",
  "Charlie",
  "Diana",
  "Eve",
  "Frank",
  "Grace",
  "Henry",
  "Ivy",
  "Jack",
  "Karen",
  "Leo",
  "Maria",
  "Nathan",
  "Olivia",
  "Peter",
  "Quinn",
  "Rachel",
  "Steve",
  "Tina",
]
const LAST_NAMES = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Wilson",
  "Taylor",
  "Anderson",
  "Thomas",
  "Jackson",
  "White",
  "Harris",
  "Martin",
  "Thompson",
  "Robinson",
  "Clark",
  "Lewis",
]
const DEPARTMENTS: UserDepartment[] = [
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
]
const ROLES: User["role"][] = ["admin", "user", "editor", "viewer", "moderator"]
const STATUSES: User["status"][] = ["active", "inactive", "pending", "suspended"]

function createUserEntity(sources: FixtureSources, input?: Partial<CreateUserInput>): User {
  const { rng, clock, nextId } = sources
  const firstName = input?.firstName || randomElement(rng, FIRST_NAMES)
  const lastName = input?.lastName || randomElement(rng, LAST_NAMES)
  const name = input?.name || `${firstName} ${lastName}`
  const email = input?.email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`
  const createdAt = daysAgo(clock, randomInt(rng, 1, 365))

  return {
    id: nextId("user"),
    email,
    // Provide both name formats for flexibility
    name,
    firstName,
    lastName,
    department: input?.department || randomElement(rng, DEPARTMENTS),
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
    role: input?.role || randomElement(rng, ROLES),
    status: input?.status || randomElement(rng, STATUSES),
    // Numeric fields for filter testing
    age: input?.age ?? randomInt(rng, 22, 65),
    score: input?.score ?? randomInt(rng, 0, 100),
    // Boolean field for filter testing
    verified: input?.verified ?? randomBoolean(rng, 0.7),
    // Last login - some users logged in recently, some not
    lastLoginAt: randomBoolean(rng, 0.8) ? daysAgo(clock, randomInt(rng, 0, 30)) : undefined,
    createdAt,
    updatedAt: nowISOString(clock),
  }
}

/** Build a user factory driven by the injected per-domain FixtureSources (seeded → reproducible). */
export function createUserFactory(sources: FixtureSources): EntityFactory<User, CreateUserInput> {
  return createEntityFactory<User, CreateUserInput>({
    create: (input) => createUserEntity(sources, input),
    defaultSeedCount: 150,
  })
}
