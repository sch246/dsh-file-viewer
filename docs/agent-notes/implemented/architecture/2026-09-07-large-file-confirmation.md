# Explicit large-file loading

Sources report a text loading threshold before content reads. `ResourceConfirmationRequiredError` and the text watch event carry actual size and threshold; the shared document owns the volatile decision passed to source reads, watches and saves. Multiple views share that decision, and closing the last view discards it. Sources and persisted drafts never own a global approval flag.

Initial confirmation holds no loaded document or editor. Growth retains the existing editor and local text, detaches the content watch and pauses synchronization until the Load file action. Confirmed operations use ordinary exact hashes, drafts, comparison and guarded saves. Local text may grow and save without an output-size prompt; the provider still requires approval before reading an existing large source during revision checks or later observations.

The filesystem adapter maps the shared provider’s typed `user-files/confirmation-required` error. Provider configuration remains authoritative for thresholds, byte limits and file publication. This introduces no manager, sidebar or Host responsibility. `large-file-confirmation.client.spec.tsx` covers the real document/source/panel connection, shared lifetime, growth, local saves and cancellation.
