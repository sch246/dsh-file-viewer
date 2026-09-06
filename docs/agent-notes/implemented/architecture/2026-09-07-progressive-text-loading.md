# Progressive initial text loading

Approved initial text reads can consume source-owned start, chunk and complete events through the existing streaming Remote. The document service owns the provisional read-only snapshot, cumulative byte progress and append coalescing. A source's complete event validates its revision; normal source hashing and draft restoration happen once afterward. Partial text has no Base or usable revision and cannot enter edit, save, comparison, automation or browser draft paths.

The first nonempty segment publishes immediately; later segments coalesce at the configured interval. Stop and failures preserve the preview as visibly incomplete, and retry starts from the beginning. Each operation retains cancellation and generation guards. Existing ready documents use complete observations so refresh never appends source data into Local text.

The editor handle appends at the document end without an undo entry and reconfigures read-only permission through a CodeMirror Compartment. Both retain the same view, selection and scroll. Final coalesced text can append in the same render that enables editing. The progress line is presentation only and does not grant document completeness.

The filesystem adapter projects the provider's stream events without introducing a transfer protocol. Viewer requires user-files ^0.1.2; the provider owns UTF-8 and EOL boundaries, raw hashes, file identity validation and file-handle cancellation. Existing complete reads and JSON saves remain available. Random access, tail loading and chunked saves are outside this capability.
