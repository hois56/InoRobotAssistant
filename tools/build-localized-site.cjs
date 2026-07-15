const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const localeCodes = ['ko', 'en', 'zh-CN', 'vi'];
const localeRoutes = {
    ko: '/',
    en: '/en/',
    'zh-CN': '/cn/',
    vi: '/vn/'
};
const outputRoutes = {
    ko: 'Language/ko/index.html',
    kr: 'Language/kr/index.html',
    en: 'Language/en/index.html',
    'zh-CN': 'Language/zh-CN/index.html',
    vi: 'Language/vi/index.html'
};
const htmlLanguages = {
    ko: 'ko',
    en: 'en',
    'zh-CN': 'zh-CN',
    vi: 'vi'
};
const siteUrl = 'https://inovancerobot.com';
const templatePath = path.join(root, 'Language', 'templates', 'home.template.html');
const rootIndexPath = path.join(root, 'Language', 'ko', 'index.html');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadSiteCardVersions() {
    const source = fs.readFileSync(path.join(root, 'site-card-versions.js'), 'utf8');
    const versions = {};
    for (const match of source.matchAll(/([A-Za-z0-9_]+):\s*['"]([^'"]+)['"]/g)) {
        versions[match[1]] = match[2];
    }
    if (!Object.keys(versions).length) {
        throw new Error('No card versions were found in site-card-versions.js.');
    }
    return versions;
}

function injectCardVersions(html, versions) {
    return html.replace(
        /(<span\b[^>]*data-site-card-version=["']([^"']+)["'][^>]*>)[\s\S]*?(<\/span>)/g,
        (match, open, key, close) => {
            if (!versions[key]) throw new Error('Missing site card version: ' + key);
            const displayVersion = String(versions[key]).replace(/^(\d{2}\.\d{2}\.\d{2})\.\d+$/, '$1');
            return open + 'Ver ' + displayVersion + close;
        }
    );
}

function collectPlaceholders(value) {
    if (typeof value !== 'string') return [];
    return [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(match => match[1]).sort();
}

function translateLegacyValue(value, locale) {
    const source = String(value || '');
    const match = source.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const leading = match ? match[1] : '';
    const body = match ? match[2] : source;
    const trailing = match ? match[3] : '';
    const normalized = body.replace(/\s+/g, ' ').trim();
    const translated = Object.prototype.hasOwnProperty.call(locale.legacy, body)
        ? locale.legacy[body]
        : locale.legacy[normalized];
    return translated === undefined ? source : leading + translated + trailing;
}

function translateVisibleFragment(fragment, locale) {
    let output = fragment.replace(/>([^<>]+)</g, (match, value) => '>' + translateLegacyValue(value, locale) + '<');
    output = output.replace(/\b(aria-label|title|placeholder|alt)=(["'])(.*?)\2/g, (match, name, quote, value) => {
        return name + '=' + quote + translateLegacyValue(value, locale) + quote;
    });
    return output;
}

function translateVisibleHtml(html, locale) {
    const protectedBlock = /<(script|style|code|pre)\b[\s\S]*?<\/\1>/gi;
    let result = '';
    let cursor = 0;
    let match;
    while ((match = protectedBlock.exec(html)) !== null) {
        result += translateVisibleFragment(html.slice(cursor, match.index), locale);
        result += match[0];
        cursor = match.index + match[0].length;
    }
    return result + translateVisibleFragment(html.slice(cursor), locale);
}

function compareShape(reference, candidate, currentPath, errors) {
    if (Array.isArray(reference)) {
        if (!Array.isArray(candidate)) {
            errors.push(currentPath + ' must be an array.');
            return;
        }
        if (reference.length !== candidate.length) {
            errors.push(currentPath + ' array length differs.');
            return;
        }
        reference.forEach((value, index) => compareShape(value, candidate[index], currentPath + '[' + index + ']', errors));
        return;
    }

    if (reference && typeof reference === 'object') {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            errors.push(currentPath + ' must be an object.');
            return;
        }
        const referenceKeys = Object.keys(reference).sort();
        const candidateKeys = Object.keys(candidate).sort();
        if (referenceKeys.join('|') !== candidateKeys.join('|')) {
            errors.push(currentPath + ' keys differ.');
            return;
        }
        referenceKeys.forEach(key => compareShape(reference[key], candidate[key], currentPath ? currentPath + '.' + key : key, errors));
        return;
    }

    if (typeof reference !== typeof candidate) {
        errors.push(currentPath + ' type differs.');
        return;
    }
    if (typeof candidate === 'string' && candidate.trim() === '') {
        errors.push(currentPath + ' is empty.');
    }
    if (typeof reference === 'string') {
        const expected = collectPlaceholders(reference).join('|');
        const actual = collectPlaceholders(candidate).join('|');
        if (expected !== actual) errors.push(currentPath + ' placeholders differ.');
    }
}

function loadLocales() {
    const locales = {};
    localeCodes.forEach(code => {
        const localeDir = path.join(root, 'Language', code);
        const uiPath = path.join(localeDir, 'ui.json');
        const historyPath = path.join(localeDir, 'history.md');
        const debugHistoryPath = path.join(localeDir, 'debug-history.md');
        if (!fs.existsSync(uiPath)) throw new Error('Missing locale file: ' + path.relative(root, uiPath));
        locales[code] = readJson(uiPath);
        fs.readdirSync(localeDir)
            .filter(fileName => fileName.endsWith('.json') && fileName !== 'ui.json')
            .sort()
            .forEach(fileName => {
                const supplement = readJson(path.join(localeDir, fileName));
                if (supplement.legacy) Object.assign(locales[code].legacy, supplement.legacy);
                if (supplement.patterns) locales[code].patterns.push(...supplement.patterns);
            });
        locales[code].historyMarkdown = fs.existsSync(historyPath)
            ? fs.readFileSync(historyPath, 'utf8')
            : '';
        locales[code].debugHistoryMarkdown = fs.existsSync(debugHistoryPath)
            ? fs.readFileSync(debugHistoryPath, 'utf8')
            : '';
    });

    const reference = locales.ko;
    const errors = [];
    localeCodes.filter(code => code !== 'ko').forEach(code => {
        compareShape(reference, locales[code], code, errors);
    });
    if (errors.length) throw new Error('Locale validation failed:\n- ' + errors.join('\n- '));
    return locales;
}

function ensureRuntimeReferences(html) {
    let output = html.replaceAll('/i18n/', '/Language/runtime/');
    if (!output.includes('Noto+Sans+KR')) {
        output = output.replace('</head>', '    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap" rel="stylesheet">\n</head>');
    }
    if (!output.includes('/Language/runtime/i18n.css')) {
        output = output.replace('</head>', '    <link rel="stylesheet" href="/Language/runtime/i18n.css">\n</head>');
    }
    if (!output.includes('/Language/runtime/locales-data.js')) {
        output = output.replace('</head>', '    <script src="/Language/runtime/locales-data.js" defer></script>\n    <script src="/Language/runtime/i18n.js" defer></script>\n</head>');
    }
    if (!output.includes('/Language/runtime/icon-fallback.js')) {
        output = output.replace('</head>', '    <script src="/Language/runtime/icon-fallback.js" defer></script>\n</head>');
    }
    return output;
}

function integrateSubpages() {
    const htmlFiles = [
        '1_RobotModelSelect/index.html',
        '2_Robot3DViewer/index.html',
        '3_ToolSelector/index.html',
        '4_ProjectGenerator/index.html',
        '5_Software/index.html',
        '6_Document/index.html',
        '7_DebuggingTool/index.html',
        '7_DebuggingTool/ZeroCalibration/index.html'
    ];
    htmlFiles.forEach(relativePath => {
        const filePath = path.join(root, relativePath);
        const source = fs.readFileSync(filePath, 'utf8');
        const updated = ensureRuntimeReferences(source);
        if (updated !== source) fs.writeFileSync(filePath, updated, 'utf8');
    });
}

function replaceSeoBlock(html, locale, route) {
    const canonicalRoute = route === '/kr/' ? '/' : route;
    const canonicalUrl = siteUrl + canonicalRoute;
    const alternateLinks = [
        ['ko', siteUrl + '/'],
        ['en', siteUrl + '/en/'],
        ['zh-CN', siteUrl + '/cn/'],
        ['vi', siteUrl + '/vn/'],
        ['x-default', siteUrl + '/']
    ].map(entry => '    <link rel="alternate" hreflang="' + entry[0] + '" href="' + entry[1] + '">').join('\n');
    const block = [
        '    <!-- I18N-SEO:START -->',
        '    <link rel="canonical" href="' + canonicalUrl + '">',
        alternateLinks,
        '    <meta property="og:locale" content="' + locale._meta.ogLocale + '">',
        '    <meta property="og:url" content="' + canonicalUrl + '">',
        '    <!-- I18N-SEO:END -->'
    ].join('\n');
    const marker = /[ \t]*<!-- I18N-SEO:START -->[\s\S]*?<!-- I18N-SEO:END -->/;
    return marker.test(html) ? html.replace(marker, '\n' + block) : html.replace('</head>', block + '\n</head>');
}

function replaceMetaDescription(html, description) {
    const meta = '    <meta name="description" content="' + description.replace(/"/g, '&quot;') + '">';
    if (/<meta\s+name=["']description["'][^>]*>/i.test(html)) {
        return html.replace(/<meta\s+name=["']description["'][^>]*>/i, meta.trim());
    }
    return html.replace(/<meta\s+name=["']viewport["'][^>]*>/i, match => match + '\n' + meta);
}

function translateHomeTemplate(template, localeCode, locales, route, versions) {
    const locale = locales[localeCode];
    let html = template;
    html = html.replace(/<html\b[^>]*>/i, '<html lang="' + htmlLanguages[localeCode] + '" data-route-locale="' + localeCode + '">');
    html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + locale.pages.home.title + '</title>');
    html = replaceMetaDescription(html, locale.pages.home.description);
    html = ensureRuntimeReferences(html);
    html = replaceSeoBlock(html, locale, route);

    if (route !== '/' && !/<base\s/i.test(html)) {
        html = html.replace('<head>', '<head>\n    <base href="/">');
    }

    html = translateVisibleHtml(html, locale);
    html = injectCardVersions(html, versions);
    html = html.replace(/(<option value="(?:ko|en|zh-CN|vi)") selected/g, '$1');
    html = html.replace('<option value="' + localeCode + '">', '<option value="' + localeCode + '" selected>');

    html = html.replace(/^<!-- Generated by tools\/build-localized-site\.cjs\. -->\r?\n/, '');
    return '---\npermalink: ' + route + '\n---\n<!-- Generated by tools/build-localized-site.cjs. -->\n' + html;
}

function writeFile(relativePath, content) {
    const outputPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, content, 'utf8');
}

function buildLandingPages(locales, versions) {
    fs.mkdirSync(path.dirname(templatePath), { recursive: true });
    if (!fs.existsSync(templatePath)) {
        fs.writeFileSync(templatePath, ensureRuntimeReferences(fs.readFileSync(rootIndexPath, 'utf8')), 'utf8');
    }
    const template = fs.readFileSync(templatePath, 'utf8');
    writeFile(outputRoutes.ko, translateHomeTemplate(template, 'ko', locales, '/', versions));
    writeFile(outputRoutes.kr, translateHomeTemplate(template, 'ko', locales, '/kr/', versions));
    writeFile(outputRoutes.en, translateHomeTemplate(template, 'en', locales, '/en/', versions));
    writeFile(outputRoutes['zh-CN'], translateHomeTemplate(template, 'zh-CN', locales, '/cn/', versions));
    writeFile(outputRoutes.vi, translateHomeTemplate(template, 'vi', locales, '/vn/', versions));
}

function buildLocaleBundle(locales) {
    const output = [
        '// Generated by tools/build-localized-site.cjs. Edit files under Language/ instead.',
        'window.INOROBOT_LOCALES = ' + JSON.stringify(locales, null, 2) + ';',
        ''
    ].join('\n');
    writeFile('Language/runtime/locales-data.js', output);
}

function buildSitemap() {
    const urls = ['/', '/en/', '/cn/', '/vn/'];
    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls.map(route => '  <url><loc>' + siteUrl + route + '</loc></url>'),
        '</urlset>',
        ''
    ].join('\n');
    writeFile('sitemap.xml', xml);
}

const locales = loadLocales();
const siteCardVersions = loadSiteCardVersions();
buildLocaleBundle(locales);
integrateSubpages();
buildLandingPages(locales, siteCardVersions);
buildSitemap();
console.log('Built locales and landing routes: /, /kr/, /en/, /cn/, /vn/');
