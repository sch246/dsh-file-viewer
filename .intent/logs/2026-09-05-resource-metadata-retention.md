# Resource metadata retention

The caller-provided resource descriptor remains the display-metadata authority when a text source returns content without replacement metadata. The text adapter initializes and refreshes its shared document with the current resource name instead of exposing the source-owned resource id as a title.

An explicit descriptor name returned by `readText` or a text snapshot notification updates both the shared text document and every matching resource view. Content-only reads and notifications retain the current name.

The resource-workbench regression suite covers initial loading, content-only observation and an explicit source rename. Repository tests, type checking and builds establish candidate behavior only; this record does not install, restart or activate a live deployment.
