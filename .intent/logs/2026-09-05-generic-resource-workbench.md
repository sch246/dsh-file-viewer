# Generic resource workbench

The resource-workbench revision replaces the text-only `ctx.fileViewer` opening route with `ctx.resourceWorkbench`. A resource provider registers metadata-independent text and byte capabilities; a caller opens a descriptor containing the exact Session, source and source-owned resource identity plus handler-selection metadata. Text decoding remains an explicit source capability and byte handlers never pass through the text synchronization model.

The workbench selects an explicit handler before a stored association, then a unique highest-priority default, then a safe source-provided text fallback. Equal default matches present a choice instead of depending on registration order. The built-in image handler consumes bytes through an `img` element, and SVG resources default to it while retaining the text editor as an available open-with choice.

Text documents and resource views have separate identities. One exact resource reference owns Base, Local, Source, hashes, watch and write operations; any number of views can reference it. Each view retains its own opaque editor selection, scroll and undo state through renderer remounts. The sidebar owns group placement, preview replacement and pin state; the first edit pins a preview even when content later returns to its original value.

Handler-owned close guards apply to both close and handler switching. Byte-capable handlers can read, conditionally write and watch opaque bytes without acquiring text normalization or hashing behavior. Source unload leaves text drafts and failure state available. Sidebar restoration stores a JSON-safe resource descriptor and handler id, then reconnects the source and shared document when their registrations become available.

Sidebar close confirmation is read-only with respect to resource and document lifetime. The sidebar invokes committed cleanup only after the same instance is still eligible for removal; pinning, updating, superseding or vetoing an asynchronous close retains the view and its draft.

Automatic update and save settings retain the three-way conflict safety rules. This revision adds inherited global, optional source and explicit resource settings; capability checks affect the resolved behavior without rewriting the saved preference. Reset removes the resource override and resumes inheritance.

Repository tests and builds establish candidate behavior only. This record does not install, restart, activate or accept a live deployment.
