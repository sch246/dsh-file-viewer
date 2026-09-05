# Multi-instance documents and source synchronization

The user requested implementation through a working Web flow: independent document instances, provider-defined locations and optional selectors, content-based synchronization, and separate automatic update/save preferences. The approved implementation uses base/local/source snapshots, conditional writes for automatic saving, and visible conflict resolution. Exact source text semantics own newline representation; editor hashes must compare the same canonical representation. Session switching retains sidebar visibility and restores session-owned instances.

The user clarified that file management is a user interface and must not inherit agent sandbox or approval restrictions. A separate file-manager plugin owns authenticated Host filesystem access, directory operations, and the filesystem text provider. Session cwd is an initial location, not a confinement boundary. The editor owns no filesystem policy.

This supersedes the single Files tab, one-document-per-session model, and built-in workspace source ownership. Runtime validation and deployment evidence are recorded separately; this decision is not an acceptance claim.
