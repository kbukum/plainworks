/**
 * Content/CMS data factory
 */

import type { ContentPage, CreateContentPageInput } from "../types/content"
import { daysAgo, nowISOString } from "../utils"
import { randomElement, randomInt } from "../utils/random"
import { createEntityFactory, type EntityFactory, type FixtureSources } from "./common"

const CATEGORIES = ["Blog", "News", "Tutorial", "Documentation", "Announcement", "Case Study"]
const STATUSES: ContentPage["status"][] = ["draft", "published", "archived"]
const AUTHORS = [
  "Alice Johnson",
  "Bob Smith",
  "Charlie Brown",
  "Diana Ross",
  "Eve Wilson",
  "Frank Miller",
]

// Lorem ipsum style content generator
function generateContent(sources: FixtureSources): string {
  const { rng } = sources
  const paragraphs = [
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
    "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
    "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
    "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.",
  ]
  const count = randomInt(rng, 3, 5)
  return Array.from({ length: count }, () => randomElement(rng, paragraphs)).join("\n\n")
}

// Title generator
function generateTitle(sources: FixtureSources): string {
  const { rng } = sources
  const titles = [
    "Getting Started with Our Platform",
    "Best Practices for Performance",
    "Understanding the Core Concepts",
    "Advanced Configuration Guide",
    "Troubleshooting Common Issues",
    "New Feature Announcement",
    "Security Best Practices",
    "Integration Tutorial",
    "API Documentation Update",
    "Release Notes v2.0",
  ]
  const suffixes = ["", " - Part 1", " - Part 2", " (Updated)", " (2024)"]
  return randomElement(rng, titles) + randomElement(rng, suffixes)
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

function createContentPageEntity(
  sources: FixtureSources,
  input?: Partial<CreateContentPageInput>,
): ContentPage {
  const { rng, clock, nextId } = sources
  const title = input?.title || generateTitle(sources)

  return {
    id: nextId("content"),
    title,
    slug: `${slugify(title)}-${randomInt(rng, 1, 9999)}`,
    author: randomElement(rng, AUTHORS),
    status: input?.status || randomElement(rng, STATUSES),
    category: input?.category || randomElement(rng, CATEGORIES),
    content: input?.content || generateContent(sources),
    createdAt: daysAgo(clock, randomInt(rng, 1, 365)),
    updatedAt: nowISOString(clock),
  }
}

/** Build a content-page factory driven by the injected per-domain FixtureSources (seeded → reproducible). */
export function createContentFactory(
  sources: FixtureSources,
): EntityFactory<ContentPage, CreateContentPageInput> {
  return createEntityFactory<ContentPage, CreateContentPageInput>({
    create: (input) => createContentPageEntity(sources, input),
    defaultSeedCount: 50,
  })
}
