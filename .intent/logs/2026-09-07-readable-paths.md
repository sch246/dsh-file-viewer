# Readable source paths

The user reported long breadcrumbs collapsing into individual ellipses and requested slash separators for copying paths. Breadcrumbs now retain complete inline text in a horizontal scroll area, with slash separators, a full-location tooltip and selectable button labels. Filesystem drive roots display forward slashes while selection hints retain their source path. The root slash is not duplicated. No synchronization protocol or hash checks change in this repair.

Path segments have no flex gap or inserted whitespace. Verification: existing resource-workbench-panel tests passed (6); the viewer Client TypeScript program and tsdown Client build passed. No new tests, synchronization changes or full-suite run.
