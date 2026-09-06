/** Runtime synchronization age with visibility-aware display scheduling. */
import { useEffect, useState } from 'react'
import type { FileViewerLocaleKey } from './locales.ts'

type Translate = (key: FileViewerLocaleKey) => string

/** @param elapsedMs Time since an actual synchronization. @param t Locale dictionary. @returns Floored human elapsed time without replacing the synchronization relationship. */
export function formatSyncAge(elapsedMs: number, t: Translate): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000))
  if (seconds === 0) return t('syncedJustNow')
  if (seconds < 60) return t('syncedSecondsAgo').replace('{seconds}', String(seconds))
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('syncedMinutesAgo').replace('{minutes}', String(minutes))
  if (minutes < 1440) return t('syncedHoursAgo').replace('{hours}', String(Math.floor(minutes / 60))).replace('{minutes}', String(minutes % 60))
  return t('syncedDaysAgo').replace('{days}', String(Math.floor(minutes / 1440)))
}

/** @param lastSyncedAt Runtime-only synchronization instant. @param enabled Whether this view displays elapsed time. @param t Locale dictionary. @returns Current localized elapsed label, absent when disabled or unknown. */
export function useSyncAge(lastSyncedAt: number | undefined, enabled: boolean, t: Translate): string | undefined {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!enabled || lastSyncedAt === undefined) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      clearTimeout(timer)
      if (document.hidden) return
      const current = Date.now()
      setNow(current)
      const elapsed = Math.max(0, current - lastSyncedAt)
      const unit = elapsed < 60_000 ? 1000 : elapsed < 86_400_000 ? 60_000 : 86_400_000
      timer = setTimeout(update, unit - elapsed % unit)
    }
    update()
    document.addEventListener('visibilitychange', update)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', update) }
  }, [lastSyncedAt, enabled])
  return enabled && lastSyncedAt !== undefined ? formatSyncAge(now - lastSyncedAt, t) : undefined
}
