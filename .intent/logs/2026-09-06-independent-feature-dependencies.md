# Dependency and installation-map observations

The September 6, 2026 user instruction “可联动不意味着必依赖” requires independent feature installation. A subsequent correction establishes STATE as the detailed executable installation prompt, refined through feedback and actual environment observations. STATE therefore owns installation goals and adaptation instructions; this log owns recorded implementation constraints, migration work and evidence. A shared package in the manager repository is an implementation option, not an immutable user requirement.

## Recorded deployment

Recorded deployment: revision 0.3.5 activated under [the deleted fragment decision](../logs/2026-09-06-deleted-fragments.md). Revision 0.3.4 activation remains recorded in [the aligned comparison evidence](../logs/2026-09-06-aligned-comparison.md). This local STATE is an installation and behavior map, not the meta-intent protocol. Historical activation does not certify a new target checkout; no accepted realization lock or user visual acceptance is recorded.

## Observed implementation and scripts

The following map was recorded before the installation-prompt correction. It describes the supplied implementation, not required installation behavior. In particular, its cross-feature dependencies and removal order must not override the [installation map](../state/STATE.md#installation-map).

### Composition and implementation owners

| Owner | Required contribution and location |
| --- | --- |
| Harness Web profile | Supported package declarations and source launcher; the manifests target `0.1.2-alpha.2`. Check actual API compatibility after Host upgrades. |
| `@dsh-external/dsh-right-sidebar` | Must be built and composed first. Owns groups, placement, previews, tab orientation/dragging, resizing and layout persistence; these are not editor responsibilities. |
| Viewer Bundle | [Bundle rows](../../packages/dsh-file-viewer/cordis.patch.yml) compose viewer and editor Client graph entries. [Workbench](../../packages/dsh-file-viewer/src/client/workbench.ts) owns generic opening, handlers and associations; [document service](../../packages/dsh-file-viewer/src/client/service.ts) owns synchronization. |
| Editor dependency | [Editor package](../../packages/dsh-file-viewer-editor/package.json) owns CodeMirror and comparison rendering. It is installed as a plain dependency, never a second Bundle, and loaded lazily. |
| Optional filesystem provider | `@dsh-external/dsh-file-manager` requires this viewer and supplies metadata, text/bytes, guarded saves, native-open capability and the Files launcher. Other sources can use the viewer without the manager. |
| Optional Chat consumer | `@dsh-external/dsh-resource-links` requires manager, viewer and sidebar. It owns path recognition and Chat `preview\|system` policy; the viewer does not install it. |

### Build, install and removal

The [repository guide](../../README.md#build-and-install) owns build commands. Select explicit `DSH_CHECKOUT`, `DSH_HOME` and `DSH_PROFILE` for every profile operation. The viewer scripts permit omitted `DSH_HOME` and then use the ordinary default Home; supplying it avoids selecting an unintended profile. Keep sibling checkouts at the relative locations declared in the development manifest, or deliberately update those local links before building.

| Operation | Owned entry and effects |
| --- | --- |
| Inspect | [Setup](../../scripts/setup-host.sh), `pnpm run setup --check`: checks checkout and package-source presence only. It does not prove an installed profile or browser works. |
| Install/update | `pnpm run setup --install`: builds both packages and adds both absolute package paths in one `dsh plugin add` transaction; verifies manifest, lock, resolution and composed rows. The viewer is the Bundle and the editor is a plain dependency. |
| Inspect removal | [Uninstall](../../scripts/uninstall-host.sh), `pnpm run uninstall --check`: reports declared dependencies and viewer Bundle presence. |
| Remove | `pnpm run uninstall --remove`: removes both declared dependencies in one transaction and checks absence. Remove dependent resource-links and manager Bundles first, retaining unrelated sidebar consumers. |

Scripts do not apply or reverse Harness patches or restart services. Build output and local build symlinks change during installation; the running profile is activated separately. After installation, inspect exact dependency/lock/resolution targets, Bundle and composed Client rows; after removal, inspect their absence. In particular, uninstall's already-absent dependency branch does not check for residual symlinks or lock rows. A successful inspection alone is not removal or boot evidence. Preserve user drafts and unrelated profile settings; package removal does not clear origin-local browser storage.

### Host adaptation and ownership limits

The tracked [historical Harness patch](https://github.com/sch246/dsh-file-viewer/blob/88886953a61c55899ec308222dca9718d543e39e/patches/deepseek-harness.patch) includes the initial `chat/open-workspace-file` waterfall and other integration changes; it is not an input to viewer setup or uninstall. Resource-links maintains an incremental patch over that Chat baseline, including routing the workspace `.` action through the waterfall. Applying or reversing the historical patch wholesale can overlap that newer contribution.

No current viewer or manager lifecycle script transfers the historical patch receipt. Resource-links refuses to adopt an already-applied patch without its matching receipt. The [resource-links baseline preparation map](https://github.com/sch246/dsh-resource-links/blob/main/.intent/state/STATE.md#preparing-a-host-that-lacks-the-baseline) identifies the exact Chat symbols and reviewed adaptation record needed on a Host without the waterfall. The [historical installation record](../logs/2026-09-05-live-web-install.md) excludes `packages/typert/generator/` from viewer ownership because its external-project support belongs to skill-manager. An integrator must inspect the selected Host, the historical receipt and resource-links receipt, preserve changes owned elsewhere, and reconcile that baseline before setup or removal; reverse applicability alone does not establish ownership transfer. After a Harness upgrade, adapt only the affected public sidebar/workbench APIs and owned Host increment, then regenerate the affected artifacts through their owning scripts. A clean arbitrary Host is not established as supported by the deployment logs.

## Outstanding implementation work

Shared-provider extraction, viewer-owned filesystem source and resource polling, a common Host opening entry and optional Links ownership still require runtime implementation. Manager's required viewer/workbench injection, direct viewer opening and filesystem source registration must be replaced rather than treated as necessary product dependencies. Configuration adaptation must preserve effective values and complete rows; installation scripts and artifact consumption must follow the independent feature graph. The documentation commits perform none of these runtime changes.

Source evidence: the [viewer manifest](../../packages/dsh-file-viewer/package.json) declares sidebar and [development manifest](../../package.json) uses a sibling sidebar link. The filesystem source is supplied by manager in the recorded composition above. The [workbench](../../packages/dsh-file-viewer/src/client/workbench.ts) and [historical Host patch](https://github.com/sch246/dsh-file-viewer/blob/88886953a61c55899ec308222dca9718d543e39e/patches/deepseek-harness.patch) are adaptation references, not proof of filesystem-provider independence or Host compatibility.

## Evidence and documentation checks

The aligned comparison and deleted-fragment records linked above own the implementation and activation evidence for their revisions. This documentation update does not rerun those observations or install anything. Earlier decisions and activation logs describe their respective revisions. No accepted realization lock or user visual acceptance is recorded.

The initial dependency-map commit and this installation-prompt correction modify only STATE, AGENTS and this log in isolated worktrees. `git diff --check`, `git diff --cached --check` and local Markdown target/fragment checks passed for the initial commit. The correction is checked with `git diff --check` and local Markdown target/fragment checks. No runtime tests, profile operations, installations or service activations are performed for these documentation changes; historical logs and frozen records remain untouched.

## Viewer filesystem cutover in the isolated candidate

The viewer now owns `FilesystemResourceSource`, its source tests, and the `filesystem` registration before restoration and opening. The source uses neutral `UserFile*` types and `remote.userFiles` for reads and revision-guarded saves. Its `resourcePollIntervalMs` moves to viewer Config, Bundle and metadata Remote. Manager source ownership and the hardcoded `file-manager` breadcrumb selector are replaced by source-owned location callbacks through the common Host helper. Generic source registrations, editor laziness, exact resource identity, EOL revision passthrough, shared document/draft storage and view placement remain in their existing owners.

The viewer's historical Host patch is retired from distribution. No Host reverse operation runs. The unsupported/unapplied `rootDir`/`getCommonSourceDirectory` hunk is neither moved into the shared patch nor reversed on the Host. Common opening is supplied by the selected Host, while skill-manager-owned `externalProjectReferences` support remains a separately attributed Host prerequisite. Old patch receipts require integration review; deleting a distributed patch does not delete an applied Host capability.

Local installation uses explicit `DSH_USER_FILES` and `DSH_SIDEBAR` package or tarball overrides without rewriting distributed dependency ranges. The pinned repository tools are pnpm 10.17.1, TypeScript 5.9.3, tsdown 0.22.14 and Vitest 4.1.8. The existing tracked lockfile remains unchanged pending parent-owned distribution/tarball validation; `install:local` uses `--lockfile=false`. Registry publication and standalone tarball installation are not established by this source verification.

The focused source/browser/workbench command passed 5 files and 30 tests, including standalone shared-Remote file opening without manager/Links, preserved preview/right target, directory delegation, error propagation without delegation, Host helper breadcrumb/system calls, poll non-overlap and late-result suppression. Earlier runs exposed fixture namespace/waterfall setup errors and missing build dependencies; those failures were fixed before the passing run. No profile, service, live Host checkout or browser deployment was changed.

Final source validation used `DSH_CHECKOUT=/root/dsh-decoupling-615gv0tt/harness bash scripts/build-host.sh` and `DSH_CHECKOUT=/root/dsh-decoupling-615gv0tt/harness bash scripts/typecheck-host.sh`; both passed after the Host signal declarations were rebuilt. Build emits one self-contained viewer Client module plus the separately lazy editor module, and generated Host/Remote entries load under Node. `bash -n` passed for build/typecheck/setup/uninstall, and `git diff --check` passed. A temporary-profile check reused compatible installed peers and rejected an incompatible sidebar before mutation. The built Config smoke rejected zero, negative, fractional and infinite polling intervals and returned the configured metadata.

The parent-selected `pnpm.overrides.vite=7.3.6` avoids Vite 8 decorator-transform changes in the shared toolchain. After reinstalling that selection, the same 5 focused files passed all 30 tests. `vitest run packages/dsh-file-viewer/tests/resource-location.client.spec.ts` additionally passed the persisted source-location callback and invalid-selectable rejection case. All test commands used this repository's local `node_modules/.bin/vitest` and explicit `DSH_SIDEBAR=/root/dsh-decoupling-615gv0tt/sidebar/packages/dsh-right-sidebar`. No full repository suite, expensive browser run or doc-sync was run for this candidate.

## Prerelease installation planning followup

The parent accepted removal of the stale development `pnpm-lock.yaml`, whose sibling links and tool versions no longer represented the declared dependencies. Prerelease development uses explicit `install:local` inputs and `--lockfile=false`; normal published-dependency installation regenerates a lockfile. Tarballs remain external inputs and are not tracked.

The sidebar installation planner now reads the selected directory's manifest or only `package/package.json` from a tarball, checks the package name and viewer peer range, and emits the complete plan only after validation. The provider planner continues to own shared-provider compatibility. Two Node tests cover compatible, incompatible and wrong-name inputs in both forms and assert that failed planning emits no install sources and creates no profile.

Viewer runtime injection explicitly waits for `sessions` and `remote.session`, which the common Host helper uses for native opening. Its browser test now invokes the real Host helper for directory delegation and explicit system opening, verifying the native Remote calls instead of replacing the helper with a no-op.

Followup validation passed: `node --test scripts/profile-peers.test.mjs` (2 tests), `DSH_SIDEBAR=/root/dsh-decoupling-615gv0tt/sidebar/packages/dsh-right-sidebar node_modules/.bin/vitest run packages/dsh-file-viewer/tests/browser-plugin.client.spec.ts` (1 test), `DSH_CHECKOUT=/root/dsh-decoupling-615gv0tt/harness bash scripts/build-host.sh` (including Host/Client TypeScript compilation), and `git diff --check`. No profile mutation or Host build was performed by this followup.
