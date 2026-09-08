/** Browser preference used only when creating a Markdown view's presentation state. */
const key = 'dsh:markdown-preview:default-html:v1'
const listeners = new Set<() => void>()
let current: boolean | undefined

/** Read the remembered default; unavailable storage starts with HTML rendering enabled. */
export function defaultHtml(): boolean {
  if (current !== undefined) return current
  try { current = window.localStorage.getItem(key) !== 'false' } catch {
    // Unavailable browser storage leaves the page-local default enabled.
    current = true
  }
  return current
}

/** Subscribe to default changes without changing existing view preferences. @param listener - UI invalidation callback. @returns Subscription disposer. */
export function subscribeHtmlDefault(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Set the default for subsequently created views. @param enabled - Initial HTML rendering visibility. */
export function setDefaultHtml(enabled: boolean): void {
  current = enabled
  try { window.localStorage.setItem(key, String(enabled)) } catch {
    // Unavailable or full storage retains the preference for this page lifetime.
  }
  for (const listener of listeners) listener()
}
