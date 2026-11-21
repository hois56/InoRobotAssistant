# Software page design

This page uses Meta Astryx 0.7.16 with a page-specific dark theme built on Neutral. Astryx Buttons are rendered to static HTML during the design build; the browser uses the existing lightweight JavaScript for product filtering and downloading. No React runtime or external UI CDN is needed by visitors.

From the repository root:

```powershell
npm ci --prefix 5_Software/design
npm run --prefix 5_Software/design build
```

Run the build after changing `5_Software/script.js` download data or `design/build.mjs`. The build updates only the two marked sections in `5_Software/index.html` and copies the pinned upstream CSS and MIT license to `5_Software/assets/astryx/`. Commit these generated assets with the source. Page-specific styles are in `5_Software/style.css`.

Use the installed CLI for component and design references:

```powershell
npm run --prefix 5_Software/design astryx -- component Button
npm run --prefix 5_Software/design astryx -- docs tokens
```

Validate the page with `npm run verify:changed -- 5_Software/index.html 5_Software/script.js 5_Software/style.css`. The existing download contract and browser download checks must continue to pass.
