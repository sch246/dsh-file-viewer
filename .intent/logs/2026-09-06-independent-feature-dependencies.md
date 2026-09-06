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

The tracked [historical Harness patch](../../patches/deepseek-harness.patch) includes the initial `chat/open-workspace-file` waterfall and other integration changes; it is not an input to viewer setup or uninstall. Resource-links maintains an incremental patch over that Chat baseline, including routing the workspace `.` action through the waterfall. Applying or reversing the historical patch wholesale can overlap that newer contribution.

No current viewer or manager lifecycle script transfers the historical patch receipt. Resource-links refuses to adopt an already-applied patch without its matching receipt. The [resource-links baseline preparation map](https://github.com/sch246/dsh-resource-links/blob/main/.intent/state/STATE.md#preparing-a-host-that-lacks-the-baseline) identifies the exact Chat symbols and reviewed adaptation record needed on a Host without the waterfall. The [historical installation record](../logs/2026-09-05-live-web-install.md) excludes `packages/typert/generator/` from viewer ownership because its external-project support belongs to skill-manager. An integrator must inspect the selected Host, the historical receipt and resource-links receipt, preserve changes owned elsewhere, and reconcile that baseline before setup or removal; reverse applicability alone does not establish ownership transfer. After a Harness upgrade, adapt only the affected public sidebar/workbench APIs and owned Host increment, then regenerate the affected artifacts through their owning scripts. A clean arbitrary Host is not established as supported by the deployment logs.

## Outstanding implementation work

Shared-provider extraction, viewer-owned filesystem source and resource polling, a common Host opening entry and optional Links ownership still require runtime implementation. Manager's required viewer/workbench injection, direct viewer opening and filesystem source registration must be replaced rather than treated as necessary product dependencies. Configuration adaptation must preserve effective values and complete rows; installation scripts and artifact consumption must follow the independent feature graph. The documentation commits perform none of these runtime changes.

Source evidence: the [viewer manifest](../../packages/dsh-file-viewer/package.json) declares sidebar and [development manifest](../../package.json) uses a sibling sidebar link. The filesystem source is supplied by manager in the recorded composition above. The [workbench](../../packages/dsh-file-viewer/src/client/workbench.ts) and [historical Host patch](../../patches/deepseek-harness.patch) are adaptation references, not proof of filesystem-provider independence or Host compatibility.

## Evidence and documentation checks

The aligned comparison and deleted-fragment records linked above own the implementation and activation evidence for their revisions. This documentation update does not rerun those observations or install anything. Earlier decisions and activation logs describe their respective revisions. No accepted realization lock or user visual acceptance is recorded.

The initial dependency-map commit and this installation-prompt correction modify only STATE, AGENTS and this log in isolated worktrees. `git diff --check`, `git diff --cached --check` and local Markdown target/fragment checks passed for the initial commit. The correction is checked with `git diff --check` and local Markdown target/fragment checks. No runtime tests, profile operations, installations or service activations are performed for these documentation changes; historical logs and frozen records remain untouched.
