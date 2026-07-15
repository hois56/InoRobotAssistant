const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const localeCodes = ['ko', 'en', 'zh-CN', 'vi'];
const targetLocaleCodes = ['en', 'zh-CN', 'vi'];
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
    const writes = [];
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
            sessionStorage: { setItem: (key, value) => writes.push([key, value]) },
            location: { assign: value => assignments.push(value) }
        }
    });

    assert(select.dataset.localeListener === 'true' && typeof changeHandler === 'function', file + ' does not attach the language change event.');
    if (typeof changeHandler !== 'function') return;
    Object.entries({ ko: '/', en: '/en/', 'zh-CN': '/cn/', vi: '/vn/' }).forEach(([locale, route]) => {
        select.value = locale;
        changeHandler();
        assert(assignments.at(-1) === route, file + ' does not navigate ' + locale + ' to ' + route + '.');
        assert(writes.at(-1).join('|') === 'inorobot.locale|' + locale, file + ' does not persist the ' + locale + ' session locale.');
    });
}

function loadMergedLocale(code) {
    const localeDir = path.join(root, 'Languge', code);
    const locale = readJson(path.join('Languge', code, 'ui.json'));
    fs.readdirSync(localeDir)
        .filter(fileName => fileName.endsWith('.json') && fileName !== 'ui.json')
        .sort()
        .forEach(fileName => {
            const supplement = JSON.parse(fs.readFileSync(path.join(localeDir, fileName), 'utf8'));
            Object.assign(locale.legacy, supplement.legacy || {});
            locale.patterns.push(...(supplement.patterns || []));
        });
    return locale;
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
const siteCardVersions = parseSiteCardVersions(read('site-card-versions.js'));

localeCodes.forEach(code => {
    assert(locales[code].legacy['Debugging Tool'] === 'Debugging Tool', code + ' must keep Debugging Tool in English.');
    assert(locales[code].pages.debugging.title === 'Debugging Tool | InoRobot Assistant', code + ' has the wrong Debugging Tool page title.');
});

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

const jsonFileSets = localeCodes.map(code => fs.readdirSync(path.join(root, 'Languge', code))
    .filter(fileName => fileName.endsWith('.json'))
    .sort()
    .join('|'));
assert(new Set(jsonFileSets).size === 1, 'Locale directories must contain the same JSON source files.');

const routes = [
    { file: 'index.html', locale: 'ko', canonical: 'https://inovancerobot.com/' },
    { file: 'kr/index.html', locale: 'ko', canonical: 'https://inovancerobot.com/' },
    { file: 'en/index.html', locale: 'en', canonical: 'https://inovancerobot.com/en/' },
    { file: 'cn/index.html', locale: 'zh-CN', canonical: 'https://inovancerobot.com/cn/' },
    { file: 'vn/index.html', locale: 'vi', canonical: 'https://inovancerobot.com/vn/' }
];
const requiredAlternates = ['ko', 'en', 'zh-CN', 'vi', 'x-default'];

routes.forEach(route => {
    const html = read(route.file);
    assert(html.includes('Generated by tools/build-localized-site.cjs'), route.file + ' is not generated by the locale build.');
    assert(html.includes('<html lang="' + route.locale + '"'), route.file + ' has the wrong html language.');
    assert(html.includes('rel="canonical" href="' + route.canonical + '"'), route.file + ' has the wrong canonical URL.');
    requiredAlternates.forEach(code => assert(html.includes('hreflang="' + code + '"'), route.file + ' is missing hreflang ' + code + '.'));
    assert(html.includes('/i18n/locales-data.js') && html.includes('/i18n/i18n.js'), route.file + ' is missing the i18n runtime.');
    assert(html.includes('/i18n/icon-fallback.js'), route.file + ' is missing the local icon fallback.');
    assert(html.includes('id="inorobot-language-switcher"') && html.includes('id="inorobot-language-select"'), route.file + ' is missing the top-right language UI.');
    assert(html.includes('<span class="inorobot-language-label" aria-hidden="true">Language</span>'), route.file + ' does not show the Language label.');
    assert(!html.includes('>文</span>'), route.file + ' still shows the Chinese language symbol.');
    assert(html.includes('position: fixed !important') && html.includes('right: calc(14px + env(safe-area-inset-right, 0px)) !important'), route.file + ' does not force the language UI to the upper-right corner.');
    assert(html.includes("const routes = { ko: '/', en: '/en/', 'zh-CN': '/cn/', vi: '/vn/' }") && html.includes('window.location.assign(target)'), route.file + ' is missing the standalone route switch handler.');
    validateStandaloneLanguageSwitch(html, route.file);
    assert(html.includes('<option value="' + route.locale + '" selected>'), route.file + ' does not preselect its route language.');
    assert(/<h2[^>]*data-i18n-skip[^>]*>\s*Debugging Tool\s*<\/h2>/.test(html), route.file + ' translates the Debugging Tool card name.');
    Object.entries(siteCardVersions).forEach(([key, version]) => {
        const pattern = new RegExp('data-site-card-version=["\']' + escapeRegExp(key) + '["\'][^>]*>\\s*Ver ' + escapeRegExp(version) + '\\s*<\\/span>');
        assert(pattern.test(html), route.file + ' does not show the current ' + key + ' version.');
    });
    if (targetLocaleCodes.includes(route.locale)) {
        assert(!/[가-힣]/.test(visibleHtml(html)), route.file + ' contains Korean visible initial HTML.');
        assert(html.includes('<title>' + locales[route.locale].pages.home.title + '</title>'), route.file + ' has an untranslated title.');
    }
});

const subpages = [
    'InoRobotSelect/index.html',
    'InoRobot3DView/index.html',
    'InoRobotToolSelect/index.html',
    'InoRobotProjectGen/index.html',
    'Software/index.html',
    'Manual/index.html',
    'DebuggingSupport/index.html',
    'DebuggingSupport/ZeroCalibration/index.html'
];

subpages.forEach(file => {
    const html = read(file);
    assert(html.includes('/i18n/i18n.css'), file + ' is missing locale styles.');
    assert(html.includes('/i18n/locales-data.js') && html.includes('/i18n/i18n.js'), file + ' is missing locale scripts.');
    assert(html.includes('/i18n/icon-fallback.js'), file + ' is missing the local icon fallback.');
    assert(html.includes('Noto+Sans+KR') && html.includes('Noto+Sans+SC'), file + ' is missing multilingual fonts.');

    for (const match of html.matchAll(/data-i18n(?:-title|-placeholder|-aria-label|-alt)?=["']([^"']+)["']/g)) {
        const key = match[1];
        localeCodes.forEach(code => assert(getByPath(locales[code], key) !== undefined, file + ' references missing ' + code + ' key ' + key + '.'));
    }

    for (const match of visibleHtml(html).matchAll(/>([^<>]+)</g)) {
        const source = match[1].replace(/\s+/g, ' ').trim();
        if (!/[가-힣]/.test(source)) continue;
        targetLocaleCodes.forEach(code => {
            assert(translateLegacySource(locales[code], source) !== source, file + ' leaves a Korean text node untranslated in ' + code + ': ' + source);
        });
    }
});

const runtime = read('i18n/i18n.js');
assert(runtime.includes("const STORAGE_KEY = 'inorobot.locale'"), 'Runtime session key is missing.');
assert(runtime.includes("return readSessionLocale() || DEFAULT_LOCALE"), 'Direct tool access does not default to Korean.');
assert(runtime.includes("'/kr/': 'ko'") && runtime.includes("'/cn/': 'zh-CN'") && runtime.includes("'/vn/': 'vi'"), 'Landing route map is incomplete.');
assert(runtime.includes('function formatNumber') && runtime.includes('function formatDate'), 'Locale number/date formatters are missing.');
assert(runtime.includes('window.location.assign(LANDING_ROUTES[nextLocale])'), 'Landing language changes do not navigate to their localized route.');
assert(runtime.includes("label.textContent = 'Language'") && !runtime.includes("icon.textContent = '文'"), 'Runtime language switcher has the wrong label.');
['/', '/kr/', '/en/', '/cn/', '/vn/'].forEach(route => {
    assert(runtime.includes(`a[href="${route}"]`), 'Runtime does not refresh home links already pointing to ' + route + '.');
});
assert(runtime.includes("link.setAttribute('data-i18n-home-link', '')"), 'Runtime does not retain home links for later locale changes.');
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
const localeStyles = read('i18n/i18n.css');
assert(localeStyles.includes('position: fixed !important') && localeStyles.includes('right: 18px !important') && localeStyles.includes('left: auto !important'), 'The language UI is not fixed to the upper-right corner.');
assert(localeStyles.includes('top: calc(16px + env(safe-area-inset-top, 0px)) !important'), 'The language UI is not positioned inside the desktop top bar.');
const languageLabelStyle = localeStyles.match(/\.inorobot-language-label\s*\{([\s\S]*?)\}/)?.[1] || '';
assert(!/text-transform\s*:\s*uppercase/i.test(languageLabelStyle), 'The Language label is still forced to uppercase.');

const protectedScripts = read('Manual/script.js') + '\n' + read('Software/script.js');
assert(!protectedScripts.includes('data.message ||'), 'A raw server error message can still be shown to users.');
assert(protectedScripts.includes('translateUiText'), 'Protected content prompts are not localized.');
assert(protectedScripts.includes('fetch(WORKER_URL'), 'Protected Manual/Software authentication requests are missing.');

const robotSelectScript = read('InoRobotSelect/script.js');
assert(robotSelectScript.includes('html2pdf().set(dlObj)'), 'Robot Select PDF generation hook is missing.');
assert(robotSelectScript.includes('new JSZip()') && robotSelectScript.includes('saveAs(content'), 'Robot Select CAD ZIP generation hook is missing.');
assert(robotSelectScript.includes('uiText(filterCategory.label)') && robotSelectScript.includes("uiText('가반 하중 (kg)')"), 'Robot Select dynamic filters or specification labels are not localized.');
assert(robotSelectScript.includes('window.InoRobotI18n.apply(modalBody)') && robotSelectScript.includes('pdfFooterText'), 'Robot Select options or PDF footer are not localized.');
const projectScript = read('InoRobotProjectGen/app.js');
assert(projectScript.includes('new JSZip()') && projectScript.includes('zip.generateAsync') && projectScript.includes('saveAs(blob'), 'Project ZIP generation hook is missing.');
assert(projectScript.includes("uiText('Option Info')") && projectScript.includes('window.InoRobotI18n.apply(description)'), 'Project option guide descriptions are not localized.');
const viewerScript = read('InoRobot3DView/main.js');
assert(viewerScript.includes("uiText('모델 추가 모드')") && viewerScript.includes("'inorobot:languagechange', refreshLocalizedControls"), '3D Viewer dynamic controls are not localized.');
const softwareScript = read('Software/script.js');
assert(softwareScript.includes('translateUiText(dl.label)') && softwareScript.includes('translateUiText(ver.description)'), 'Software descriptions or download buttons are not localized.');
const toolSelector = read('InoRobotToolSelect/index.html');
assert(toolSelector.includes('function calculate()'), 'Tool Selector calculation hook is missing.');
assert(toolSelector.includes("uiText('형식 SCARA')") && toolSelector.includes("uiText('부하 무게중심 기준 관성모멘트 산출값')"), 'Tool Selector dynamic labels are not localized.');
for (const [index, match] of [...toolSelector.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].entries()) {
    if (!match[1].trim()) continue;
    try {
        new vm.Script(match[1], { filename: 'InoRobotToolSelect-inline-' + (index + 1) + '.js' });
    } catch (error) {
        assert(false, 'Tool Selector inline script does not compile: ' + error.message);
    }
}
assert(read('DebuggingSupport/debugging-history.js').includes('window.InoRobotI18n.translate(message)'), 'Debugging Tool dynamic messages are not localized.');
const zeroCalibration = read('DebuggingSupport/ZeroCalibration/index.html');
assert(zeroCalibration.includes('function calculate(index)') && zeroCalibration.includes('function downloadOfflineTool()'), 'Zero Calibration calculation or offline download hook is missing.');

const homeTemplate = read('templates/home.template.html');
[
    ['/InoRobotSelect/INOVANCE_Logo.png', 'InoRobotSelect/INOVANCE_Logo.png'],
    ['/robot_select_icon_simple_1774428251953.png', 'robot_select_icon_simple_1774428251953.png'],
    ['/project_gen_icon_simple_1774428268885.png', 'project_gen_icon_simple_1774428268885.png']
].forEach(([webPath, filePath]) => {
    assert(homeTemplate.includes('src="' + webPath + '"'), 'Home template does not use the absolute image path ' + webPath + '.');
    const image = readBuffer(filePath);
    assert(image.length > 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), filePath + ' is not a valid PNG asset.');
});
assert(read('DebuggingSupport/index.html').includes('data-i18n-skip>Debugging Tool</h1>'), 'Debugging Tool page heading is not fixed in English.');

const sourceHistory = parseSections(read('UPDATE_HISTORY.md'));
const cardVersionSections = {
    robotSelect: 'Robot Model Select',
    robot3dViewer: 'Robot 3D Viewer',
    toolSelector: 'Robot Tool Selector',
    projectGenerator: 'Project Generator',
    software: 'Software',
    manual: 'Document',
    debuggingTool: 'Debugging Tool'
};
Object.entries(cardVersionSections).forEach(([key, section]) => {
    assert(sourceHistory[section] && sourceHistory[section].versions[0] === 'Ver ' + siteCardVersions[key], key + ' card version does not match the latest update history entry.');
});
const cardSections = ['Robot Model Select', 'Robot 3D Viewer', 'Robot Tool Selector', 'Project Generator', 'Software', 'Document', 'Debugging Tool'];
targetLocaleCodes.forEach(code => {
    const localized = parseSections(read(path.join('Languge', code, 'history.md')));
    cardSections.forEach(section => {
        assert(Boolean(localized[section]), code + ' history is missing ' + section + '.');
        if (!localized[section]) return;
        assert(localized[section].versions.join('|') === sourceHistory[section].versions.join('|'), code + ' history versions differ for ' + section + '.');
        assert(localized[section].bullets === sourceHistory[section].bullets, code + ' history entry count differs for ' + section + '.');
    });
});

const debugSources = {
    communicationTester: parseSections(read('DebuggingSupport/CommunicationTester/업데이트_기록.md'))['Communication Tester'],
    labelGenerator: parseSections(read('DebuggingSupport/InoRobotLabelGen/업데이트기록.md'))['InoRobot Label Gen'],
    trace: parseSections(read('DebuggingSupport/Trace/업데이트_기록.md')).InoRobotTrace,
    projectCompare: parseSections(read('DebuggingSupport/ProjectCompare/업데이트_기록.md'))['Project Compare']
};
targetLocaleCodes.forEach(code => {
    const localized = parseSections(read(path.join('Languge', code, 'debug-history.md')));
    Object.entries(debugSources).forEach(([section, source]) => {
        assert(Boolean(localized[section]), code + ' debugging history is missing ' + section + '.');
        if (!localized[section]) return;
        assert(localized[section].versions.join('|') === source.versions.join('|'), code + ' debugging history versions differ for ' + section + '.');
        assert(localized[section].bullets === source.bullets, code + ' debugging history entry count differs for ' + section + '.');
    });
});

const sitemap = read('sitemap.xml');
['/', '/en/', '/cn/', '/vn/'].forEach(route => assert(sitemap.includes('<loc>https://inovancerobot.com' + route + '</loc>'), 'Sitemap is missing ' + route + '.'));
assert(!sitemap.includes('/kr/'), 'The non-canonical /kr/ route must not be in the sitemap.');

if (failures.length) {
    console.error('Multilingual validation failed:\n- ' + failures.join('\n- '));
    process.exit(1);
}

console.log('Multilingual validation passed: 5 landing routes, 8 shared tool pages, 4 locales, complete version histories.');
