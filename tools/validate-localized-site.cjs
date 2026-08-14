const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { historyToMarkdown: renderVersionHistory, loadVersionHistory } = require('./version-history.cjs');

const root = path.resolve(__dirname, '..');
const localeCodes = ['ko', 'en', 'zh-CN', 'vi'];
const targetLocaleCodes = ['en', 'zh-CN', 'vi'];
const localeFileDefinitions = [
    { file: 'home.json', pageKeys: ['home'] },
    { file: 'robot-model-select.json', pageKeys: ['robotSelect'] },
    { file: 'robot-3d-viewer.json', pageKeys: ['robot3dViewer'] },
    { file: 'tool-selector.json', pageKeys: ['toolSelector'] },
    { file: 'project-generator.json', pageKeys: ['projectGenerator'] },
    { file: 'software.json', pageKeys: ['software'] },
    { file: 'document.json', pageKeys: ['manual'] },
    { file: 'debugging-tool.json', pageKeys: ['debugging', 'zeroCalibration'] },
    { file: 'privacy.json', pageKeys: ['privacy'] }
];
const failures = [];

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readBuffer(relativePath) {
    return fs.readFileSync(path.join(root, relativePath));
}

function assert(condition, message) {
    if (!condition) failures.push(message);
}

function readJson(relativePath) {
    return JSON.parse(read(relativePath));
}

function getByPath(value, keyPath) {
    return keyPath.split('.').reduce((current, key) => current && current[key], value);
}

function parseSiteCardVersions(source) {
    const versions = {};
    for (const match of source.matchAll(/([A-Za-z0-9_]+):\s*['"]([^'"]+)['"]/g)) {
        versions[match[1]] = match[2];
    }
    return versions;
}

function formatCardVersion(version) {
    return String(version).replace(/^(\d{2}\.\d{2}\.\d{2})\.\d+$/, '$1');
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractNamedFunction(source, functionName) {
    const start = source.indexOf('function ' + functionName + '(');
    if (start < 0) return '';
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    return '';
}

function validateStandaloneLanguageSwitch(html, file) {
    const match = html.match(/<script>\s*\/\/ Keep route switching functional[^\r\n]*\r?\n([\s\S]*?)<\/script>/);
    assert(Boolean(match), file + ' is missing the executable standalone language handler.');
    if (!match) return;

    let changeHandler = null;
    const sessionWrites = [];
    const sharedWrites = [];
    const assignments = [];
    const select = {
        value: 'ko',
        dataset: {},
        addEventListener(eventName, handler) {
            if (eventName === 'change') changeHandler = handler;
        }
    };
    vm.runInNewContext(match[1], {
        document: { getElementById: id => id === 'inorobot-language-select' ? select : null },
        window: {
            sessionStorage: { setItem: (key, value) => sessionWrites.push([key, value]) },
            localStorage: { setItem: (key, value) => sharedWrites.push([key, value]) },
            location: { assign: value => assignments.push(value) }
        }
    });

    assert(select.dataset.localeListener === 'true' && typeof changeHandler === 'function', file + ' does not attach the language change event.');
    if (typeof changeHandler !== 'function') return;
    Object.entries({ ko: '/', en: '/en/', 'zh-CN': '/cn/', vi: '/vn/' }).forEach(([locale, route]) => {
        select.value = locale;
        changeHandler();
        assert(assignments.at(-1) === route, file + ' does not navigate ' + locale + ' to ' + route + '.');
        assert(sessionWrites.at(-1).join('|') === 'inorobot.locale|' + locale, file + ' does not persist the ' + locale + ' session locale.');
        assert(sharedWrites.at(-1).join('|') === 'inorobot.locale|' + locale, file + ' does not persist the ' + locale + ' shared locale.');
    });
}

function loadMergedLocale(code) {
    const locale = { _meta: {}, common: {}, pages: {}, legacy: {}, patterns: [], pageTranslations: {}, sources: {} };
    localeFileDefinitions.forEach(definition => {
        const supplement = readJson(path.join('Language', code, definition.file));
        locale.sources[definition.file] = supplement;
        Object.assign(locale._meta, supplement._meta || {});
        Object.assign(locale.common, supplement.common || {});
        Object.assign(locale.pages, supplement.pages || {});
        Object.assign(locale.legacy, supplement.legacy || {});
        locale.patterns.push(...(supplement.patterns || []));
        definition.pageKeys.forEach(pageKey => {
            locale.pageTranslations[pageKey] = {
                legacy: supplement.legacy || {},
                patterns: supplement.patterns || []
            };
        });
    });
    return locale;
}

function historyToMarkdown(history) {
    if (!history || typeof history !== 'object') return '';
    const lines = ['# ' + history.title, ''];
    if (history.intro) lines.push(history.intro, '');
    (history.sections || []).forEach(section => {
        lines.push('## ' + section.title, '');
        (section.versions || []).forEach(version => {
            lines.push('### ' + version.title, '');
            (version.items || []).forEach(item => lines.push('- ' + item));
            lines.push('');
        });
    });
    return lines.join('\n').trimEnd() + '\n';
}

function parseSections(markdown) {
    const sections = {};
    let current = null;
    markdown.split(/\r?\n/).forEach(line => {
        if (line.startsWith('## ')) {
            current = line.slice(3).trim();
            sections[current] = { versions: [], bullets: 0 };
        } else if (current && line.startsWith('### ')) {
            sections[current].versions.push(line.slice(4).trim());
        } else if (current && line.startsWith('- ')) {
            sections[current].bullets += 1;
        }
    });
    return sections;
}

function visibleHtml(html) {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<div id="inorobot-language-switcher"[\s\S]*?<\/div>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
}

function translateLegacySource(locale, source) {
    const normalized = String(source).replace(/\s+/g, ' ').trim();
    if (Object.prototype.hasOwnProperty.call(locale.legacy, normalized)) return locale.legacy[normalized];
    for (const item of locale.patterns || []) {
        if (!item || !item.source || typeof item.target !== 'string') continue;
        const expression = new RegExp(item.source);
        if (expression.test(normalized)) return normalized.replace(expression, item.target);
    }
    return normalized;
}

const locales = Object.fromEntries(localeCodes.map(code => [code, loadMergedLocale(code)]));
assert(fs.existsSync(path.join(root, 'favicon.png')), 'favicon.png is missing.');
[
    '0_Home/ko/index.html',
    '0_Home/kr/index.html',
    '0_Home/en/index.html',
    '0_Home/zh-CN/index.html',
    '0_Home/vi/index.html',
    '1_RobotModelSelect/index.html',
    '2_3DSimulation/index.html',
    '3_ToolSelector/index.html',
    '4_ProjectGenerator/index.html',
    '5_Software/index.html',
    '6_Document/index.html',
    '7_DebuggingTool/index.html',
    '7_DebuggingTool/ZeroCalibration/index.html'
].forEach(file => {
    assert(
        /<link\s+rel=["']icon["'][^>]*href=["']\/favicon\.png\?v=20260813["']/i.test(read(file)),
        file + ' is missing the site favicon link.'
    );
});
const siteCardVersions = parseSiteCardVersions(read('0_Home/site-card-versions.js'));
const versionHistory = loadVersionHistory(root);
const canonicalMarkdown = renderVersionHistory(versionHistory.locales.ko.versionHistory, true);
assert(read('0_Home/UPDATE_HISTORY.md') === canonicalMarkdown, 'UPDATE_HISTORY.md is out of sync with version-history.json.');
const embeddedHistoryMatch = read('0_Home/site-card-history-data.js').match(/BASE64 = '([^']+)'/);
assert(Boolean(embeddedHistoryMatch), 'site-card-history-data.js is missing its embedded history.');
if (embeddedHistoryMatch) {
    assert(Buffer.from(embeddedHistoryMatch[1], 'base64').toString('utf8') === canonicalMarkdown, 'site-card-history-data.js is out of sync with version-history.json.');
}
const localeBundleSource = read('Language/runtime/locales-data.js');
const localeBundleContext = { window: {} };
vm.runInNewContext(localeBundleSource, localeBundleContext);
const runtimeLocales = localeBundleContext.window.INOROBOT_LOCALES || {};
localeCodes.forEach(code => {
    assert(
        runtimeLocales[code]?.historyMarkdown === renderVersionHistory(versionHistory.locales[code].versionHistory),
        'Language/runtime/locales-data.js history is out of sync for ' + code + '.'
    );
    assert(
        runtimeLocales[code]?.debugHistoryMarkdown === renderVersionHistory(versionHistory.locales[code].debugVersionHistory),
        'Language/runtime/locales-data.js debug history is out of sync for ' + code + '.'
    );
});
const normalizedLocaleBundleSource = localeBundleSource.replace(/\r\n?/g, '\n');
const localeBundleCacheVersion = crypto.createHash('sha256').update(normalizedLocaleBundleSource).digest('hex').slice(0, 12);
assert(
    read('privacy/index.html').includes('/Language/runtime/locales-data.js?v=' + localeBundleCacheVersion + '"'),
    'privacy/index.html does not use the current locale bundle cache version.'
);

const robotDataContext = {};
vm.runInNewContext(read('1_RobotModelSelect/data.js') + '\nthis.__accessories = accessoriesList;', robotDataContext);
const accessorySources = [...new Set(robotDataContext.__accessories.flatMap(item => [item.name, item.description]).filter(Boolean))];
const technicalOptionName = /^(?:IRCB\d|IR-[A-Z0-9]|GL20-)/;
localeCodes.forEach(code => {
    ['가반 하중(kg)', '리치(mm)', 'Z축 길이(mm)', 'Standard (표준형)', 'High Flex (유연형)', '클린 사양 없음', '사양', '통신은 기본 제공됩니다.', '파워/엔코더 케이블', 'Pendant', 'Option :', 'Pins', '24 입력 / 16 출력'].forEach(source => {
        assert(Object.prototype.hasOwnProperty.call(locales[code].legacy, source), code + ' is missing Robot Select text: ' + source);
    });
    accessorySources.forEach(source => {
        assert(Object.prototype.hasOwnProperty.call(locales[code].legacy, source.trim()), code + ' is missing Robot Select option text: ' + source);
    });
});
['ko', 'zh-CN', 'vi'].forEach(code => {
    accessorySources.filter(source => !technicalOptionName.test(source.trim())).forEach(source => {
        assert(locales[code].legacy[source.trim()] !== source.trim(), code + ' leaves a Robot Select option untranslated: ' + source);
    });
});

const projectScriptSource = read('4_ProjectGenerator/app.js');
const optionDescriptionBlock = projectScriptSource.match(/const optDescs = \{([\s\S]*?)\n\s*\};\s*\n\s*const updateOptDesc/)?.[1] || '';
const optionDescriptionSources = [...optionDescriptionBlock.matchAll(/text:\s*(?:`([\s\S]*?)`|'([\s\S]*?)')\s*\}/g)]
    .flatMap(match => (match[1] || match[2] || '').replace(/<[^>]+>/g, '\n').split(/\r?\n/))
    .map(source => source.replace(/\s+/g, ' ').trim())
    .filter(source => /[가-힣]/.test(source));
assert(optionDescriptionSources.length > 20, 'Project option tooltip sources could not be inspected.');
const optionLabelSources = ['Multi Recipe', 'TCP Speed Monitoring', 'Torque Monitoring', 'Tool Control', 'Communication IO', 'Teaching Mode', 'Wait Position', 'Process Busy Signal'];
localeCodes.forEach(code => {
    [...optionLabelSources, ...optionDescriptionSources].forEach(source => {
        assert(Object.prototype.hasOwnProperty.call(locales[code].legacy, source), code + ' is missing Project option text: ' + source);
    });
});
targetLocaleCodes.forEach(code => {
    optionDescriptionSources.forEach(source => {
        assert(locales[code].legacy[source] !== source, code + ' leaves a Project option tooltip untranslated: ' + source);
    });
});
['ko', 'zh-CN', 'vi'].forEach(code => {
    optionLabelSources.forEach(source => {
        assert(locales[code].legacy[source] !== source, code + ' leaves a Project option label untranslated: ' + source);
    });
});

localeCodes.forEach(code => {
    assert(locales[code].legacy['Debugging Tool'] === 'Debugging Tool', code + ' must keep Debugging Tool in English.');
    assert(locales[code].pages.debugging.title === 'Debugging Tool | InoRobot Assistant', code + ' has the wrong Debugging Tool page title.');
    assert(Object.prototype.hasOwnProperty.call(locales[code].sources['debugging-tool.json'].legacy, 'Trace'), code + ' is missing the Trace card translation.');
});
assert(locales.ko.legacy.Trace === '트레이스', 'Korean Trace card title is not localized.');
assert(locales.en.legacy.Trace === 'Trace', 'English Trace card title is incorrect.');
assert(locales['zh-CN'].legacy.Trace === '轨迹监控', 'Chinese Trace card title is not localized.');
assert(locales.vi.legacy.Trace === 'Theo dõi tín hiệu', 'Vietnamese Trace card title is not localized.');

const requiredCoverageSources = [
    '모델 추가 모드',
    '엔코더 배터리 방전 등으로 인한 영점 소실 시, 하드웨어 지그 없이 소프트웨어적으로 영점을 보정하는 툴입니다.',
    '로봇 프로그램 검증용으로 상위 제어기 없이 PC에서 로봇과 통신 (Modbus-TCP, EtherNet/IP, MC, Socket)을 테스트 할 수 있는 소프트웨어입니다. 또한 HMI 화면을 사용자가 직접 구성하여 더 쉽게 로봇을 테스트 할 수 있습니다.',
    'InoRobotLab - Work origin 설정',
    'TP - Work origin 설정',
    'Work origin 설정 참고 이미지',
    'TP Work origin 설정 참고 이미지',
    'InoRobotLab 소프트웨어 (설치/무설치)',
    'Display 공정용 특수 버전 소프트웨어',
    'InoRobotTP 소프트웨어',
    'Display 공정용 TP 소프트웨어',
    '각 블록 무게중심의 위치를',
    '끝단 플랜지 원점으로부터의 거리(mm)',
    '로 Tool 좌표계 기준 입력합니다. 빨강=X, 초록=Y, 파랑=Z. 끝단 바깥쪽(+)·안쪽(−) 부호를 유지하세요.'
];
localeCodes.forEach(code => {
    requiredCoverageSources.forEach(source => {
        assert(Boolean(locales[code].legacy[source]), code + ' is missing required coverage for: ' + source);
    });
});
targetLocaleCodes.forEach(code => {
    requiredCoverageSources.forEach(source => {
        assert(locales[code].legacy[source] !== source, code + ' still uses the source text for: ' + source);
    });
});

const jsonFileSets = localeCodes.map(code => fs.readdirSync(path.join(root, 'Language', code))
    .filter(fileName => fileName.endsWith('.json'))
    .sort()
    .join('|'));
assert(new Set(jsonFileSets).size === 1, 'Locale directories must contain the same JSON source files.');
const expectedLocaleJsonFiles = localeFileDefinitions.map(definition => definition.file).sort().join('|');
jsonFileSets.forEach((files, index) => {
    assert(files === expectedLocaleJsonFiles, localeCodes[index] + ' must contain only the page-specific locale JSON files.');
});
['ui.json', 'content-centers.json', 'coverage.json', 'model-select.json', 'project-options.json', 'project.json', 'robot-tools.json', 'history.md', 'debug-history.md'].forEach(oldFile => {
    localeCodes.forEach(code => assert(!fs.existsSync(path.join(root, 'Language', code, oldFile)), 'Obsolete locale source still exists: Language/' + code + '/' + oldFile + '.'));
});

const expectedToolFolders = [
    '1_RobotModelSelect',
    '2_3DSimulation',
    '3_ToolSelector',
    '4_ProjectGenerator',
    '5_Software',
    '6_Document',
    '7_DebuggingTool'
];
expectedToolFolders.forEach(folder => {
    assert(fs.existsSync(path.join(root, folder, 'index.html')), folder + ' is missing its entry page.');
});
['Languge', 'i18n', 'templates', 'InoRobotSelect', 'InoRobot3DView', 'InoRobotToolSelect', 'InoRobotProjectGen', 'Software', 'Manual', 'DebuggingSupport', 'cn', 'en', 'kr', 'vn'].forEach(oldPath => {
    assert(!fs.existsSync(path.join(root, oldPath)), 'Obsolete root path still exists: ' + oldPath + '.');
});
assert(!fs.existsSync(path.join(root, 'index.html')), 'The generated Korean index must live under Language/ko.');
const traceDownloadArchive = path.join(root, '7_DebuggingTool', 'Trace', 'InoRobotTrace_V1.5.zip');
assert(fs.existsSync(traceDownloadArchive) && fs.statSync(traceDownloadArchive).size > 0, 'The current Trace download archive is missing.');
const traceV14Archive = path.join(root, '7_DebuggingTool', 'Trace', 'InoRobotTrace_V1.4.zip');
assert(!fs.existsSync(traceV14Archive), 'The retired Trace V1.4 download archive is still present.');
const releaseAssets = [
    ['7_DebuggingTool/CommunicationTester/InoRobot_Comm_Test_V3.0.zip', 'Communication Tester V3.0'],
    ['7_DebuggingTool/Trace/InoRobotTrace_V1.5.zip', 'Trace V1.5'],
    ['7_DebuggingTool/CADLightweight/CAD_Lightweight.zip', 'lightweight CAD archive']
];
releaseAssets.forEach(([relativePath, label]) => {
    const assetPath = path.join(root, relativePath);
    assert(fs.existsSync(assetPath) && fs.statSync(assetPath).size > 0, label + ' release asset is missing.');
});
const debuggingHtml = read('7_DebuggingTool/index.html');
assert(debuggingHtml.includes('CommunicationTester/InoRobot_Comm_Test_V3.0.zip')
    && debuggingHtml.includes('Trace/InoRobotTrace_V1.5.zip'), 'Debugging Tool does not link the current release archives.');
assert(!debuggingHtml.includes('InoRobot_Comm_Test_V2.8.zip') && !debuggingHtml.includes('InoRobotTrace_V1.4.zip'), 'Debugging Tool still links a retired release archive.');
const simulationHtml = read('2_3DSimulation/index.html');
assert(simulationHtml.includes('../7_DebuggingTool/Trace/InoRobotTrace_V1.5.zip')
    && !simulationHtml.includes('InoRobotTrace_V1.4.zip'), '3D Simulation does not link the current Trace archive.');
const documentScript = read('6_Document/script.js');
assert(documentScript.includes('IR-TS Series User Guide - Mechanical.pdf')
    && !documentScript.includes('IR-TS Series User Guide - Manipulator.pdf'), 'Document catalog contains an invalid IR-TS manual link.');
assert(!fs.existsSync(path.join(root, '4_ProjectGenerator', 'CNAME')), 'The duplicate Project Generator CNAME was not removed.');

const routes = [
    { file: '0_Home/ko/index.html', route: '/', locale: 'ko', canonical: 'https://inovancerobot.com/' },
    { file: '0_Home/kr/index.html', route: '/kr/', locale: 'ko', canonical: 'https://inovancerobot.com/' },
    { file: '0_Home/en/index.html', route: '/en/', locale: 'en', canonical: 'https://inovancerobot.com/en/' },
    { file: '0_Home/zh-CN/index.html', route: '/cn/', locale: 'zh-CN', canonical: 'https://inovancerobot.com/cn/' },
    { file: '0_Home/vi/index.html', route: '/vn/', locale: 'vi', canonical: 'https://inovancerobot.com/vn/' }
];
const requiredAlternates = ['ko', 'en', 'zh-CN', 'vi', 'x-default'];

routes.forEach(route => {
    const html = read(route.file);
    assert(html.includes('Generated by tools/build-localized-site.cjs'), route.file + ' is not generated by the locale build.');
    assert(html.includes('<html lang="' + route.locale + '"'), route.file + ' has the wrong html language.');
    assert(html.includes('rel="canonical" href="' + route.canonical + '"'), route.file + ' has the wrong canonical URL.');
    assert(html.includes('name="robots" content="index, follow'), route.file + ' is missing an indexable robots policy.');
    assert(html.includes('property="og:title"') && html.includes('property="og:description"'), route.file + ' is missing social metadata.');
    requiredAlternates.forEach(code => assert(html.includes('hreflang="' + code + '"'), route.file + ' is missing hreflang ' + code + '.'));
    const permalinkHeader = new RegExp('^---\\r?\\npermalink: ' + escapeRegExp(route.route) + '\\r?\\n---\\r?\\n');
    assert(permalinkHeader.test(html), route.file + ' is missing its stable public permalink.');
    assert(html.includes('/Language/runtime/locales-data.js') && html.includes('/Language/runtime/i18n.js'), route.file + ' is missing the i18n runtime.');
    assert(
        html.includes('/Language/runtime/locales-data.js?v=' + localeBundleCacheVersion + '"'),
        route.file + ' does not use the current locale bundle cache version.'
    );
    assert(html.includes('/Language/runtime/icon-fallback.js'), route.file + ' is missing the local icon fallback.');
    assert(html.includes('id="inorobot-language-switcher"') && html.includes('id="inorobot-language-select"'), route.file + ' is missing the top-right language UI.');
    assert(html.includes('<span class="inorobot-language-label" aria-hidden="true">Language</span>'), route.file + ' does not show the Language label.');
    assert(!html.includes('>文</span>'), route.file + ' still shows the Chinese language symbol.');
    assert(html.includes('position: fixed !important') && html.includes('top: calc(16px + env(safe-area-inset-top, 0px)) !important') && html.includes('right: 18px !important'), route.file + ' does not align the language UI with subpages.');
    assert(html.includes("const routes = { ko: '/', en: '/en/', 'zh-CN': '/cn/', vi: '/vn/' }") && html.includes('window.location.assign(target)'), route.file + ' is missing the standalone route switch handler.');
    validateStandaloneLanguageSwitch(html, route.file);
    assert(html.includes('<option value="' + route.locale + '" selected>'), route.file + ' does not preselect its route language.');
    const debuggingCardTitle = locales[route.locale].sources['home.json'].legacy['Debugging Tool'];
    assert(new RegExp('<h2[^>]*>\\s*' + escapeRegExp(debuggingCardTitle) + '\\s*<\\/h2>').test(html), route.file + ' has an incorrect Debugging Tool card name.');
    Object.entries(siteCardVersions).forEach(([key, version]) => {
        const pattern = new RegExp('data-site-card-version=["\']' + escapeRegExp(key) + '["\'][^>]*>\\s*Ver ' + escapeRegExp(formatCardVersion(version)) + '\\s*<\\/span>');
        assert(pattern.test(html), route.file + ' does not show the current ' + key + ' version.');
    });
    assert(!/data-site-card-version=["'][^"']+["'][^>]*>\s*Ver \d{2}\.\d{2}\.\d{2}\.\d+\s*<\/span>/.test(html), route.file + ' still shows a detailed card-version suffix.');
    if (targetLocaleCodes.includes(route.locale)) {
        assert(!/[가-힣]/.test(visibleHtml(html)), route.file + ' contains Korean visible initial HTML.');
        assert(html.includes('<title>' + locales[route.locale].pages.home.title + '</title>'), route.file + ' has an untranslated title.');
    }
});

const subpages = [
    { file: '1_RobotModelSelect/index.html', localeFile: 'robot-model-select.json', pageKey: 'robotSelect' },
    { file: '2_3DSimulation/index.html', localeFile: 'robot-3d-viewer.json', pageKey: 'robot3dViewer' },
    { file: '3_ToolSelector/index.html', localeFile: 'tool-selector.json', pageKey: 'toolSelector' },
    { file: '4_ProjectGenerator/index.html', localeFile: 'project-generator.json', pageKey: 'projectGenerator' },
    { file: '5_Software/index.html', localeFile: 'software.json', pageKey: 'software' },
    { file: '6_Document/index.html', localeFile: 'document.json', pageKey: 'manual' },
    { file: '7_DebuggingTool/index.html', localeFile: 'debugging-tool.json', pageKey: 'debugging' },
    { file: '7_DebuggingTool/ZeroCalibration/index.html', localeFile: 'debugging-tool.json', pageKey: 'zeroCalibration' }
];

subpages.forEach(({ file, localeFile, pageKey }) => {
    const html = read(file);
    assert(html.includes('/Language/runtime/i18n.css'), file + ' is missing locale styles.');
    assert(html.includes('/Language/runtime/locales-data.js') && html.includes('/Language/runtime/i18n.js'), file + ' is missing locale scripts.');
    assert(html.includes('/Language/runtime/icon-fallback.js'), file + ' is missing the local icon fallback.');
    assert(html.includes('Noto+Sans+KR') && html.includes('Noto+Sans+SC'), file + ' is missing multilingual fonts.');
    assert(html.includes('name="description"'), file + ' is missing a meta description.');
    assert(html.includes('SUBPAGE-SEO:START') && html.includes('property="og:title"'), file + ' is missing generated SEO metadata.');

    for (const match of html.matchAll(/data-i18n(?:-title|-placeholder|-aria-label|-alt)?=["']([^"']+)["']/g)) {
        const key = match[1];
        localeCodes.forEach(code => {
            assert(getByPath(locales[code].sources[localeFile], key) !== undefined, file + ' references ' + key + ' outside its ' + code + ' page locale file.');
        });
    }

    for (const match of visibleHtml(html).matchAll(/>([^<>]+)</g)) {
        const source = match[1].replace(/\s+/g, ' ').trim();
        if (!/[가-힣]/.test(source)) continue;
        targetLocaleCodes.forEach(code => {
            assert(translateLegacySource(locales[code].pageTranslations[pageKey], source) !== source, file + ' leaves a Korean text node outside its ' + code + ' page locale file: ' + source);
        });
    }
});

const runtime = read('Language/runtime/i18n.js');
assert(runtime.includes("const STORAGE_KEY = 'inorobot.locale'"), 'Runtime session key is missing.');
assert(runtime.includes('function translateFromPageData') && runtime.includes("get('pageTranslations.' + detectPageKey()"), 'Runtime does not prioritize the active page locale file.');
assert(runtime.includes('const storedLocale = readSharedLocale() || readSessionLocale();')
    && runtime.includes('const initialLocale = storedLocale || DEFAULT_LOCALE;'), 'Direct tool access does not prioritize the shared locale with a Korean fallback.');
assert(runtime.includes("currentPath === '/' && storedLocale && storedLocale !== DEFAULT_LOCALE")
    && runtime.includes('window.location.replace(targetPath)'), 'The canonical Korean landing route can overwrite a stored non-Korean locale.');
assert(runtime.includes("'/kr/': 'ko'") && runtime.includes("'/cn/': 'zh-CN'") && runtime.includes("'/vn/': 'vi'"), 'Landing route map is incomplete.');
assert(runtime.includes('function formatNumber') && runtime.includes('function formatDate'), 'Locale number/date formatters are missing.');
assert(runtime.includes('window.location.assign(LANDING_ROUTES[nextLocale])'), 'Landing language changes do not navigate to their localized route.');
assert(runtime.includes('new BroadcastChannel(CHANNEL_NAME)') && runtime.includes("window.addEventListener('storage'") && runtime.includes("window.addEventListener('pageshow'"), 'Locale changes are not synchronized across pages, tabs, and back-forward restoration.');
assert(runtime.includes('window.location.replace(targetPath)'), 'A restored landing page does not move to the current locale route.');
assert(runtime.includes("label.textContent = 'Language'") && !runtime.includes("icon.textContent = '文'"), 'Runtime language switcher has the wrong label.');
assert(runtime.includes("document.querySelector('[data-i18n-language-slot]')") && runtime.includes("container.dataset.embedded = languageSlot ? 'true' : 'false'"), 'Runtime does not support page-specific language switcher slots.');
['/', '/kr/', '/en/', '/cn/', '/vn/'].forEach(route => {
    assert(runtime.includes(`a[href="${route}"]`), 'Runtime does not refresh home links already pointing to ' + route + '.');
});
assert(runtime.includes("link.setAttribute('data-i18n-home-link', '')"), 'Runtime does not retain home links for later locale changes.');
const resolveInitialLocaleSource = extractNamedFunction(runtime, 'resolveInitialLocale');
assert(Boolean(resolveInitialLocaleSource), 'Runtime initial-locale resolver cannot be tested.');
if (resolveInitialLocaleSource) {
    function testInitialLocaleScenario({ pathname, routeLocale, sharedLocale, sessionLocale }) {
        const result = { replacements: [], persisted: [], sessionWrites: [] };
        const context = {
            window: {
                location: {
                    pathname,
                    replace(target) { result.replacements.push(target); }
                }
            },
            DEFAULT_LOCALE: 'ko',
            LANDING_ROUTES: { ko: '/', en: '/en/', 'zh-CN': '/cn/', vi: '/vn/' },
            getRouteLocale: () => routeLocale,
            readSharedLocale: () => sharedLocale,
            readSessionLocale: () => sessionLocale,
            writeSessionLocale(locale) { result.sessionWrites.push(locale); },
            persistLocale(locale) { result.persisted.push(locale); },
            normalizePath(value) {
                const normalized = String(value || '/').replace(/\/index\.html$/i, '/');
                return normalized.endsWith('/') ? normalized : normalized + '/';
            }
        };
        vm.runInNewContext(`${resolveInitialLocaleSource}; this.selectedLocale = resolveInitialLocale();`, context);
        return { ...result, selectedLocale: context.selectedLocale };
    }

    const storedEnglishHome = testInitialLocaleScenario({
        pathname: '/',
        routeLocale: 'ko',
        sharedLocale: 'en',
        sessionLocale: null
    });
    assert(storedEnglishHome.selectedLocale === 'en'
        && storedEnglishHome.replacements.at(-1) === '/en/'
        && !storedEnglishHome.persisted.includes('ko'), 'Returning home after a tool-page language change resets the locale to Korean.');

    const freshKoreanHome = testInitialLocaleScenario({
        pathname: '/',
        routeLocale: 'ko',
        sharedLocale: null,
        sessionLocale: null
    });
    assert(freshKoreanHome.selectedLocale === 'ko'
        && freshKoreanHome.persisted.at(-1) === 'ko'
        && freshKoreanHome.replacements.length === 0, 'A fresh canonical home visit does not default to Korean.');

    const explicitEnglishRoute = testInitialLocaleScenario({
        pathname: '/en/',
        routeLocale: 'en',
        sharedLocale: 'zh-CN',
        sessionLocale: null
    });
    assert(explicitEnglishRoute.selectedLocale === 'en'
        && explicitEnglishRoute.persisted.at(-1) === 'en'
        && explicitEnglishRoute.replacements.length === 0, 'An explicit localized landing route does not override the stored locale.');
}
const localServer = read('tools/serve-local.cjs');
['0_Home/ko/index.html', '0_Home/kr/index.html', '0_Home/en/index.html', '0_Home/zh-CN/index.html', '0_Home/vi/index.html'].forEach(file => {
    assert(localServer.includes(file), 'Local server is missing landing-page mapping for ' + file + '.');
});
['.git', '.wrangler', 'backups', 'publish-stability', 'tmp'].forEach(segment => {
    assert(localServer.includes("'" + segment + "'"), 'Local server must block sensitive path segment ' + segment + '.');
});
const updateHomeLinksSource = extractNamedFunction(runtime, 'updateHomeLinks');
assert(Boolean(updateHomeLinksSource), 'Runtime home-link updater cannot be tested.');
if (updateHomeLinksSource) {
    const homeLink = {
        attributes: { href: '/' },
        setAttribute(name, value) { this.attributes[name] = value; }
    };
    vm.runInNewContext(`
        let currentLocale = 'zh-CN';
        const LANDING_ROUTES = { ko: '/', en: '/en/', 'zh-CN': '/cn/', vi: '/vn/' };
        ${updateHomeLinksSource}
        updateHomeLinks();
        currentLocale = 'en';
        updateHomeLinks();
    `, { document: { querySelectorAll: () => [homeLink] } });
    assert(homeLink.attributes.href === '/en/', 'A home link remains on the previous landing locale after a tool-page language change.');
    assert(Object.prototype.hasOwnProperty.call(homeLink.attributes, 'data-i18n-home-link'), 'A localized home link is not retained for later locale changes.');
}
const localeStyles = read('Language/runtime/i18n.css');
assert(localeStyles.includes('position: fixed !important') && localeStyles.includes('right: 18px !important') && localeStyles.includes('left: auto !important'), 'The language UI is not fixed to the upper-right corner.');
assert(localeStyles.includes('top: calc(16px + env(safe-area-inset-top, 0px)) !important'), 'The language UI is not positioned inside the desktop top bar.');
const languageLabelStyle = localeStyles.match(/\.inorobot-language-label\s*\{([\s\S]*?)\}/)?.[1] || '';
assert(!/text-transform\s*:\s*uppercase/i.test(languageLabelStyle), 'The Language label is still forced to uppercase.');
assert(localeStyles.includes('.inorobot-language-switcher[data-embedded="true"]') && localeStyles.includes('position: static !important'), 'Embedded language switchers are not detached from the global fixed position.');

const projectHtml = read('4_ProjectGenerator/index.html');
assert(projectHtml.indexOf('data-i18n-language-slot') < projectHtml.indexOf('id="btnGuide"'), 'Project Generator language switcher is not placed left of Guide.');
const viewerHtml = read('2_3DSimulation/index.html');
const viewerStyles = read('2_3DSimulation/style.css');
const viewerLanguageSlot = viewerHtml.indexOf('data-i18n-language-slot');
assert(viewerLanguageSlot > viewerHtml.indexOf('<div class="topbar-right">')
    && viewerLanguageSlot < viewerHtml.indexOf('</header>'), '3D Simulation language switcher is not inside the top-right bar.');
assert(viewerStyles.includes('.viewer-language-row .inorobot-language-switcher')
    && viewerStyles.includes('position: static;'), '3D Simulation language switcher is not embedded in the top-right bar.');
assert(read('6_Document/index.html').includes('data-cat="pendant">Pendant</button>'), 'Document Pendant tab is not using the translatable source label.');
assert(/<h1\b[^>]*data-i18n-skip[^>]*>\s*Software Download Center\s*<\/h1>/.test(read('5_Software/index.html')), 'Software page header name is not fixed in English.');
assert(/<h1\b[^>]*data-i18n-skip[^>]*>\s*Technical Manual Center\s*<\/h1>/.test(read('6_Document/index.html')), 'Document page header name is not fixed in English.');

const protectedScripts = read('6_Document/script.js') + '\n' + read('5_Software/script.js');
assert(!protectedScripts.includes('data.message ||'), 'A raw server error message can still be shown to users.');
assert(protectedScripts.includes('translateUiText'), 'Protected content prompts are not localized.');
assert(protectedScripts.includes('fetch(WORKER_URL'), 'Protected Manual/Software authentication requests are missing.');

const robotSelectScript = read('1_RobotModelSelect/script.js');
assert(robotSelectScript.includes('html2pdf().set(sheet.dlObj)'), 'Robot Select PDF generation hook is missing.');
assert(robotSelectScript.includes('new JSZip()') && robotSelectScript.includes('saveAs(content'), 'Robot Select CAD ZIP generation hook is missing.');
assert(robotSelectScript.includes('uiText(filterCategory.label)') && robotSelectScript.includes("uiText('가반 하중 (kg)')"), 'Robot Select dynamic filters or specification labels are not localized.');
assert(robotSelectScript.includes('window.InoRobotI18n.apply(modalBody)') && robotSelectScript.includes('pdfFooterText'), 'Robot Select options or PDF footer are not localized.');
assert(robotSelectScript.includes("uiText('현재 구매 코드')") && robotSelectScript.includes("uiText('제품 상세 및 구성')"), 'Robot Select composed headings are not localized.');
assert(robotSelectScript.includes("uiText('파워/엔코더 케이블')") && robotSelectScript.includes('uiText(cableType)'), 'Robot Select PDF cable details are not localized.');
assert(robotSelectScript.includes('uiText(acc.description)') && robotSelectScript.includes('localizeDisplayText(option.spec)'), 'Robot Select option descriptions are not localized.');
assert(robotSelectScript.includes("['클린 사양 없음', 'Option :']") && robotSelectScript.includes("uiText('Pins')") && robotSelectScript.includes('formatSignalPins('), 'Robot Select Option or Pin composites are not localized.');
assert(robotSelectScript.includes('(?:Signal\\s+)?lines?'), 'Robot Select detail specifications can still show Lines instead of localized Pins.');
assert(robotSelectScript.includes('captureModalSelections') && robotSelectScript.includes('restoreModalSelections'), 'Robot Select does not preserve modal selections while changing language.');
const projectScript = read('4_ProjectGenerator/app.js');
assert(projectScript.includes('new JSZip()') && projectScript.includes('zip.generateAsync') && projectScript.includes('saveAs(blob'), 'Project ZIP generation hook is missing.');
assert(projectScript.includes("uiText('Option Info')") && projectScript.includes('window.InoRobotI18n.apply(description)'), 'Project option guide descriptions are not localized.');
assert(projectScript.includes('window.InoRobotI18n.apply(optionsModal)'), 'Project option items are not explicitly localized when the modal opens.');
const viewerScript = read('2_3DSimulation/main.js');
assert(viewerScript.includes("uiText('모델 추가 모드')") && viewerScript.includes("'inorobot:languagechange', refreshLocalizedControls"), '3D Simulation dynamic controls are not localized.');
const simulationModels = JSON.parse(read('2_3DSimulation/models/models.json'));
let simulationModelGroup = '';
let articulatedRobotCount = 0;
simulationModels.forEach(model => {
    if (model.group) {
        simulationModelGroup = model.group;
        return;
    }
    if (simulationModelGroup === 'Controller') return;
    articulatedRobotCount += 1;
    assert(model.type === 'articulated-stl', model.name + ' does not support articulated JOG.');
    assert(['scara', 'six-axis'].includes(model.robotType), model.name + ' has an invalid robot type.');
    const isScara = model.robotType === 'scara';
    assert(Array.isArray(model.structure) && model.structure.length === (isScara ? 4 : 6), model.name + ' has invalid kinematic structure data.');
    assert(Array.isArray(model.limits) && model.limits.length === (isScara ? 4 : 6), model.name + ' has invalid joint limits.');
    const linkIndices = isScara ? [0, 1, 2, ...(model.j3Mesh ? [3] : []), 4] : [0, 1, 2, 3, 4, 5, 6];
    linkIndices.forEach(index => {
        const linkPath = path.join(root, '2_3DSimulation', 'models', model.folder, `P${index}.stl`);
        assert(fs.existsSync(linkPath) && fs.statSync(linkPath).size > 0, model.name + ` is missing P${index}.stl.`);
    });
});
assert(articulatedRobotCount === 29, '3D Simulation robot catalog count is not 29.');
const softwareScript = read('5_Software/script.js');
assert(softwareScript.includes('translateUiText(dl.label)') && softwareScript.includes('translateUiText(ver.description)'), 'Software descriptions or download buttons are not localized.');
const toolSelector = read('3_ToolSelector/index.html');
assert(toolSelector.includes('function calculate()'), 'Tool Selector calculation hook is missing.');
assert(toolSelector.includes("uiText('형식 SCARA')") && toolSelector.includes("uiText('부하 무게중심 기준 관성모멘트 산출값')"), 'Tool Selector dynamic labels are not localized.');
assert(toolSelector.includes('.card:has(.info-wrap:hover)') && toolSelector.includes('z-index:2147483002'), 'Tool Selector info tooltips are not layered above the surrounding controls.');
for (const [index, match] of [...toolSelector.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)].entries()) {
    const attributes = match[1] || '';
    const source = match[2] || '';
    if (/\btype=["'](?:importmap|application\/json)["']/i.test(attributes) || !source.trim()) continue;
    try {
        new vm.Script(source, { filename: '3_ToolSelector-inline-' + (index + 1) + '.js' });
    } catch (error) {
        assert(false, 'Tool Selector inline script does not compile: ' + error.message);
    }
}
const debuggingHistoryScript = read('7_DebuggingTool/debugging-history.js');
assert(debuggingHistoryScript.includes('window.InoRobotI18n.translate(message)'), 'Debugging Tool dynamic messages are not localized.');
assert(debuggingHistoryScript.includes('window.InoRobotI18n.translate(tool.title)'), 'Debugging Tool history titles are not localized.');
const zeroCalibration = read('7_DebuggingTool/ZeroCalibration/index.html');
assert(zeroCalibration.includes('function calculate(index)') && zeroCalibration.includes('function downloadOfflineTool()'), 'Zero Calibration calculation or offline download hook is missing.');

const homeTemplate = read('0_Home/home.template.html');
[
    '0_Home/home.template.html',
    '0_Home/ko/index.html',
    '0_Home/kr/index.html',
    '0_Home/en/index.html',
    '0_Home/zh-CN/index.html',
    '0_Home/vi/index.html'
].forEach(file => {
    const source = read(file);
    const scriptCount = (source.match(/src=["']\/visitor-counter\.js\?v=20260812-1["']/g) || []).length;
    const counterCount = (source.match(/id=["']visit-count["']/g) || []).length;
    assert(scriptCount === 1, file + ' must load visitor-counter.js exactly once.');
    assert(counterCount === 1, file + ' must contain exactly one visit-count element.');
    assert(/id=["']visit-count["'][^>]*>visits 2,031<\/span>/.test(source), file + ' must preserve the verified 2,031 visit snapshot.');
    assert(!/<span[^>]*id=["']visit-count["'][^>]*data-i18n-skip/i.test(source), file + ' prevents the visit count from being localized.');
});
[
    ['/1_RobotModelSelect/INOVANCE_Logo.png', '1_RobotModelSelect/INOVANCE_Logo.png']
].forEach(([webPath, filePath]) => {
    assert(homeTemplate.includes('src="' + webPath + '"'), 'Home template does not use the absolute image path ' + webPath + '.');
    const image = readBuffer(filePath);
    assert(image.length > 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), filePath + ' is not a valid PNG asset.');
});
assert(homeTemplate.includes('data-lucide="bot"') && homeTemplate.includes('data-lucide="file-code-2"'), 'Home cards do not use the shared Lucide icon style.');
assert(homeTemplate.includes('이노로봇') && homeTemplate.includes('이노밴스 로봇') && homeTemplate.includes('INOVANCE robot'), 'Home SEO copy is missing the target brand terms.');
assert(!homeTemplate.includes('robot_select_icon_simple_') && !homeTemplate.includes('project_gen_icon_simple_'), 'Home template still references the removed one-off PNG icons.');
assert(homeTemplate.includes('src="/0_Home/site-card-versions.js') && homeTemplate.includes('src="/0_Home/site-card-history-data.js') && homeTemplate.includes('src="/0_Home/site-card-history.js'), 'Home template does not load its scripts from 0_Home.');
['1_RobotModelSelect', '2_3DSimulation', '3_ToolSelector', '4_ProjectGenerator', '5_Software', '6_Document', '7_DebuggingTool'].forEach(folder => {
    assert(homeTemplate.includes('href="/' + folder + '/"'), 'Home card does not use an absolute route for ' + folder + '.');
});
['robot_select_icon_simple_1774428251953.png', 'project_gen_icon_simple_1774428268885.png'].forEach(file => {
    assert(!fs.existsSync(path.join(root, file)), 'Unused root icon still exists: ' + file + '.');
});
['UPDATE_HISTORY.md', 'site-card-history.js', 'site-card-history-data.js', 'site-card-versions.js'].forEach(file => {
    assert(!fs.existsSync(path.join(root, file)), 'Home-only file still exists at the repository root: ' + file + '.');
    assert(fs.existsSync(path.join(root, '0_Home', file)), '0_Home is missing ' + file + '.');
});
['ko', 'kr', 'en', 'zh-CN', 'vi'].forEach(code => {
    assert(!fs.existsSync(path.join(root, 'Language', code, 'index.html')), 'Generated home page still exists inside Language/' + code + '.');
});
assert(read('7_DebuggingTool/index.html').includes('data-i18n-skip>Debugging Tool</h1>'), 'Debugging Tool page heading is not fixed in English.');

localeCodes.forEach(code => {
    const homeSource = locales[code].sources['home.json'];
    assert(!homeSource.versionHistory && !homeSource.debugVersionHistory, code + '/home.json still contains legacy version-history data.');
    localeFileDefinitions.filter(definition => definition.file !== 'home.json').forEach(definition => {
        const source = locales[code].sources[definition.file];
        assert(!source.versionHistory && !source.debugVersionHistory, code + '/' + definition.file + ' must not contain version history.');
    });
});

const sourceHistory = parseSections(historyToMarkdown(versionHistory.locales.ko.versionHistory));
const cardVersionSections = {
    robotSelect: 'Robot Model Select',
    robot3dViewer: '3D Simulation',
    toolSelector: 'Robot Tool Selector',
    projectGenerator: 'Project Generator',
    software: 'Software',
    manual: 'Document',
    debuggingTool: 'Debugging Tool'
};
Object.entries(cardVersionSections).forEach(([key, section]) => {
    assert(sourceHistory[section] && sourceHistory[section].versions[0] === 'Ver ' + siteCardVersions[key], key + ' card version does not match the latest update history entry.');
    assert(siteCardVersions[key] === versionHistory.cardVersions[key], key + ' card version does not match version-history.json.');
});
const cardSections = ['Robot Model Select', '3D Simulation', 'Robot Tool Selector', 'Project Generator', 'Software', 'Document', 'Debugging Tool'];
targetLocaleCodes.forEach(code => {
    const localized = parseSections(historyToMarkdown(versionHistory.locales[code].versionHistory));
    cardSections.forEach(section => {
        assert(Boolean(localized[section]), code + ' history is missing ' + section + '.');
        if (!localized[section]) return;
        assert(localized[section].versions.join('|') === sourceHistory[section].versions.join('|'), code + ' history versions differ for ' + section + '.');
        assert(localized[section].bullets === sourceHistory[section].bullets, code + ' history entry count differs for ' + section + '.');
    });
});
const chineseHomeHistory = JSON.stringify({
    versionHistory: versionHistory.locales['zh-CN'].versionHistory,
    debugVersionHistory: versionHistory.locales['zh-CN'].debugVersionHistory
});
assert(!/\*\*【[^】]+】\*\*/.test(chineseHomeHistory), 'Chinese version history still shows a bold category prefix.');

const debugSources = parseSections(historyToMarkdown(versionHistory.locales.ko.debugVersionHistory));
targetLocaleCodes.forEach(code => {
    const localized = parseSections(historyToMarkdown(versionHistory.locales[code].debugVersionHistory));
    Object.entries(debugSources).forEach(([section, source]) => {
        assert(Boolean(localized[section]), code + ' debugging history is missing ' + section + '.');
        if (!localized[section]) return;
        assert(localized[section].versions.join('|') === source.versions.join('|'), code + ' debugging history versions differ for ' + section + '.');
        assert(localized[section].bullets === source.bullets, code + ' debugging history entry count differs for ' + section + '.');
    });
});

const sitemap = read('sitemap.xml');
['/', '/en/', '/cn/', '/vn/', '/1_RobotModelSelect/', '/2_3DSimulation/', '/3_ToolSelector/', '/4_ProjectGenerator/', '/5_Software/', '/6_Document/', '/7_DebuggingTool/', '/7_DebuggingTool/ZeroCalibration/'].forEach(route => assert(sitemap.includes('<loc>https://inovancerobot.com' + route + '</loc>'), 'Sitemap is missing ' + route + '.'));
assert(!sitemap.includes('/kr/'), 'The non-canonical /kr/ route must not be in the sitemap.');
const robots = read('robots.txt');
assert(robots.includes('User-agent: *') && robots.includes('Allow: /') && robots.includes('Sitemap: https://inovancerobot.com/sitemap.xml'), 'robots.txt does not allow crawling or advertise the sitemap.');

if (failures.length) {
    console.error('Multilingual validation failed:\n- ' + failures.join('\n- '));
    process.exit(1);
}

console.log('Multilingual validation passed: 5 landing routes, 8 shared tool pages, 4 locales, complete version histories.');
