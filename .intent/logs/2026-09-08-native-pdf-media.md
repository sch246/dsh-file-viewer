# Native PDF and media readers

The user requested a PDF reader and audio/video viewing after approving shared binary transport extraction. The implementation keeps handlers in the existing viewer repository and uses the browser renderer to avoid introducing another document or media engine.

Added distinct lazy PDF, audio and video handlers to the existing viewer Bundle. They consume the source-neutral getStream capability, with the filesystem source preparing authenticated HTTP URLs through HEAD. Native PDF controls and audio/video playback reuse the browser; no full-file JS buffer, text synchronization, autoplay, external CDN or new runtime dependency is introduced. Media unmount captures in-memory playback settings, pauses and releases the element. Browser decoding and native PDF availability remain the practical compatibility limits.

Built user-files with scripts/build.sh and viewer with scripts/build-host.sh, both against DSH_CHECKOUT=/root/deepseek-harness; both completed successfully. One lightweight read-only agent inspected the bounded streaming and teardown paths. No tests were added or run, no browser automation or worktrees were created. Native rendering, seeking and codec compatibility were not visually exercised.

The existing Web profile already links both packages; no Bundle membership, profile configuration, reverse-proxy setting or official Harness source changed. Restarted dsh-web under the existing activation authorization. The service reported active and its homepage returned HTTP 200. This establishes startup, not browser acceptance. STATE and the package references describe the supported effects and deployment requirements.
