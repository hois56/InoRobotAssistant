const fs = require('fs');
const path = require('path');

const localeCodes = ['ko', 'en', 'zh-CN', 'vi'];
const cardSections = {
    robotSelect: 'Robot Model Select',
    robot3dViewer: '3D Simulation',
    toolSelector: 'Robot Tool Selector',
    projectGenerator: 'Project Generator',
    software: 'Software',
    manual: 'Document',
    debuggingTool: 'Debugging Tool'
};

function readJson(root, relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function historyToMarkdown(history, includeTableOfContents = false) {
    if (!history || typeof history !== 'object') return '';

    const lines = ['# ' + history.title, ''];
    if (history.intro) lines.push(history.intro, '');

    if (includeTableOfContents) {
        lines.push('## 목차', '');
        (history.sections || []).forEach(section => {
            lines.push('- [' + section.title + '](#' + section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + ')');
        });
        lines.push('', '---', '');
    }

    (history.sections || []).forEach((section, sectionIndex) => {
        lines.push('## ' + section.title, '');
        (section.versions || []).forEach(version => {
            lines.push('### ' + version.title, '');
            (version.items || []).forEach(item => lines.push('- ' + item));
            lines.push('');
        });
        if (sectionIndex < history.sections.length - 1) lines.push('---', '');
    });

    return lines.join('\n').trimEnd() + '\n';
}

function parseMarkdown(markdown) {
    const lines = String(markdown || '').split(/\r?\n/);
    const titleLine = lines.find(line => line.startsWith('# '));
    const title = titleLine ? titleLine.slice(2).trim() : 'InoRobot Assistant 업데이트 기록';
    const firstSectionIndex = lines.findIndex(line => line.startsWith('## '));
    const intro = firstSectionIndex < 0
        ? ''
        : lines.slice(1, firstSectionIndex)
            .filter(line => line.trim() !== '---')
            .join('\n')
            .trim();
    const sections = [];
    let section = null;
    let version = null;

    lines.forEach(line => {
        if (line.startsWith('## ')) {
            const sectionTitle = line.slice(3).trim();
            if (sectionTitle === '목차') return;
            section = { title: sectionTitle, versions: [] };
            sections.push(section);
            version = null;
            return;
        }

        if (section && line.startsWith('### ')) {
            version = { title: line.slice(4).trim(), items: [] };
            section.versions.push(version);
            return;
        }

        if (version && line.startsWith('- ')) {
            version.items.push(line.slice(2).trim());
        }
    });

    return {
        title,
        intro,
        sections
    };
}

function mergeHistory(canonical, localized) {
    const localizedSections = new Map((localized?.sections || []).map(section => [section.title, section]));
    const sections = (canonical.sections || []).map(canonicalSection => {
        const localizedSection = localizedSections.get(canonicalSection.title);
        const localizedVersions = new Map((localizedSection?.versions || []).map(version => [version.title, version]));
        return {
            title: canonicalSection.title,
            versions: (canonicalSection.versions || []).map(canonicalVersion => {
                const localizedVersion = localizedVersions.get(canonicalVersion.title);
                const localizedItems = localizedVersion?.items || [];
                return {
                    title: canonicalVersion.title,
                    // A missing or incomplete translation falls back to the canonical Korean entry.
                    items: localizedItems.length === canonicalVersion.items.length
                        ? localizedItems
                        : canonicalVersion.items
                };
            })
        };
    });

    return {
        title: localized?.title || canonical.title,
        intro: localized?.intro || canonical.intro,
        sections
    };
}

function getCardVersions(versionHistory) {
    const canonical = versionHistory.locales.ko.versionHistory;
    const sections = new Map((canonical.sections || []).map(section => [section.title, section]));
    const versions = {};

    Object.entries(cardSections).forEach(([cardKey, sectionTitle]) => {
        const section = sections.get(sectionTitle);
        const title = section?.versions?.[0]?.title || '';
        const match = title.match(/^Ver\s+(.+)$/i);
        if (!match) throw new Error('Missing latest version for ' + cardKey + '.');
        versions[cardKey] = match[1];
    });

    return versions;
}

function loadVersionHistory(root) {
    const source = readJson(root, '0_Home/version-history.json');
    if (source.schemaVersion !== 1) {
        throw new Error('Unsupported version-history.json schema version.');
    }

    localeCodes.forEach(locale => {
        if (!source.locales?.[locale]?.versionHistory || !source.locales?.[locale]?.debugVersionHistory) {
            throw new Error('version-history.json is missing history data for ' + locale + '.');
        }
    });

    const canonical = source.locales.ko;
    const locales = Object.fromEntries(localeCodes.map(locale => [locale, {
        // Keep locale translations where available, but always inherit new canonical releases.
        versionHistory: mergeHistory(canonical.versionHistory, source.locales[locale].versionHistory),
        debugVersionHistory: mergeHistory(canonical.debugVersionHistory, source.locales[locale].debugVersionHistory)
    }]));

    return {
        ...source,
        locales,
        cardVersions: getCardVersions({ locales })
    };
}

function writeGeneratedArtifacts(root, versionHistory) {
    const markdown = historyToMarkdown(versionHistory.locales.ko.versionHistory, true);
    const versions = Object.entries(versionHistory.cardVersions)
        .map(([key, version]) => `    ${key}: '${version}'`)
        .join(',\n');

    fs.writeFileSync(path.join(root, '0_Home/UPDATE_HISTORY.md'), markdown, 'utf8');
    fs.writeFileSync(
        path.join(root, '0_Home/site-card-versions.js'),
        '// Generated from 0_Home/version-history.json by tools/build-version-history.cjs.\n' +
        '// Edit 0_Home/version-history.json instead.\n' +
        'window.SITE_CARD_VERSIONS = {\n' + versions + '\n};\n',
        'utf8'
    );
    fs.writeFileSync(
        path.join(root, '0_Home/site-card-history-data.js'),
        '// Generated from 0_Home/version-history.json by tools/build-version-history.cjs.\n' +
        `window.SITE_CARD_HISTORY_MARKDOWN_BASE64 = '${Buffer.from(markdown, 'utf8').toString('base64')}';\n`,
        'utf8'
    );
}

module.exports = {
    cardSections,
    historyToMarkdown,
    loadVersionHistory,
    mergeHistory,
    parseMarkdown,
    writeGeneratedArtifacts
};
