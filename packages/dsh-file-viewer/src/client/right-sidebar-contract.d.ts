declare module '@dsh-external/dsh-right-sidebar/client' {
  import type { SessionId } from '@deepseek-ai/dsh-session/types'
  export interface RightSidebarService { openTab(sessionId: SessionId, tabId: string): void }
  declare module '@deepseek-ai/cordis' { interface Context { rightSidebar: RightSidebarService } }
}
