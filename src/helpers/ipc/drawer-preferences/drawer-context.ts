import { contextBridge } from "electron"
import Store from "electron-store"

type DrawerPreferencesStore = Record<string, number>

// Create a new electron-store instance for drawer preferences.
const drawerPreferencesStore = new Store<DrawerPreferencesStore>({
  name: "drawer-preferences",
  defaults: {},
})

/**
 * Exposes the drawer preferences store to the renderer process via the context bridge.
 * This allows the renderer process to get, set, and delete drawer sizes.
 */
export function exposeDrawerPreferencesContext() {
  contextBridge.exposeInMainWorld("drawerPreferences", {
    // Get the size of a drawer by its ID.
    getSize: (id: string) => drawerPreferencesStore.get(id),
    // Set the size of a drawer by its ID.
    setSize: (id: string, size: number) => {
      drawerPreferencesStore.set(id, size)
    },
    // Delete the size of a drawer by its ID.
    deleteSize: (id: string) => {
      drawerPreferencesStore.delete(id)
    },
    // Get all drawer sizes.
    getAll: () => ({ ...drawerPreferencesStore.store }),
  })
}
