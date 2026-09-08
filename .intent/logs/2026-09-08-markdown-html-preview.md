# HTML in Markdown file previews

The user supplied a README screenshot whose HTML table, aligned headings and QR-code images appeared as tag text, and requested HTML rendering. The Host chat Markdown component deliberately renders raw HTML literally and exposes no renderer override. The file preview therefore owns a react-markdown/remark/rehype pipeline with HTML parsing followed by sanitization; it reuses the public Host CodeBlock for highlighting/copying and retains GFM and math support. Chat rendering and Host source remain unchanged.

The sanitizer retains document markup while excluding scripts, event handlers, arbitrary styles and embedded frames. HTTP(S) images and HTTP(S)/mailto links retain the existing URL policy; document anchors are supported. Fenced HTML remains escaped code. The preview continues to consume shared Local text and the existing loading/approval lifecycle, with no separate filesystem reader.

Dependencies were prepared in `/root/.local/share/dsh-editor-deps/markdown-html`, using React 18-compatible types. Client compilation and bundling provide build evidence; no automated or browser tests were requested or run. Viewer version 0.1.3 retains the existing Bundle and stable installed package path.
