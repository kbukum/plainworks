/**
 * Content/CMS API handlers
 */

import type { Clock } from "@plainworks/std"
import type { HttpHandler } from "msw"
import type { EntityFactory, EntityStore } from "../data/common"
import type { ContentPage, CreateContentPageInput } from "../types/content"
import type { LatencyController } from "../utils/delay"
import { createCrudHandlers, type InputSpec } from "./common"

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

const CONTENT_INPUT_SPEC: InputSpec = {
  title: { kind: "string" },
  status: { kind: "enum", values: ["draft", "published", "archived"] },
  category: { kind: "string" },
  content: { kind: "string" },
}

/** Build the `/api/content-pages` CRUD handlers against this server's store. */
export function createContentHandlers(
  factory: EntityFactory<ContentPage, CreateContentPageInput>,
  store: EntityStore<ContentPage>,
  latency: LatencyController,
  clock: Clock,
): HttpHandler[] {
  return createCrudHandlers<ContentPage, CreateContentPageInput>({
    basePath: "/api/content-pages",
    entityName: "ContentPage",
    store,
    createEntity: factory.create,
    latency,
    clock,
    inputSpec: CONTENT_INPUT_SPEC,
    searchFields: ["title", "author", "content"],
    filterFields: ["status", "category"],
    sortFields: ["title", "author", "status", "category", "createdAt"],
    applyUpdate: (current, updates) => {
      const merged = { ...current, ...updates }
      // Derived invariant: patching the title re-derives the slug (keeping its numeric suffix).
      if (updates.title) {
        const suffix = /-(\d+)$/.exec(current.slug)?.[1] ?? "1"
        merged.slug = `${slugify(updates.title)}-${suffix}`
      }
      return { ...merged, updatedAt: new Date(clock.now()).toISOString() }
    },
  })
}
