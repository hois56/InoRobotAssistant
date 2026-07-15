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

const locales = Object.fromEntries(localeCodes.map(code => [code, loadMergedLocale(code)]));
const siteCardVersions = parseSiteCardVersions(read('site-card-versions.js'));

localeCodes.forEach(code => {
    assert(locales[code].legacy['Debugging Tool'] === 'Debugging Tool', code + ' must keep Debugging Tool in English.');
    assert(locales[code].pages.debugging.title === 'Debugging Tool | InoRobot Assistant', code + ' has the wrong Debugging Tool page title.');
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
});

const runtime = read('i18n/i18n.js');
assert(runtime.includes("const STORAGE_KEY = 'inorobot.locale'"), 'Runtime session key is missing.');
assert(runtime.includes("return readSessionLocale() || DEFAULT_LOCALE"), 'Direct tool access does not default to Korean.');
assert(runtime.includes("'/kr/': 'ko'") && runtime.includes("'/cn/': 'zh-CN'") && runtime.includes("'/vn/': 'vi'"), 'Landing route map is incomplete.');
assert(runtime.includes('function formatNumber') && runtime.includes('function formatDate'), 'Locale number/date formatters are missing.');
assert(runtime.includes('window.location.assign(LANDING_ROUTES[nextLocale])'), 'Landing language changes do not navigate to their localized route.');
assert(runtime.includes("label.textContent = 'Language'") && !runtime.includes("icon.textContent = '文'"), 'Runtime language switcher has the wrong label.');
const localeStyles = read('i18n/i18n.css');
assert(localeStyles.includes('position: fixed !important') && localeStyles.includes('right: 18px !important') && localeStyles.includes('left: auto !important'), 'The language UI is not fixed to the upper-right corner.');

const protectedScripts = read('Manual/script.js') + '\n' + read('Software/script.js');
assert(!protectedScripts.includes('data.message ||'), 'A raw server error message can still be shown to users.');
assert(protectedScripts.includes('translateUiText'), 'Protected content prompts are not localized.');
assert(protectedScripts.includes('fetch(WORKER_URL'), 'Protected Manual/Software authentication requests are missing.');

const robotSelectScript = read('InoRobotSelect/script.js');
assert(robotSelectScript.includes('html2pdf().set(dlObj)'), 'Robot Select PDF generation hook is missing.');
assert(robotSelectScript.includes('new JSZip()') && robotSelectScript.includes('saveAs(content'), 'Robot Select CAD ZIP generation hook is missing.');
const projectScript = read('InoRobotProjectGen/app.js');
assert(projectScript.includes('new JSZip()') && projectScript.includes('zip.generateAsync') && projectScript.includes('saveAs(blob'), 'Project ZIP generation hook is missing.');
assert(read('InoRobotToolSelect/index.html').includes('function calculate()'), 'Tool Selector calculation hook is missing.');
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
