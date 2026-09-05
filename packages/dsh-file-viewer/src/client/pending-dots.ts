/** Presentation-only pending punctuation; document operation controllers own activity. */
import { useEffect, useState } from 'react'

/**
 * Animate only the suffix of an actual pending operation, respecting live motion preferences.
 * @param pending Whether the document reports this operation in progress.
 * @returns Zero to three dots; callers reserve their width and hide them from accessibility names.
 */
export function usePendingDots(pending: boolean): string {
  const [dots, setDots] = useState(0)
  useEffect(() => {
    setDots(0)
    if (!pending) return
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let timer: ReturnType<typeof setInterval> | undefined
    const update = () => {
      clearInterval(timer)
      setDots(0)
      if (!preference?.matches) timer = setInterval(() => { setDots(value => (value + 1) % 4) }, 400)
    }
    update()
    preference?.addEventListener('change', update)
    return () => {
      clearInterval(timer)
      preference?.removeEventListener('change', update)
    }
  }, [pending])
  return pending ? '.'.repeat(dots) : ''
}
