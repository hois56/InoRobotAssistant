# Shared site theme

`tool-colors.css` defines the ivory header, paper surfaces, text and selected states for the tool pages. Load it after the page stylesheet and the shared layout rules in `astryx-theme.css`. Software uses its own layout with the same palette. Software and Document load the native Astryx component CSS.

Keep page structure and interactions in their existing files. Add presentation rules to the corresponding section in the shared stylesheet. The simulation uses its own workspace stylesheet for the canvas controls and detached panels. Product photos and technical drawings retain their original image content.

Edit `0_Home/home.template.html` for the home page and run `node tools/build-version-history.cjs` to regenerate all language routes. The local server must allow the `shared` asset directory. Check desktop and mobile layouts, focus indication and contrast when changing the theme.
