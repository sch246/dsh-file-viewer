# Browser dependency resolution

The installed Markdown preview failed during Client import with an unresolved `node:path`. Its CommonJS artifact also imported `node:process` and `node:url`. tsdown 0.22.14 chooses the Node platform for CommonJS before merging explicit input options, so vfile selected its Node conditional imports despite the top-level browser platform setting.

All five Client bundle configurations now explicitly select the browser platform through input options and share an emitted-import allowlist check. Host configurations retain Node resolution. Markdown preview is version 0.1.1; independent preview packages remain in the viewer repository.

All five bundles rebuilt successfully. Inspection of their emitted literal require calls found only declared Host modules, with no Node built-ins. No unit tests or browser automation ran, following the user's instruction. Browser startup and rendering still require user observation after deployment.
