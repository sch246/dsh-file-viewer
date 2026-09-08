/** Browser preference used only when creating an HTML view's presentation state. */
const key = 'dsh:html-preview:default-scripts:v1'
const listeners = new Set<() => void>()
let current: boolean | undefined

/** Read the remembered default; unavailable storage starts with script execution disabled. */
export function defaultScripts(): boolean {
  if (current !== undefined) return current
  try { current = window.localStorage.getItem(key) === 'true' } catch {
    // Unavailable browser storage leaves the page-local default disabled.
    current = false
  }
  return current
}

/** Subscribe to default changes without changing existing view preferences. @param listener - UI invalidation callback. @returns Subscription disposer. */
export function subscribeScriptDefault(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Set the default for subsequently created views. @param enabled - Initial script execution permission. */
export function setDefaultScripts(enabled: boolean): void {
  current = enabled
  try { window.localStorage.setItem(key, String(enabled)) } catch {
    // Unavailable or full storage retains the preference for this page lifetime.
  }
  for (const listener of listeners) listener()
}
