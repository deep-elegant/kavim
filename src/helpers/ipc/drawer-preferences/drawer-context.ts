import { contextBridge } from "electron"
import Store from "electron-store"

type DrawerPreferencesStore = Record<string, number>

const drawerPreferencesStore = new Store<DrawerPreferencesStore>({
  name: "drawer-preferences",
  defaults: {},
})

export function exposeDrawerPreferencesContext() {
  contextBridge.exposeInMainWorld("drawerPreferences", {
    getSize: (id: string) => drawerPreferencesStore.get(id),
    setSize: (id: string, size: number) => {
      drawerPreferencesStore.set(id, size)
    },
    deleteSize: (id: string) => {
      drawerPreferencesStore.delete(id)
    },
    getAll: () => ({ ...drawerPreferencesStore.store }),
  })
}
