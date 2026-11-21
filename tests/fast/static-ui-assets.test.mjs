import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');

// Pages that use prebuilt Tailwind utilities and icons (tools/build-tailwind-pages.cjs).
const groups = [
    { icons: '4_ProjectGenerator/icons.js', css: '4_ProjectGenerator/tailwind.css',
        pages: ['4_ProjectGenerator/index.html'], sources: ['4_ProjectGenerator/index.html', '4_ProjectGenerator/app.js'] },
    { icons: '7_DebuggingTool/icons.js', css: '7_DebuggingTool/tailwind.css',
        pages: ['7_DebuggingTool/index.html', '7_DebuggingTool/ZeroCalibration/index.html'],
        sources: ['7_DebuggingTool/index.html', '7_DebuggingTool/ZeroCalibration/index.html', '7_DebuggingTool/debugging-history.js'] }
];

for (const group of groups) {
    test(`${group.icons} contains every icon its pages request`, () => {
        const available = new Set([...read(group.icons).matchAll(/^\s{8}"([\w-]+)": /gm)].map(match => match[1]));
        const used = new Set();
        for (const file of group.sources) {
            const text = read(file);
            for (const match of text.matchAll(/data-lucide=["'`]([\w-]+)["'`]/g)) used.add(match[1]);
            for (const match of text.matchAll(/\bicon\s*:\s*["']([a-z][\w-]*)["']/g)) used.add(match[1]);
        }
        const missing = [...used].filter(name => !available.has(name));
        assert.deepEqual(missing, [], 'Run node tools/build-tailwind-pages.cjs after adding icons.');
    });

    test(`${group.pages.join(', ')} use the prebuilt styles instead of the Tailwind and Lucide CDNs`, () => {
        assert.match(read(group.css), /--tw-/);
        for (const page of group.pages) {
            const html = read(page);
            assert.doesNotMatch(html, /cdn\.tailwindcss\.com|unpkg\.com\/lucide/, page);
            assert.match(html, /icons\.js\?v=/, page);
            // The stylesheet stays last in <head>, where the Play CDN used to inject its rules.
            assert.match(html, /tailwind\.css\?v=[^"]+">\s*<\/head>/, page);
        }
    });
}
