# Saladict source reuse

Upstream: https://github.com/crimx/ext-saladict

Revision: `1673df15690842847f4c5369f8113f26d4aa2604` (7.22.12).

The `upstream/` directory contains **unmodified** `engine.ts`, `View.tsx` and `_style.shadow.scss` files from `src/components/dictionaries/cambridge` `vocabulary`, `bing` and `youdao`. Copyright © 2015 CRIMX; MIT license reproduced in `LICENSE`.

`bridge.js` implements the subset of the extension helper API those engines and views need, using the reader's same-origin HTTP service instead of extension permissions. `entry.js` invokes the upstream engines, retaining their Cambridge HTML, audio extraction and Vocabulary short/long explanations. It additionally extracts current IPA/audio metadata from Vocabulary.com. The bundled React views render the original dictionary layouts; `components.jsx` adapts shared speaker, sanitized HTML, star rating and entry-box primitives. The reader panel shell is our own UI, not the complete Saladict extension; its compact toolbar and provider headings follow Saladict’s layout. `icons.json` embeds the four provider favicons from the same pinned upstream revision.

`bundle.js` includes React / React DOM (MIT notices retained) and DOMPurify (Apache-2.0 OR MPL-2.0; license notice retained in bundle). `bundle.css` compiles the unmodified upstream styles under reader-specific selectors to prevent leaking into the book layout.

Rebuild after changing the adapters or updating pinned upstream files:

```sh
cd __pages
npm run build:dictionary
```

Dictionary text, illustrations and recordings belong to their respective providers. The code's MIT license does not relicense their content. Results are fetched on demand, with source links and short-lived in-memory caching; they are not bundled in this repository.
