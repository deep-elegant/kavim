export function openExternal(url: string) {
  try {
    const { shell } = window.require("electron");
    shell.openExternal(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
