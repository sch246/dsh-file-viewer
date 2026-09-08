# Preview navigation and source locations

The user accepted Edit side by side and requested readable Markdown metadata, file-relative links in the same tab with Back/Forward, source line/column positioning, and removal of the routine preview reload button. The user clarified that the sidebar group should own history. Committed tab activation and explicit in-tab jumps create entries; generic DOM focus changes do not. Viewer reports resource checkpoints and uses source-provided resolution. The temporary per-tab history was removed before publication. A source position is independent of the path, allowing system opening to retain its plain-path fallback. Editor requests apply after complete loading and do not become repeated cursor resets.

The initial implementation discarded line suffixes in Chat discovery and had no current-tab file navigation. The public user-files location parser now preserves those coordinates, while the source resolver owns canonical file identity. Markdown renders its leading YAML block as escaped metadata instead of Markdown headings. Existing close guards remain active when navigation would release the last edited view.

No tests or browser automation were requested. Owned builds are the installation evidence; interactive behavior awaits user observation.
