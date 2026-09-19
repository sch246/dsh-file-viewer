/** Consumer-owned sidebar operations; the provider owns layout, history and occurrence lifetimes. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ResourceOpenTarget, ResourceTextPosition } from './resource.ts'

/** One provider-owned request shared by source resolution and the reached destination. */
export interface ResourceNavigation {
  readonly signal: AbortSignal
  /** @returns Whether this request still owns its Session and destination group. */
  current(): boolean
  /** @param id Resolved view identity. @returns False when a newer request owns its group. */
  claim(id: string): boolean
  /**
   * Commit prepared view state and one group destination synchronously, or do neither.
   * Replay updates the existing history cursor without appending a destination.
   * @param id Existing view identity.
   * @param destination JSON-safe checkpoint and optional presentation changes.
   * @param apply Prepared state publication, called only for a current request.
   * @returns Whether the destination committed.
   */
  commit(id: string, destination: {
    readonly descriptor: unknown
    readonly title?: string
    readonly resourceMissing?: boolean
    readonly pin?: boolean
  }, apply?: () => void): boolean
}

/** Origin, placement and cancellation supplied before asynchronous source work. */
export interface ResourceNavigationOptions {
  /** Reusing this identity across the opening waterfall reuses its transaction. */
  readonly request?: object
  readonly sourceInstanceId?: string
  readonly target?: ResourceOpenTarget
  readonly signal?: AbortSignal
}

/** Callbacks retained by the provider for one exact view occurrence. */
export interface ResourceViewLifecycle {
  /** False or rejection retains the view; the provider rechecks occurrence identity after awaiting. */
  readonly onClose?: () => boolean | Promise<boolean>
  /** Runs only after committed removal, never on confirmation, body unmount or Session switch. */
  readonly onClosed?: () => void
  /** Restore a destination under the provider's history transaction. */
  readonly onNavigate?: (descriptor: unknown, navigation: ResourceNavigation) => boolean | Promise<boolean>
}

/** Feature identity passed to bodies independently of a provider's slot declarations. */
export interface ResourceViewOwnerProps { readonly instanceId: string }

/** Required operations for resource views; implementations expose no layout writers or snapshots. */
export interface ResourceViewHost {
  /**
   * @param sessionId Owning Session.
   * @param input Stable view identity, checkpoint and occurrence callbacks.
   * @param options Placement and preview policy under one navigation transaction.
   * @returns Destination group after commit; failure, veto or supersession rejects without opening another view.
   */
  open(sessionId: SessionId, input: ResourceViewLifecycle & {
    readonly id: string
    readonly viewId: string
    readonly title: string
    readonly resourceMissing?: boolean
    readonly restoreDescriptor?: unknown
  }, options?: {
    readonly target?: ResourceOpenTarget
    readonly preview?: boolean
    readonly navigation?: ResourceNavigation
  }): Promise<string>
  /** @param request Source-resolved link and in-place intent. @returns Completion of the common opening waterfall. */
  openWorkspaceFile(request: {
    readonly sessionId: SessionId
    readonly path: string
    readonly viewId: string
    readonly replace: 'current'
    readonly sourceInstanceId?: string
    readonly signal?: AbortSignal
    readonly textSelection?: ResourceTextPosition
  }): Promise<void>
  /** @param sessionId Owning Session. @param options Origin and cancellation. @returns Transaction invalidated by newer navigation or occurrence disposal. */
  beginNavigation(sessionId: SessionId, options?: ResourceNavigationOptions): ResourceNavigation
  /** @param sessionId Owning Session. @param viewId Existing view. @param update Checkpoint and presentation changes; adds no history and changes no focus. */
  update(sessionId: SessionId, viewId: string, update: {
    readonly title?: string
    readonly resourceMissing?: boolean
    readonly restoreDescriptor?: unknown
  }): void
  /** @param sessionId Owning Session. @param viewId Preview permanently exempted from replacement. */
  pin(sessionId: SessionId, viewId: string): void
  /** @param sessionId Owning Session. @param viewId Existing view. @returns Actual containing group; rejects missing views. */
  group(sessionId: SessionId, viewId: string): string
  /** @param sessionId Owning Session. @param target Explicit or relative placement. @returns Existing target group without changing layout, or undefined when a split is needed. */
  resolveTarget(sessionId: SessionId, target: ResourceOpenTarget): string | undefined
  /** @param sessionId Owning Session. @param selectorId Feature entry. @param selection Source-owned selection. @returns Completion of opening that feature. */
  launch(sessionId: SessionId, selectorId: string, selection?: unknown): Promise<void>
  /**
   * @param viewId Static renderer identity.
   * @param restore Reconnect a persisted view before mounting its body; failures remain visible and retryable.
   * @returns Effect-scoped registration disposer.
   */
  registerRestorer(viewId: string, restore: (context: {
    readonly sessionId: SessionId
    readonly instanceId: string
    readonly descriptor: unknown
  }) => void | ResourceViewRestored | Promise<void | ResourceViewRestored>): () => void
  /** @param sessionId Owning Session. @param viewId Existing view. @returns Completion after asynchronous guards and committed removal, veto or supersession. */
  close(sessionId: SessionId, viewId: string): Promise<void>
}

/** Restored occurrence callbacks; readiness precedes publication of restoration-dependent metadata. */
export interface ResourceViewRestored extends ResourceViewLifecycle {
  readonly onRestored?: () => void
}
