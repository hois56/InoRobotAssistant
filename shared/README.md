# Shared site theme

`brand-colors.css` defines the INOVANCE blue, the light surfaces and the text, focus and button colors used across the site. Load it on every page, including the simulation. On tool pages, load `tool-colors.css` after the page stylesheet and the shared layout rules in `astryx-theme.css`. Software uses its own layout with the same palette. Software and Document load the native Astryx component CSS.

Project Generator and the Debugging Tool pages use prebuilt Tailwind utilities (`tailwind.css`) and Lucide icons (`icons.js`) instead of the Tailwind Play CDN and the full icon bundle. After adding Tailwind classes or `data-lucide` icons to those pages, run `node tools/build-tailwind-pages.cjs` (network access to the CDNs is needed only while building).

Keep page structure and interactions in their existing files. Add presentation rules to the corresponding section in the shared stylesheet. The simulation uses its own workspace stylesheet for the canvas controls and detached panels. Product photos and technical drawings retain their original image content.

Edit `0_Home/home.template.html` for the home page and run `node tools/build-version-history.cjs` to regenerate all language routes. The local server must allow the `shared` asset directory. Check desktop and mobile layouts, focus indication and contrast when changing the theme.
