# File Viewer Host

The Host exposes `fileViewerWorkspace` through Typert. It loads and saves complete
UTF-8 regular files under the immutable cwd recorded in a Session header. Path
resolution, containment, metadata, reads, and guarded writes all use `ctx.fs`;
the Host never reads workspace content through Node filesystem APIs.

`maxReadBytes` is required deployment configuration and is an inclusive cap for
both loaded and saved UTF-8 bytes. Loads reject a changed pre/post-read version,
and saves use the exact opaque version returned by load. Final symlinks,
non-regular files, paths outside the workspace, binary text, and oversized
content are rejected with typed Remote errors.

Host build and profile operations require explicit `DSH_CHECKOUT` and
`DSH_PROFILE` values. `pnpm setup` and `pnpm uninstall` only inspect by default;
neither script restarts a service.
