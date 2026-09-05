/** Browser preference used only when creating a text view's presentation state. */
const key = 'dsh:file-viewer:default-line-numbers:v1'
const listeners = new Set<() => void>()
let current: boolean | undefined

/** Read the remembered default; unavailable storage starts with visible line numbers. */
export function defaultLineNumbers(): boolean {
  if (current !== undefined) return current
  try { current = window.localStorage.getItem(key) !== 'false' } catch {
    // Unavailable browser storage leaves the page-local default enabled.
    current = true
  }
  return current
}

/** Subscribe to default changes without changing existing view preferences. @param listener - UI invalidation callback. @returns Subscription disposer. */
export function subscribeLineNumberDefault(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Set the default for subsequently created views. @param enabled - Initial line-number visibility. */
export function setDefaultLineNumbers(enabled: boolean): void {
  current = enabled
  try { window.localStorage.setItem(key, String(enabled)) } catch {
    // Unavailable or full storage retains the preference for this page lifetime.
  }
  for (const listener of listeners) listener()
}
