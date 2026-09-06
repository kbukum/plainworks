/**
 * Generic entity factory creator
 * Eliminates repetitive factory boilerplate across entities
 */

export interface EntityFactoryConfig<T, TInput> {
  /** Function to create a single entity */
  create: (input?: Partial<TInput>) => T
  /** Default count for seeded data */
  defaultSeedCount?: number
}

export interface EntityFactory<T, TInput> {
  /** Create a single entity */
  create: (input?: Partial<TInput>) => T
  /** Create multiple entities */
  createMany: (count: number) => T[]
  /** Get seeded entities (cached) */
  getSeeded: (count?: number) => T[]
  /** Reset seeded cache */
  resetSeeded: () => void
}

/**
 * Creates a factory with standard CRUD data generation patterns
 */
export function createEntityFactory<T, TInput = Partial<T>>(
  config: EntityFactoryConfig<T, TInput>,
): EntityFactory<T, TInput> {
  const { create, defaultSeedCount = 50 } = config
  let seededCache: T[] | null = null

  return {
    create,

    createMany(count: number): T[] {
      return Array.from({ length: count }, () => create())
    },

    getSeeded(count = defaultSeedCount): T[] {
      // Regenerate when the requested size changes — the first call's count must not pin the cache.
      if (!seededCache || seededCache.length !== count) {
        seededCache = Array.from({ length: count }, () => create())
      }
      return seededCache
    },

    resetSeeded(): void {
      seededCache = null
    },
  }
}
