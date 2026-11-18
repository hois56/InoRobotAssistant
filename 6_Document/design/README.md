# Document page design

This page uses Meta Astryx 0.7.16 (Neutral theme) in dark mode. Astryx `TextInput`, `Button` and `Token` are rendered to static HTML during the design build; the browser uses the existing lightweight JavaScript for filtering, search and downloads. No React runtime, Tailwind CDN or external icon library is needed by visitors.

From the repository root:

```powershell
npm ci --prefix 6_Document/design
npm run --prefix 6_Document/design build
```

Run the build after changing `design/build.mjs`. The build updates only the marked sections in `6_Document/index.html` (search field, expand/collapse actions and the document row templates cloned by `script.js`) and copies the pinned upstream CSS and MIT license to `6_Document/assets/astryx/`. Commit these generated assets with the source.

Hand-edited parts:

- `index.html` holds the filter sidebar. Keep every label as the translatable source text, and keep the `data-type`, `data-cat` and `data-cad` attributes and group ids (`typeFilters`, `catFilters`, `eduFilters`, `profileFilters`, `certFilters`, `cadFilters`); `script.js` and the home page guide read them.
- `style.css` holds the page styles. Colours override Astryx semantic tokens (`--color-*`) so Astryx components follow the same palette.
- `script.js` keeps `window.renderManuals()` and the `#manualList .manual-item` structure (a `h3` title, then the preview and download buttons in that order) because `0_Home/tool-guide-embed.js` drives them.

Readability rules this page follows (from `astryx docs layout/structure`): documents are rows with dividers rather than one card each, text uses only the primary and secondary colours, and hierarchy comes from weight and colour rather than smaller sizes.

Use the installed CLI for component and design references:

```powershell
npm run --prefix 6_Document/design astryx -- component Button
npm run --prefix 6_Document/design astryx -- docs tokens
```

Validate the page with `npm run verify:changed -- 6_Document/index.html 6_Document/script.js 6_Document/style.css`.
