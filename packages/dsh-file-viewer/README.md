---
description: "Host contract for bounded UTF-8 workspace loads, guarded saves, and Chat file-open policy in the external DeepSeek Harness file viewer."
kind: "package-bundle"
---

# @dsh-external/dsh-file-viewer Host contract

## Summary

This package lets a Web profile preview and edit regular UTF-8 files inside a Session workspace. Its Host Remote applies one deployment-owned size bound to complete reads and saves, and it rejects paths or versions that cannot be handled safely. The repository root [README](../../README.md) owns Client sources, editor behavior, setup, and rollback.

## Table of Contents

- [Configuration](#configuration)
- [Workspace Remote](#workspace-remote)
- [Failures](#failures)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="configuration"></a>
## Configuration

The Bundle inserts this Host row with a one-mebibyte preview bound; the omitted Chat policy uses its `preview-or-system` default:

```yaml
- id: dsh-file-viewer
  name: '@dsh-external/dsh-file-viewer'
  config:
    maxReadBytes: 1048576
```

| Field | Default | Meaning |
|---|---|---|
| `maxReadBytes` | required | Inclusive positive integer byte limit for a complete load or saved UTF-8 payload. The shipped Bundle supplies `1048576`. |
| `openMode` | `preview-or-system` | Chat file-link policy: `preview`, `system`, or `preview-or-system`. |

Changing the profile or home patch row replaces its complete `config`; preserve both fields when overriding either one.

-----

<a id="workspace-remote"></a>
## Workspace Remote

The `fileViewerWorkspace` Typert namespace exposes `openMode`, `load`, and `save`. `load` resolves the addressed Session's immutable header cwd through `ctx.fs`, resolves the requested path against it, checks containment, and reads the complete bounded payload. It rejects final symlinks, directories, other non-regular files, NUL-bearing content, and invalid UTF-8.

The Host checks the opaque filesystem version before and after reading. `save` requires that returned version, applies the same containment, file-kind, and byte-bound checks, and calls guarded `replaceIfVersion` publication. A concurrent file change therefore becomes a stale-version error rather than an overwrite.

-----

<a id="failures"></a>
## Failures

Remote failures retain typed categories for missing Session or path, missing workspace, workspace escape, non-regular file, excessive size, non-text content, stale version, cancellation, and unavailable storage. The Client adapter converts a rejected load into a failed document snapshot and keeps dirty browser text after a rejected save.

The Host depends on `fs`, `sessions`, and `sessionPersistence`. It fails during plugin activation when those required services are absent rather than silently disabling workspace access.

-----

<a id="model-experience"></a>
## Model Experience

This package does not register a model-facing tool or add model-visible context. It changes the human browser action for Chat workspace-file links according to `openMode`.

## Known Limitations and Deferred Work

- The workspace source handles complete UTF-8 regular files only; it has no binary, partial-read, directory, or final-symlink view.
- The editor is plain text and supplies no language mode, syntax service, or collaborative editing protocol.
- Browser document state is in memory and is not restored after Client reload.

### Dev Note

None.
