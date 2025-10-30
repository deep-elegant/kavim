import * as React from "react"

type DrawerPreferencesState = {
  sizes: Record<string, number>
}

type Listener = () => void

// A set of listeners to be notified of store changes.
const listeners = new Set<Listener>()
// The in-memory cache of the drawer preferences.
let store: DrawerPreferencesState | null = null

// Notifies all registered listeners of a change in the store.
const notify = () => {
  for (const listener of listeners) {
    listener()
  }
}

// Retrieves the store, initializing it from `window.drawerPreferences` if necessary.
const getStore = (): DrawerPreferencesState => {
  if (store === null) {
    store = { sizes: window.drawerPreferences.getAll() }
  }
  return store
}

// Updates the size of a drawer in the store and persists it to `window.drawerPreferences`.
const updateStoreSize = (id: string, size: number) => {
  const currentStore = getStore()

  if (currentStore.sizes[id] === size) {
    return
  }

  store = {
    sizes: {
      ...currentStore.sizes,
      [id]: size,
    },
  }

  window.drawerPreferences.setSize(id, size)
  notify()
}

// Removes a drawer's size from the store and `window.drawerPreferences`.
const removeStoreSize = (id: string) => {
  const currentStore = getStore()

  if (!(id in currentStore.sizes)) {
    return
  }

  const updatedSizes = { ...currentStore.sizes }
  delete updatedSizes[id]
  store = { sizes: updatedSizes }

  window.drawerPreferences.deleteSize(id)
  notify()
}

// Subscribes a listener to the store and returns an unsubscribe function.
const subscribe = (listener: Listener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Returns a snapshot of the current store state.
const getSnapshot = () => getStore()

/**
 * A hook to manage drawer preferences, specifically the persisted sizes of drawers.
 * It uses `useSyncExternalStore` to subscribe to an external store provided by `window.drawerPreferences`.
 * This allows the drawer sizes to be persisted across sessions.
 * @returns An object with the current sizes, a function to set a size, and a function to delete a size.
 */
export const useDrawerPreferences = () => {
  // `useSyncExternalStore` is used to subscribe to the external store and get the current state.
  const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // A memoized function to persist the size of a drawer.
  const persistSize = React.useCallback((id: string, size: number) => {
    if (!id) {
      return
    }

    updateStoreSize(id, size)
  }, [])

  // A memoized function to delete the size of a drawer.
  const deleteSize = React.useCallback((id: string) => {
    if (!id) {
      return
    }

    removeStoreSize(id)
  }, [])

  return {
    sizes: state.sizes,
    setSize: persistSize,
    deleteSize,
  }
}
