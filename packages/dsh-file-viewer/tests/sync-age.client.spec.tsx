// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { formatSyncAge, useSyncAge } from '../src/client/sync-age.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })

it('formats seconds, minutes, hours with minutes and floored days in both locales', () => {
  const t = (key: keyof typeof zh) => zh[key]
  expect(formatSyncAge(10_000, t)).toBe('同步于10秒前')
  expect(formatSyncAge(61_000, t)).toBe('同步于1分钟前')
  expect(formatSyncAge((2 * 60 + 26) * 60_000, t)).toBe('同步于2小时26分前')
  expect(formatSyncAge(36 * 60 * 60_000, t)).toBe('同步于1天前')
  expect(formatSyncAge(10_000, key => en[key])).toBe('Synced 10s ago')
})

it('updates visible age and releases timers when disabled or unmounted', async () => {
  vi.useFakeTimers(); vi.setSystemTime(10_000)
  function Age({ enabled }: { enabled: boolean }) { return <span>{useSyncAge(0, enabled, key => en[key])}</span> }
  const view = render(<Age enabled />)
  expect(screen.getByText('Synced 10s ago')).toBeTruthy()
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(screen.getByText('Synced 11s ago')).toBeTruthy()
  view.rerender(<Age enabled={false} />)
  expect(vi.getTimerCount()).toBe(0)
  view.rerender(<Age enabled />)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
