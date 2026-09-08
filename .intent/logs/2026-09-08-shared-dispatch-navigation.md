# Shared-dispatch links and in-place navigation

The user asked for one navigation behavior across session links, the path bar, the file manager, Markdown links and group Back/Forward. The viewer's share is that every file destination now enters the common Host opening entry, and that the viewer moves its own tab instead of patching focus.

`ResourceWorkbenchClientService` gained `navigateTo(viewId, target)` for one in-place destination, `openWorkspaceLink(viewId, href)` for document links, and `linkBasePath(viewId)`. `navigateLink` and `navigateTo` share one private navigation path that resolves either a source hyperlink or an already resolved descriptor, keeps the existing guard, cancellation and generation checks, and reports one commit. History replay passes a descriptor and suppresses the commit; the sidebar's cursor move is the only state change then.

Markdown preview no longer calls `navigateLink` directly; it calls `openWorkspaceLink`, which resolves the href through the source and then calls the shared Host opening entry with `replace: 'current'` and the current view id. The waterfall handler moves that tab when it still exists and falls back to a normal open otherwise. A directory resolves through the same entry and reaches the manager instead of failing as a text load, and the filesystem source's breadcrumb opening now uses the same entry, so a path-bar directory opens in the manager's group rather than replacing the editor tab.

The viewer reports a reached destination through the sidebar's single commit call, which applies descriptor, title and history together. The removed code is the `ResourceWorkbenchPanel` wrapper that focused the workbench root around `navigateLink`; the group owns that handoff now.

Verification: `DSH_CHECKOUT=/root/deepseek-harness bash scripts/typecheck-host.sh` and `bash scripts/build-host.sh` pass. The viewer suite fails the same 38 pre-existing tests as its unmodified baseline, plus three assertions updated for the new call signatures (`browser-plugin`, `resource-location`, `resource-workbench-sidebar-integration`); after those updates the failure set matches the baseline exactly. No browser automation was run.
