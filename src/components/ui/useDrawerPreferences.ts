import * as React from "react"

type DrawerPreferencesState = {
  sizes: Record<string, number>
}

type Listener = () => void

const listeners = new Set<Listener>()
let store: DrawerPreferencesState | null = null

const notify = () => {
  for (const listener of listeners) {
    listener()
  }
}

const getStore = (): DrawerPreferencesState => {
  if (store === null) {
    store = { sizes: window.drawerPreferences.getAll() }
  }
  return store
}

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

const subscribe = (listener: Listener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => getStore()

export const useDrawerPreferences = () => {
  const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const persistSize = React.useCallback((id: string, size: number) => {
    if (!id) {
      return
    }

    updateStoreSize(id, size)
  }, [])

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
