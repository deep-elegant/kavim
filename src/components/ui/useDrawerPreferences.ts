import * as React from "react"

type DrawerPreferencesState = {
  sizes: Record<string, number>
}

type Listener = () => void

const listeners = new Set<Listener>()
let store: DrawerPreferencesState = { sizes: {} }
let hydrated = false

const getDrawerPreferencesApi = () => {
  if (typeof window === "undefined") {
    return undefined
  }

  if (!window.drawerPreferences) {
    return undefined
  }

  return window.drawerPreferences
}

const notify = () => {
  for (const listener of listeners) {
    listener()
  }
}

const updateStoreSize = (id: string, size: number) => {
  if (store.sizes[id] === size) {
    return
  }

  store = {
    sizes: {
      ...store.sizes,
      [id]: size,
    },
  }

  const api = getDrawerPreferencesApi()
  api?.setSize(id, size)
  notify()
}

const removeStoreSize = (id: string) => {
  if (!(id in store.sizes)) {
    return
  }

  const updatedSizes = { ...store.sizes }
  delete updatedSizes[id]
  store = { sizes: updatedSizes }

  const api = getDrawerPreferencesApi()
  api?.deleteSize(id)
  notify()
}

const subscribe = (listener: Listener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => store

const hydrate = () => {
  if (hydrated) {
    return
  }

  const api = getDrawerPreferencesApi()
  if (!api) {
    return
  }

  hydrated = true
  const storedSizes = api.getAll()
  store = { sizes: { ...storedSizes } }
}

export const useDrawerPreferences = () => {
  hydrate()
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
