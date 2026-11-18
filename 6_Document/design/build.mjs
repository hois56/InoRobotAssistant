import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Button} from '@astryxdesign/core/Button';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Token} from '@astryxdesign/core/Token';

const directory = path.dirname(fileURLToPath(import.meta.url));
const pageRoot = path.resolve(directory, '..');

// The page source text is Korean; the runtime translator matches these exact strings.
const SEARCH_LABEL = '키워드(예: SCARA, 설치, 통신)를 입력하세요...';
const SLOT = {lang: '__LANG__', label: '__LABEL__'};

const iconPaths = {
    download: [['path', {d: 'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5'}]],
    eye: [
        ['path', {d: 'M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0'}],
        ['circle', {cx: 12, cy: 12, r: 3}]
    ],
    search: [['circle', {cx: 11, cy: 11, r: 7}], ['path', {d: 'm21 21-4.3-4.3'}]]
};

function icon(name, size = 18) {
    return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false
    }, iconPaths[name].map(([tag, props], index) => h(tag, {key: index, ...props})));
}

// Controls are rendered to static HTML; visitors never download a React runtime.
const search = renderToStaticMarkup(h(TextInput, {
    id: 'manualSearch',
    type: 'search',
    label: SEARCH_LABEL,
    isLabelHidden: true,
    value: '',
    placeholder: SEARCH_LABEL,
    size: 'lg',
    width: '100%',
    startIcon: props => h('svg', {
        ...props, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round'
    }, iconPaths.search.map(([tag, attrs], index) => h(tag, {key: index, ...attrs}))),
    enterKeyHint: 'search',
    autoComplete: 'off',
    hasSpellCheck: false,
    controlClassName: 'search-control'
}));

const filterActions = renderToStaticMarkup(h('div', {className: 'filter-actions'}, [
    {id: 'expandAllFilters', label: '펼치기'},
    {id: 'collapseAllFilters', label: '접기'}
].map(action => h(Button, {key: action.id, id: action.id, label: action.label, variant: 'ghost', size: 'sm', className: 'filter-action'}))));

// Dynamic rows are cloned from these templates by script.js, so every row keeps real Astryx markup.
function actionButton(label, name, action) {
    return h(Button, {
        label, variant: 'secondary', size: 'md', icon: icon(name, 16),
        className: `manual-action manual-action-${action}`, 'data-action': action
    });
}

const rowMarkup = renderToStaticMarkup(h('article', {className: 'manual-item'},
    h('div', {className: 'manual-main'},
        h('h3', {className: 'manual-title'}),
        h('div', {className: 'manual-meta'},
            h(Token, {label: SLOT.lang, size: 'sm', className: 'manual-code'}),
            h('span', {className: 'manual-tag'}),
            h('span', {className: 'manual-extra'}),
            h('time', {className: 'manual-date'})
        )
    ),
    h('div', {className: 'manual-actions'},
        actionButton('미리보기', 'eye', 'view'),
        actionButton('다운로드', 'download', 'download')
    )
)).replace(`>${SLOT.lang}<`, ' data-slot="code"><');

const cadButtonMarkup = renderToStaticMarkup(actionButton(SLOT.label, 'download', 'download'))
    .replace(`>${SLOT.label}<`, ' data-slot="label"><');

for (const [name, markup] of Object.entries({row: rowMarkup, cad: cadButtonMarkup})) {
    if (markup.includes('__')) throw new Error(`Unresolved template slot in ${name} markup`);
}

const templates = [
    `<template id="manualRowTemplate">${rowMarkup}</template>`,
    `<template id="manualCadButtonTemplate">${cadButtonMarkup}</template>`
].join('\n');

const htmlPath = path.join(pageRoot, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
for (const [name, markup] of Object.entries({SEARCH: search, FILTER_ACTIONS: filterActions, TEMPLATES: templates})) {
    const marker = new RegExp(`<!-- ASTRYX:${name}:START -->[\\s\\S]*?<!-- ASTRYX:${name}:END -->`);
    if (!marker.test(html)) throw new Error(`Missing Astryx ${name} build marker`);
    html = html.replace(marker, () => `<!-- ASTRYX:${name}:START -->\n${markup}\n<!-- ASTRYX:${name}:END -->`);
}
fs.writeFileSync(htmlPath, html);

const assets = path.join(pageRoot, 'assets', 'astryx');
fs.mkdirSync(assets, {recursive: true});
for (const [entry, filename] of [
    ['@astryxdesign/core/reset.css', 'reset.css'],
    ['@astryxdesign/core/astryx.css', 'astryx.css'],
    ['@astryxdesign/theme-neutral/theme.css', 'neutral.css']
]) fs.copyFileSync(fileURLToPath(import.meta.resolve(entry)), path.join(assets, filename));
// Keep the upstream MIT notice alongside the distributed styles.
fs.copyFileSync(path.join(directory, 'LICENSE.astryx'), path.join(assets, 'LICENSE'));
console.log('Astryx: search field, filter actions and row templates generated; local CSS copied.');
