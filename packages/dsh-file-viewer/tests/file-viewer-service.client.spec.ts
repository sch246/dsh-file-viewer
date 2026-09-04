import { describe, expect, it } from 'vitest'
import {
  FileViewerService,
  FileViewerOpenError,
  FileViewerSourceId,
  isFileViewerDirty,
  type FileViewerDocumentRef,
  type FileViewerLoadedText,
  type FileViewerSavedText,
  type FileViewerSessionSnapshot,
  type FileViewerSource,
} from '../src/client/service.ts'

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, reject, resolve }
}

interface MemoryDocument {
  text: string
  title?: string
  version: object
}

class MemorySource implements FileViewerSource {
  readonly id: ReturnType<typeof FileViewerSourceId>
  readonly loadCalls: Array<{ readonly ref: FileViewerDocumentRef; readonly signal: AbortSignal }> = []
  readonly saveCalls: Array<{
    readonly ref: FileViewerDocumentRef
    readonly text: string
    readonly version: unknown
    readonly signal: AbortSignal
  }> = []
  readonly externalCalls: Array<{ readonly ref: FileViewerDocumentRef; readonly signal: AbortSignal }> = []
  private readonly documents = new Map<string, MemoryDocument>()
  private readonly queuedLoads: Array<Promise<FileViewerLoadedText>> = []
  private readonly queuedSaves: Array<Promise<void>> = []
  private readonly queuedExternalOpens: Array<Promise<void>> = []
  private revision = 0

  constructor(id: string) {
    this.id = FileViewerSourceId(id)
  }

  put(resourceId: string, text: string, title?: string): object {
    const version = this.nextVersion()
    this.documents.set(resourceId, { text, ...(title === undefined ? {} : { title }), version })
    return version
  }

  document(resourceId: string): MemoryDocument {
    const document = this.documents.get(resourceId)
    if (document === undefined) throw new Error(`missing memory document: ${resourceId}`)
    return document
  }

  enqueueLoad(result: Promise<FileViewerLoadedText>): void {
    this.queuedLoads.push(result)
  }

  enqueueSave(gate: Promise<void>): void {
    this.queuedSaves.push(gate)
  }

  enqueueExternalOpen(gate: Promise<void>): void {
    this.queuedExternalOpens.push(gate)
  }

  async load(ref: FileViewerDocumentRef, signal: AbortSignal): Promise<FileViewerLoadedText> {
    this.loadCalls.push({ ref, signal })
    signal.throwIfAborted()
    const queued = this.queuedLoads.shift()
    if (queued !== undefined) return queued
    const document = this.document(ref.resourceId)
    return {
      text: document.text,
      ...(document.title === undefined ? {} : { title: document.title }),
      version: document.version,
    }
  }

  async save(
    ref: FileViewerDocumentRef,
    text: string,
    version: unknown,
    signal: AbortSignal,
  ): Promise<FileViewerSavedText> {
    this.saveCalls.push({ ref, text, version, signal })
    signal.throwIfAborted()
    const gate = this.queuedSaves.shift()
    if (gate !== undefined) await gate
    const document = this.document(ref.resourceId)
    if (version !== document.version) throw new Error('stale memory version')
    const nextVersion = this.nextVersion()
    this.documents.set(ref.resourceId, { ...document, text, version: nextVersion })
    return { version: nextVersion }
  }

  async openExternal(ref: FileViewerDocumentRef, signal: AbortSignal): Promise<void> {
    this.externalCalls.push({ ref, signal })
    signal.throwIfAborted()
    const gate = this.queuedExternalOpens.shift()
    if (gate !== undefined) await gate
  }

  private nextVersion(): object {
    this.revision += 1
    return Object.freeze({ source: this.id, revision: this.revision })
  }
}

type SessionId = FileViewerDocumentRef['sessionId']

function sid(value: string): SessionId {
  return value as SessionId
}

function ref(sessionId: SessionId, source: FileViewerSource, resourceId: string): FileViewerDocumentRef {
  return { sessionId, sourceId: source.id, resourceId }
}

function ready(service: FileViewerService, sessionId: SessionId): Extract<FileViewerSessionSnapshot, { status: 'ready' }> {
  const snapshot = service.snapshot(sessionId)
  if (snapshot.status !== 'ready') throw new Error(`expected ready snapshot, received ${snapshot.status}`)
  return snapshot
}

describe('FileViewerService', () => {
  it('registers one source id and gives its registration an idempotent disposer', async () => {
    const service = new FileViewerService()
    const source = new MemorySource('memory')
    const replacement = new MemorySource('memory')
    source.put('one', 'first')
    replacement.put('one', 'replacement')
    const dispose = service.registerSource(source)

    expect(() => service.registerSource(replacement)).toThrow('duplicate source "memory"')
    await service.open(ref(sid('session'), source, 'one'))
    expect(ready(service, sid('session')).text).toBe('first')

    dispose()
    dispose()
    service.registerSource(replacement)
    await service.open(ref(sid('replacement-session'), replacement, 'one'))
    expect(ready(service, sid('replacement-session')).text).toBe('replacement')
  })

  it('isolates document state and notifications by Session', async () => {
    const service = new FileViewerService()
    const source = new MemorySource('memory')
    source.put('one', 'one')
    source.put('two', 'two')
    service.registerSource(source)
    const first = sid('first')
    const second = sid('second')
    let firstNotifications = 0
    let secondNotifications = 0
    const unsubscribeFirst = service.subscribe(first, () => { firstNotifications += 1 })
    service.subscribe(first, () => { throw new Error('subscriber failed') })
    service.subscribe(first, () => { firstNotifications += 1 })
    service.subscribe(second, () => { secondNotifications += 1 })

    await Promise.all([
      service.open(ref(first, source, 'one')),
      service.open(ref(second, source, 'two')),
    ])
    service.edit(first, 'first edit')
    unsubscribeFirst()
    service.edit(first, 'second edit')

    expect(ready(service, first).text).toBe('second edit')
    expect(ready(service, second).text).toBe('two')
    expect(firstNotifications).toBe(7)
    expect(secondNotifications).toBe(2)
  })

  it('lets the newest open win and does not report cancellation as a load failure', async () => {
    const service = new FileViewerService()
    const source = new MemorySource('memory')
    const olderResult = deferred<FileViewerLoadedText>()
    const newerResult = deferred<FileViewerLoadedText>()
    source.enqueueLoad(olderResult.promise)
    source.enqueueLoad(newerResult.promise)
    service.registerSource(source)
    const sessionId = sid('session')

    const older = service.open(ref(sessionId, source, 'older'))
    const olderSignal = source.loadCalls[0]!.signal
    const newer = service.open(ref(sessionId, source, 'newer'))
    expect(olderSignal.aborted).toBe(true)
    expect(olderSignal.reason).toEqual(new Error('superseded'))
    expect(service.snapshot(sessionId)).toMatchObject({ status: 'loading', ref: { resourceId: 'newer' } })

    const version = Object.freeze({ revision: 'newest' })
    newerResult.resolve({ text: 'newest text', title: 'Newest', version })
    await newer
    olderResult.resolve({ text: 'obsolete text', title: 'Obsolete' })
    await older
    expect(service.snapshot(sessionId)).toMatchObject({
      status: 'ready',
      title: 'Newest',
      text: 'newest text',
      baseline: 'newest text',
      version,
      saving: false,
    })
  })

  it('reports a current load rejection, including an abort-shaped source failure', async () => {
    const service = new FileViewerService()
    const source = new MemorySource('memory')
    service.registerSource(source)
    const sessionId = sid('session')
    source.enqueueLoad(Promise.reject(new DOMException('source aborted itself', 'AbortError')))

    await expect(service.open(ref(sessionId, source, 'one'))).rejects.toMatchObject({
      name: 'FileViewerOpenError',
      failure: { code: 'load-failed', message: 'source aborted itself' },
    })

    expect(service.snapshot(sessionId)).toEqual({
      status: 'failed',
      ref: ref(sessionId, source, 'one'),
      failure: { code: 'load-failed', message: 'source aborted itself' },
    })
    expect(source.loadCalls[0]!.signal.aborted).toBe(false)
  })

  it('fails an open whose source is unavailable', async () => {
    const service = new FileViewerService()
    const source = new MemorySource('missing')
    const sessionId = sid('session')

    await expect(service.open(ref(sessionId, source, 'one'))).rejects.toBeInstanceOf(FileViewerOpenError)

    expect(service.snapshot(sessionId)).toEqual({
      status: 'failed',
      ref: ref(sessionId, source, 'one'),
      failure: { code: 'source-unavailable' },
    })
  })

  it('derives dirty state only from editor text and the baseline', async () => {
    const service = new FileViewerService()
    const source = new MemorySource('memory')
    source.put('one', 'original')
    service.registerSource(source)
    const sessionId = sid('session')
    expect(isFileViewerDirty(service.snapshot(sessionId))).toBe(false)
    await service.open(ref(sessionId, source, 'one'))
    expect(isFileViewerDirty(ready(service, sessionId))).toBe(false)

    service.edit(sessionId, 'changed')
    expect(ready(service, sessionId)).toMatchObject({ text: 'changed', baseline: 'original' })
    expect(isFileViewerDirty(ready(service, sessionId))).toBe(true)
    service.edit(sessionId, 'original')
    expect(isFileViewerDirty(ready(service, sessionId))).toBe(false)
  })

  it('publishes a successful save as the new baseline and opaque version', async () => {
    const service = new FileViewerService()
    const source = new MemorySource('memory')
    const loadedVersion = source.put('one', 'original')
    service.registerSource(source)
    const sessionId = sid('session')
    await service.open(ref(sessionId, source, 'one'))
    service.edit(sessionId, 'saved')

    await service.save(sessionId)

    const snapshot = ready(service, sessionId)
    expect(source.saveCalls[0]).toMatchObject({ text: 'saved', version: loadedVersion })
    expect(snapshot).toMatchObject({ text: 'saved', baseline: 'saved', saving: false })
    expect(snapshot.version).toBe(source.document('one').version)
    expect(snapshot.version).not.toBe(loadedVersion)
    expect(isFileViewerDirty(snapshot)).toBe(false)
  })

  it('keeps edits made during save dirty against the text that actually saved', async () => {
    const service = new FileViewerService()
    const source = new MemorySource('memory')
    source.put('one', 'original')
    const saveGate = deferred<void>()
    source.enqueueSave(saveGate.promise)
    service.registerSource(source)
    const sessionId = sid('session')
    await service.open(ref(sessionId, source, 'one'))
    service.edit(sessionId, 'submitted')

    const save = service.save(sessionId)
    expect(ready(service, sessionId).saving).toBe(true)
    service.edit(sessionId, 'newer edit')
    saveGate.resolve(undefined)
    await save

    const snapshot = ready(service, sessionId)
    expect(source.document('one').text).toBe('submitted')
    expect(snapshot).toMatchObject({ text: 'newer edit', baseline: 'submitted', saving: false })
    expect(snapshot.version).toBe(source.document('one').version)
    expect(isFileViewerDirty(snapshot)).toBe(true)
  })

  it('retains the latest dirty text and baseline when save fails', async () => {
    const service = new FileViewerService()
    const source = new MemorySource('memory')
    const loadedVersion = source.put('one', 'original')
    const saveGate = deferred<void>()
    source.enqueueSave(saveGate.promise)
    service.registerSource(source)
    const sessionId = sid('session')
    await service.open(ref(sessionId, source, 'one'))
    service.edit(sessionId, 'submitted')

    const save = service.save(sessionId)
    service.edit(sessionId, 'newer edit')
    saveGate.reject(new Error('write refused'))
    await save

    const snapshot = ready(service, sessionId)
    expect(snapshot).toMatchObject({
      text: 'newer edit',
      baseline: 'original',
      version: loadedVersion,
      saving: false,
      failure: { code: 'save-failed', message: 'write refused' },
    })
    expect(source.document('one').text).toBe('original')
    expect(isFileViewerDirty(snapshot)).toBe(true)
  })

  it('reports save and external-open capabilities independently', async () => {
    const service = new FileViewerService()
    const memory = new MemorySource('readonly')
    memory.put('one', 'original')
    const readonlySource: FileViewerSource = {
      id: memory.id,
      load: (documentRef, signal) => memory.load(documentRef, signal),
    }
    service.registerSource(readonlySource)
    const sessionId = sid('session')
    await service.open(ref(sessionId, readonlySource, 'one'))
    service.edit(sessionId, 'dirty')

    await service.save(sessionId)
    expect(ready(service, sessionId)).toMatchObject({
      text: 'dirty',
      baseline: 'original',
      failure: { code: 'save-unsupported' },
    })
    await service.openExternal(sessionId)
    expect(ready(service, sessionId)).toMatchObject({ failure: { code: 'external-open-unsupported' } })
  })

  it('refuses a dirty refresh and reloads a clean document', async () => {
    const service = new FileViewerService()
    const source = new MemorySource('memory')
    source.put('one', 'original')
    service.registerSource(source)
    const sessionId = sid('session')
    await service.open(ref(sessionId, source, 'one'))
    service.edit(sessionId, 'dirty')

    await service.refresh(sessionId)
    expect(source.loadCalls).toHaveLength(1)
    expect(ready(service, sessionId)).toMatchObject({
      text: 'dirty',
      baseline: 'original',
      failure: { code: 'refresh-dirty' },
    })

    service.edit(sessionId, 'original')
    const refreshedVersion = source.put('one', 'from source', 'Refreshed')
    await service.refresh(sessionId)
    expect(source.loadCalls).toHaveLength(2)
    expect(ready(service, sessionId)).toMatchObject({
      title: 'Refreshed',
      text: 'from source',
      baseline: 'from source',
      version: refreshedVersion,
    })
  })

  it('source unload aborts every source operation, invalidates snapshots, and rejects late completions', async () => {
    const service = new FileViewerService()
    const source = new MemorySource('memory')
    source.put('save', 'original')
    source.put('external', 'external')
    const loadGate = deferred<FileViewerLoadedText>()
    const saveGate = deferred<void>()
    const externalGate = deferred<void>()
    const unregister = service.registerSource(source)
    const loadingSession = sid('loading')
    const saveSession = sid('saving')
    const externalSession = sid('external')
    await service.open(ref(saveSession, source, 'save'))
    await service.open(ref(externalSession, source, 'external'))
    source.enqueueLoad(loadGate.promise)
    source.enqueueSave(saveGate.promise)
    source.enqueueExternalOpen(externalGate.promise)
    const loading = service.open(ref(loadingSession, source, 'late'))
    service.edit(saveSession, 'submitted')
    const save = service.save(saveSession)
    const external = service.openExternal(externalSession)
    const loadSignal = source.loadCalls.find(call => call.ref.sessionId === loadingSession)!.signal
    const saveSignal = source.saveCalls[0]!.signal
    const externalSignal = source.externalCalls[0]!.signal

    unregister()
    for (const signal of [loadSignal, saveSignal, externalSignal]) {
      expect(signal.aborted).toBe(true)
      expect(signal.reason).toEqual(new Error('source unloaded'))
    }
    expect(service.snapshot(loadingSession)).toMatchObject({
      status: 'failed', ref: { resourceId: 'late' }, failure: { code: 'source-unavailable' },
    })
    expect(service.snapshot(saveSession)).toMatchObject({
      status: 'failed', ref: { resourceId: 'save' }, failure: { code: 'source-unavailable' },
    })
    expect(service.snapshot(externalSession)).toMatchObject({
      status: 'failed', ref: { resourceId: 'external' }, failure: { code: 'source-unavailable' },
    })
    loadGate.resolve({ text: 'too late' })
    saveGate.resolve(undefined)
    externalGate.reject(new Error('too late'))
    await Promise.all([loading, save, external])
    expect(service.snapshot(loadingSession)).toMatchObject({ status: 'failed', failure: { code: 'source-unavailable' } })
    expect(service.snapshot(saveSession)).toMatchObject({ status: 'failed', failure: { code: 'source-unavailable' } })
    expect(service.snapshot(externalSession)).toMatchObject({ status: 'failed', failure: { code: 'source-unavailable' } })
  })

  it('opens externally, preserves edits on failure, and clears the failure on retry', async () => {
    const service = new FileViewerService()
    const source = new MemorySource('memory')
    source.put('one', 'original')
    const failedOpen = deferred<void>()
    source.enqueueExternalOpen(failedOpen.promise)
    service.registerSource(source)
    const sessionId = sid('session')
    await service.open(ref(sessionId, source, 'one'))

    const opening = service.openExternal(sessionId)
    service.edit(sessionId, 'edited while opening')
    failedOpen.reject(new Error('launcher refused'))
    await opening
    expect(ready(service, sessionId)).toMatchObject({
      text: 'edited while opening',
      failure: { code: 'external-open-failed', message: 'launcher refused' },
    })
    await service.openExternal(sessionId)
    expect(source.externalCalls).toHaveLength(2)
    expect(ready(service, sessionId).failure).toBeUndefined()
  })

  it('disposal aborts document and external operations, silences listeners, and invalidates the API', async () => {
    const service = new FileViewerService()
    const source = new MemorySource('memory')
    source.put('ready', 'ready')
    const loadGate = deferred<FileViewerLoadedText>()
    const externalGate = deferred<void>()
    source.enqueueLoad(loadGate.promise)
    source.enqueueExternalOpen(externalGate.promise)
    const unregister = service.registerSource(source)
    const loadingSession = sid('loading')
    const externalSession = sid('external')
    let notifications = 0
    service.subscribe(loadingSession, () => { notifications += 1 })
    const loading = service.open(ref(loadingSession, source, 'late'))
    await service.open(ref(externalSession, source, 'ready'))
    const external = service.openExternal(externalSession)
    const loadSignal = source.loadCalls.find(call => call.ref.sessionId === loadingSession)!.signal
    const externalSignal = source.externalCalls[0]!.signal

    service.dispose()
    service.dispose()
    unregister()
    expect(loadSignal.aborted).toBe(true)
    expect(loadSignal.reason).toEqual(new Error('file viewer disposed'))
    expect(externalSignal.aborted).toBe(true)
    expect(externalSignal.reason).toEqual(new Error('file viewer disposed'))
    loadGate.resolve({ text: 'too late' })
    externalGate.reject(new Error('too late'))
    await Promise.all([loading, external])
    expect(notifications).toBe(1)

    expect(() => service.snapshot(loadingSession)).toThrow('service is disposed')
    expect(() => service.subscribe(loadingSession, () => undefined)).toThrow('service is disposed')
    expect(() => service.edit(loadingSession, 'ignored')).toThrow('service is disposed')
    expect(() => service.registerSource(new MemorySource('after-dispose'))).toThrow('service is disposed')
    await expect(service.open(ref(loadingSession, source, 'again'))).rejects.toThrow('service is disposed')
    await expect(service.save(loadingSession)).rejects.toThrow('service is disposed')
    await expect(service.refresh(loadingSession)).rejects.toThrow('service is disposed')
    await expect(service.openExternal(loadingSession)).rejects.toThrow('service is disposed')
  })

  it('rejects an empty source id and uses the resource id as the default title', async () => {
    expect(() => FileViewerSourceId('   ')).toThrow('source id must not be empty')
    const service = new FileViewerService()
    const source = new MemorySource('memory')
    source.put('plain.txt', 'text')
    service.registerSource(source)
    const sessionId = sid('session')

    await service.open(ref(sessionId, source, 'plain.txt'))

    expect(ready(service, sessionId).title).toBe('plain.txt')
  })
})
