/** Line-aligned changes derived from the maintained CodeMirror diff implementation. */
import { diff } from '@codemirror/merge'

/** One original-coordinate range; oldText includes its exact canonical line terminators. */
export interface TextLineChange {
  readonly startLine: number
  readonly lineCount: number
  readonly oldText: string
  readonly replacement: string
}

function boundaries(text: string): number[] {
  const result = [0]
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) result.push(index + 1)
  if (result.at(-1) !== text.length) result.push(text.length)
  return result
}

function lowerBound(values: readonly number[], value: number): number {
  let low = 0, high = values.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (values[middle]! < value) low = middle + 1
    else high = middle
  }
  return low
}

/** @param base Exact canonical Base. @param local Captured Local. @returns Disjoint original line ranges, including neighboring content for nonempty-file insertions. */
export function diffTextLines(base: string, local: string): readonly TextLineChange[] {
  const offsets = boundaries(base)
  const spans: { start: number; end: number; fromB: number; toB: number }[] = []
  for (const change of diff(base, local)) {
    const at = lowerBound(offsets, change.fromA)
    let start = offsets[at] === change.fromA ? at : at - 1
    let end = lowerBound(offsets, change.toA)
    if (start === end && base.length !== 0) {
      if (start < offsets.length - 1) end++
      else start--
    }
    const fromB = change.fromB - (change.fromA - offsets[start]!)
    const toB = change.toB + (offsets[end]! - change.toA)
    const previous = spans.at(-1)
    if (previous !== undefined && start <= previous.end) {
      previous.end = Math.max(previous.end, end)
      previous.toB = Math.max(previous.toB, toB)
    } else spans.push({ start, end, fromB, toB })
  }
  return spans.map(span => ({ startLine: span.start, lineCount: span.end - span.start,
    oldText: base.slice(offsets[span.start], offsets[span.end]), replacement: local.slice(span.fromB, span.toB) }))
}
