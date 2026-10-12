# Browser transcript extraction libraries

These files are vendored so transcript imports make no CDN requests and the
exercise remains a static site with no build step.

- **Mammoth 1.13.0**: mammoth/mammoth.browser.min.js, from the published npm
  package mammoth@1.13.0. BSD-2-Clause; license in mammoth/LICENSE.
  Source: https://github.com/mwilliamson/mammoth.js
- **PDF.js 6.4.299**: minified legacy display module and worker, character maps,
  standard fonts, and WASM assets from pdfjs-dist@6.4.299. Apache-2.0; license
  in pdfjs/LICENSE, with asset-specific notices retained.
  Source: https://github.com/mozilla/pdf.js

Only the importer loads these libraries. Word extraction uses extractRawText;
PDF extraction uses getTextContent. Original document files stay in the
browser. Extracted transcript text is submitted to the configured model endpoint
only when students generate or recode analysis.
