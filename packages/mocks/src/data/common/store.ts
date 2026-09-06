/**
 * Generic in-memory store for mock data
 * Provides a reusable pattern for entity storage
 */

export interface EntityStore<T> {
  /** Get all items (initializes if empty) */
  getAll: () => T[]
  /** Set all items */
  setAll: (items: T[]) => void
  /** Find item by predicate */
  find: (predicate: (item: T) => boolean) => T | undefined
  /** Find index by predicate */
  findIndex: (predicate: (item: T) => boolean) => number
  /** Add item to start */
  prepend: (item: T) => void
  /** Update item at index */
  update: (index: number, item: T) => void
  /** Remove item at index */
  remove: (index: number) => void
  /** Reset store to empty */
  reset: () => void
}

/**
 * Creates an in-memory store with lazy initialization
 */
export function createStore<T>(initializer: () => T[]): EntityStore<T> {
  let items: T[] = []
  let initialized = false

  function ensureInitialized(): T[] {
    if (!initialized) {
      items = [...initializer()]
      initialized = true
    }
    return items
  }

  return {
    getAll: () => ensureInitialized(),

    setAll(newItems: T[]): void {
      items = newItems
      initialized = true
    },

    find(predicate: (item: T) => boolean): T | undefined {
      return ensureInitialized().find(predicate)
    },

    findIndex(predicate: (item: T) => boolean): number {
      return ensureInitialized().findIndex(predicate)
    },

    prepend(item: T): void {
      ensureInitialized().unshift(item)
    },

    update(index: number, item: T): void {
      const all = ensureInitialized()
      if (index >= 0 && index < all.length) {
        all[index] = item
      }
    },

    remove(index: number): void {
      const all = ensureInitialized()
      if (index >= 0 && index < all.length) {
        all.splice(index, 1)
      }
    },

    reset(): void {
      items = []
      initialized = false
    },
  }
}
