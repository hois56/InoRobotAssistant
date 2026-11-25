import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Button} from '@astryxdesign/core/Button';

const directory = path.dirname(fileURLToPath(import.meta.url));
const pageRoot = path.resolve(directory, '..');
const source = fs.readFileSync(path.join(pageRoot, 'script.js'), 'utf8');
const sandbox = vm.createContext({document: {addEventListener() {}}, window: {}});
vm.runInContext(`${source}\nglobalThis.groups = softwareGroups;`, sandbox);
const groups = sandbox.groups;

function icon(name) {
    if (name === 'languages') return h('span', {className: 'language-patch-icon', 'data-i18n-skip': true, 'aria-hidden': true},
        h('span', {lang: 'en'}, 'A'), h('span', {lang: 'ko'}, '가'));
    const paths = {
        download: 'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',
        monitor: 'M3 4h18v13H3zM8 21h8m-4-4v4',
        smartphone: 'M7 2h10v20H7zM10 18h4'
    };
    return h('svg', {width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true}, h('path', {d: paths[name]}));
}

function releaseInfo(tagName) {
    const match = tagName.match(/^(.*?)\s*\(([^)]+)\)$/);
    if (match) return {label: {'Standard': '표준 버전', 'Display Version': '디스플레이 버전'}[match[1]] || match[1], number: match[2]};
    const beta = tagName.match(/^(V[\d.]+) Beta$/);
    if (beta) return {label: '베타 버전', number: beta[1]};
    if (/^V[\d.]+$/.test(tagName)) return {label: '정식 버전', number: tagName};
    return {label: tagName, number: ''};
}

const controls = renderToStaticMarkup(h('div', {id: 'typeFilters', className: 'filter-list'},
    [{id: 'all', label: '전체보기'}, ...groups.map(group => ({id: group.id, label: group.id === 'InoRobotKoreanInstaller' ? '한글 패치기' : group.name}))].map((group, index) => h(Button, {
        key: group.id,
        label: group.label,
        variant: 'ghost',
        className: `filter-btn${index === 0 ? ' active' : ''}`,
        'data-type': group.id,
        'aria-pressed': index === 0,
        children: h('span', {className: 'filter-label'}, h('span', null, group.label), h('span', {className: 'filter-count', 'aria-hidden': true}, index === 0 ? groups.reduce((count, entry) => count + entry.versions.length, 0) : groups[index - 1].versions.length))
    }))
));

function releaseCard(group, version, index) {
    const release = releaseInfo(version.tagName);
    const titleId = `version-${group.id}-${index}`;
    const numberId = `release-number-${group.id}-${index}`;
    const releaseName = `heading-${group.id} ${titleId}${release.number ? ` ${numberId}` : ''}`;
    return h('article', {
        key: version.tagName,
        className: 'software-card',
        'data-product': group.id,
        'data-version-index': index,
        'data-release-tag': version.tagName,
        'aria-labelledby': releaseName
    },
        h('div', {className: 'release-details'},
            h('div', {className: 'release-heading'},
                h('h3', {className: 'sr-only'}, group.name),
                h('div', {className: 'release-version', id: titleId}, release.label)
            ),
            h('p', {className: 'release-description'}, version.description),
            h('div', {className: 'release-meta'},
                h('time', {dateTime: version.date, className: 'release-date'}, version.date),
                release.number ? h('span', {className: 'release-number', id: numberId, 'data-i18n-skip': true}, release.number) : null
            )
        ),
        h('div', {className: 'download-options'}, version.downloads.map(download => h(Button, {
            key: download.type,
            label: download.label,
            variant: 'secondary',
            size: 'md',
            className: 'download-btn',
            icon: icon('download'),
            isDisabled: Boolean(download.disabled || !download.url),
            'data-download-key': download.url ? encodeURIComponent(download.url) : undefined,
            'data-download-locked': 'false',
            'data-download-path': download.path ? encodeURIComponent(download.path) : undefined,
            'aria-labelledby': `${releaseName} label-${group.id}-${index}-${download.type}`,
            children: h('span', {className: 'download-label', id: `label-${group.id}-${index}-${download.type}`}, h('span', null, download.label), h('span', {className: 'download-size'}, download.size))
        })))
    );
}

const catalog = renderToStaticMarkup(h('div', {id: 'softwareList'}, groups.map(group => h('section', {
    key: group.id,
    className: 'software-group',
    'data-group': group.id,
    'aria-labelledby': `heading-${group.id}`
},
    h('div', {className: 'group-heading'},
        h('span', {className: 'product-icon'}, icon(group.icon)),
        h('div', {className: 'group-title'},
            h('h2', {id: `heading-${group.id}`}, group.id === 'InoRobotKoreanInstaller' ? '한글 패치기' : group.name),
            h('p', null, {InoRobotLab: 'PC 소프트웨어', InoRobotTP: '티칭 펜던트 소프트웨어', InoRobotKoreanInstaller: 'InoRobotLab · InoRobotTP'}[group.id])
        )
    ),
    h('div', {className: 'release-list'}, group.versions.map((version, index) => releaseCard(group, version, index)))
))));

const htmlPath = path.join(pageRoot, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
for (const [name, markup] of Object.entries({FILTERS: controls, CATALOG: catalog})) {
    const marker = new RegExp(`<!-- ASTRYX:${name}:START -->[\\s\\S]*?<!-- ASTRYX:${name}:END -->`);
    if (!marker.test(html)) throw new Error(`Missing Astryx ${name} build marker`);
    html = html.replace(marker, `<!-- ASTRYX:${name}:START -->\n${markup}\n<!-- ASTRYX:${name}:END -->`);
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
console.log(`Astryx: ${groups.length} product groups, ${groups.flatMap(group => group.versions).length} releases; static components and local CSS generated.`);
