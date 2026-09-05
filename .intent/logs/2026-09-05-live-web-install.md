# File viewer live Web installation

Date: 2026-09-05

## Target

- Harness checkout: `/root/deepseek-harness` at `0a53fb55bea101816fa226bb964ae2bed71c343b` with pre-existing local changes.
- Profile: `/root/.dsh/profiles/web`.
- Service: `dsh-web.service`, loopback port 3082.

## Ownership

The Chat workspace-file waterfall and its documentation were applied from `patches/deepseek-harness.patch`. Typert external-project-reference support already belonged to the installed skill-manager contribution, so that directory was excluded from this deployment and remains externally owned. The Git-private receipt records the split; automatic uninstall must preserve the shared Typert source.

## Runtime correction

The first live browser check found a mounted but empty right sidebar. Instrumentation showed that runtime registration stopped while reading `ctx.remote.session`. The Client runtime dependency list omitted `remote.session`, and the optional native-opener probe also gated all subsequent registration. The source now declares that namespace and probes it asynchronously; unavailable native opening degrades only the toolbar action.

## Evidence

- Private-Home cold start loaded the current target package set on a random loopback port. Chromium observed the sidebar, viewer, and editor exactly once with no page, console, or request failures.
- Viewer tests passed 34 assertions, including dynamic native-open availability; Host-aware typechecking and both package builds passed.
- The patched ui-chat integration test passed 10 assertions.
- The live profile manifest, lockfile, local links, Bundle rows, and source markers were consistent before restart.
- After restart, `dsh-web` was active and returned HTTP 200. Chromium selected an existing Session, expanded the sidebar, and observed the selected `Files` tab with its empty-state copy; console errors and failed requests were empty.

This is local deployment evidence. It does not create an accepted realization lock or record user acceptance.
