/** UTF-16 transaction coordinates in the preceding document. */
export interface TextChange { readonly from: number; readonly to: number; readonly insert: string }

/** Canonical UTF-8 block sizing; a final short block is permitted. */
export interface TextBlockPolicy { readonly minBytes: number; readonly targetBytes: number; readonly maxBytes: number }

/** Default block sizes in canonical UTF-8 bytes. */
export const defaultTextBlockPolicy: TextBlockPolicy = Object.freeze({ minBytes: 512 * 1024, targetBytes: 1024 * 1024, maxBytes: 2 * 1024 * 1024 })
let identity = 0
const hashes = new WeakMap<TextBlock, Promise<string>>()

/** Stable canonical text and byte count; hash completion never replaces the block. */
export class TextBlock {
  readonly id = ++identity
  readonly byteLength: number
  hash: string | undefined
  constructor(readonly text: string, hash?: string) {
    this.byteLength = new TextEncoder().encode(text).length
    this.hash = hash
  }
  /** @param hashText Canonical SHA-256 implementation. @returns Memoized hash of this block alone. */
  digest(hashText: (text: string) => Promise<string>): Promise<string> {
    if (this.hash !== undefined) return Promise.resolve(this.hash)
    let work = hashes.get(this)
    if (work === undefined) {
      work = hashText(this.text).then(hash => { this.hash = hash; return hash }, error => { hashes.delete(this); throw error })
      hashes.set(this, work)
    }
    return work
  }
}

/** @param text Canonical text. @param policy Validated byte targets. @returns Blocks split only between Unicode code points. */
export function splitTextBlocks(text: string, policy: TextBlockPolicy = defaultTextBlockPolicy): TextBlock[] {
  const blocks: TextBlock[] = []
  let start = 0, bytes = 0
  for (let offset = 0; offset < text.length;) {
    const code = text.codePointAt(offset)!
    const width = code > 0xffff ? 2 : 1
    const size = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
    if (bytes + size > policy.targetBytes && offset > start) {
      blocks.push(new TextBlock(text.slice(start, offset)))
      start = offset; bytes = 0
    }
    bytes += size; offset += width
  }
  if (start < text.length) blocks.push(new TextBlock(text.slice(start)))
  const tail = blocks.at(-1), previous = blocks.at(-2)
  if (tail !== undefined && previous !== undefined && tail.byteLength < policy.minBytes
    && previous.byteLength + tail.byteLength <= policy.maxBytes) {
    blocks.splice(-2, 2, new TextBlock(previous.text + tail.text))
  }
  return blocks
}

/** Immutable shared text; untouched blocks survive offset shifts and local rebalancing. */
export class TextDocumentSnapshot {
  readonly id = ++identity
  readonly length: number
  readonly byteLength: number
  readonly blocks: readonly TextBlock[]
  #text: string | undefined
  // Weak ancestry lets live views catch up without retaining every historical document.
  readonly #previous: WeakRef<TextDocumentSnapshot> | undefined
  readonly #changes: readonly TextChange[] | undefined
  constructor(blocks: readonly TextBlock[], readonly policy: TextBlockPolicy = defaultTextBlockPolicy,
    previous?: TextDocumentSnapshot, changes?: readonly TextChange[]) {
    this.blocks = Object.freeze([...blocks])
    this.length = blocks.reduce((sum, block) => sum + block.text.length, 0)
    this.byteLength = blocks.reduce((sum, block) => sum + block.byteLength, 0)
    this.#previous = previous === undefined ? undefined : new WeakRef(previous)
    this.#changes = changes
  }
  /** @param text Complete canonical text at a full-text API. @param policy Byte targets. @returns Shared block document. */
  static fromText(text: string, policy: TextBlockPolicy = defaultTextBlockPolicy): TextDocumentSnapshot {
    const value = new TextDocumentSnapshot(splitTextBlocks(text, policy), policy)
    value.#text = text
    return value
  }
  /** @param blocks Decoded canonical transfer blocks. @param policy Byte targets. @returns Shared blocks with short interior fragments merged locally. */
  static fromBlocks(blocks: readonly TextBlock[], policy: TextBlockPolicy = defaultTextBlockPolicy): TextDocumentSnapshot {
    const normalized: TextBlock[] = []
    for (const block of blocks) {
      if (block.text === '') continue
      const previous = normalized.at(-1)
      if (previous !== undefined && previous.byteLength < policy.minBytes && previous.byteLength + block.byteLength <= policy.maxBytes) {
        normalized[normalized.length - 1] = new TextBlock(previous.text + block.text)
      } else normalized.push(block)
    }
    return new TextDocumentSnapshot(normalized, policy)
  }
  /** @returns Complete text for explicit full-text operations; typing never calls this method. */
  toString(): string { return this.#text ??= this.blocks.map(block => block.text).join('') }
  /** @param previous A view's last applied document. @returns Sequential transaction batches, using stable block anchors if ancestry is released. */
  updatesSince(previous: TextDocumentSnapshot): readonly (readonly TextChange[])[] {
    const updates: (readonly TextChange[])[] = []
    let value: TextDocumentSnapshot | undefined = this
    while (value !== previous) {
      if (value === undefined || value.#changes === undefined) return [this.changesFrom(previous)]
      updates.unshift(value.#changes)
      value = value.#previous?.deref()
    }
    return updates
  }
  /** @param previous Previous view or save baseline. @returns Changed gaps between shared blocks in original UTF-16 coordinates. */
  changesFrom(previous: TextDocumentSnapshot): readonly TextChange[] {
    const positions = new Map<TextBlock, { index: number; offset: number }>()
    let offset = 0
    previous.blocks.forEach((block, index) => { positions.set(block, { index, offset }); offset += block.text.length })
    const changes: TextChange[] = []
    let from = 0, oldIndex = 0
    let inserted: string[] = []
    for (const block of this.blocks) {
      const anchor = positions.get(block)
      if (anchor === undefined || anchor.index < oldIndex) { inserted.push(block.text); continue }
      if (from !== anchor.offset || inserted.length > 0) changes.push({ from, to: anchor.offset, insert: inserted.join('') })
      inserted = []; from = anchor.offset + block.text.length; oldIndex = anchor.index + 1
    }
    if (from !== previous.length || inserted.length > 0) changes.push({ from, to: previous.length, insert: inserted.join('') })
    return changes
  }
  /** @param changes Ordered disjoint original-document ranges. @returns New snapshot retaining every untouched block. */
  edit(changes: readonly TextChange[]): TextDocumentSnapshot {
    if (changes.length === 0) return this
    let blocks = [...this.blocks]
    let previousFrom = this.length + 1
    for (let n = changes.length - 1; n >= 0; n--) {
      const change = changes[n]!
      if (!Number.isSafeInteger(change.from) || !Number.isSafeInteger(change.to) || change.from < 0 || change.to < change.from
        || change.to > this.length || change.to > previousFrom) throw new RangeError('file-viewer: invalid text edit ranges')
      previousFrom = change.from
      let start = 0, left = 0
      while (left < blocks.length && start + blocks[left]!.text.length < change.from) start += blocks[left++]!.text.length
      let right = left, end = start
      while (right < blocks.length && end + blocks[right]!.text.length < change.to) end += blocks[right++]!.text.length
      const prefix = blocks[left]?.text.slice(0, change.from - start) ?? ''
      const suffix = blocks[right]?.text.slice(change.to - end) ?? ''
      let replacement = prefix + change.insert + suffix
      let count = right < blocks.length ? right - left + 1 : right - left
      let byteLength = new TextEncoder().encode(replacement).length
      if (byteLength < this.policy.minBytes) {
        const neighbor = blocks[left + count]
        if (neighbor !== undefined && byteLength + neighbor.byteLength <= this.policy.maxBytes) { replacement += neighbor.text; count++; byteLength += neighbor.byteLength }
        else if (left > 0 && byteLength + blocks[left - 1]!.byteLength <= this.policy.maxBytes) {
          const neighbor = blocks[--left]!
          replacement = neighbor.text + replacement; count++; byteLength += neighbor.byteLength
        }
      }
      const inserted = replacement === '' ? [] : byteLength <= this.policy.maxBytes
        ? [new TextBlock(replacement)] : splitTextBlocks(replacement, this.policy)
      blocks.splice(left, count, ...inserted)
    }
    return new TextDocumentSnapshot(blocks, this.policy, this, changes)
  }
  /** @param hashText Canonical block SHA-256. @returns After all currently dirty blocks have hashes. */
  async check(hashText: (text: string) => Promise<string>): Promise<void> {
    for (const block of this.blocks) await block.digest(hashText)
  }
  /** @param other Exact canonical document, with arbitrary partitioning. @returns Content equality without joining or encoding either document. */
  equals(other: TextDocumentSnapshot): boolean {
    if (this === other) return true
    if (this.length !== other.length || this.byteLength !== other.byteLength) return false
    let left = 0, right = 0, a = 0, b = 0
    while (left < this.blocks.length && right < other.blocks.length) {
      const x = this.blocks[left]!, y = other.blocks[right]!
      const length = Math.min(x.text.length - a, y.text.length - b)
      if (!(a === 0 && b === 0 && x.text.length === y.text.length && (x === y || (x.hash !== undefined && x.hash === y.hash)))
        && x.text.slice(a, a + length) !== y.text.slice(b, b + length)) return false
      a += length; b += length
      if (a === x.text.length) { left++; a = 0 }
      if (b === y.text.length) { right++; b = 0 }
    }
    return true
  }
}
