(function () {
    'use strict';

    const STORAGE_KEY = 'inorobot.locale';
    const LOCALE_PARAMETER = 'lang';
    const TOOL_PAGE_PATH = /^\/(?:1_RobotModelSelect(?:\/models\/[a-z0-9-]+)?|2_3DSimulation|3_ToolSelector|4_ProjectGenerator|5_Software|6_Document|7_DebuggingTool(?:\/ZeroCalibration)?|Servo|privacy)\/$/i;
    const CHANNEL_NAME = 'inorobot.locale.sync';
    const DEFAULT_LOCALE = 'ko';
    const SUPPORTED_LOCALES = ['ko', 'en', 'zh-CN', 'vi', 'tr', 'ru'];
    const LANDING_ROUTES = {
        ko: '/',
        en: '/en/',
        'zh-CN': '/cn/',
        vi: '/vn/',
        tr: '/tr/',
        ru: '/ru/'
    };
    const ROUTE_LOCALES = {
        '/': 'ko',
        '/kr/': 'ko',
        '/en/': 'en',
        '/cn/': 'zh-CN',
        '/vn/': 'vi',
        '/tr/': 'tr',
        '/ru/': 'ru'
    };
    const HTML_LANGS = {
        ko: 'ko',
        en: 'en',
        'zh-CN': 'zh-CN',
        vi: 'vi',
        tr: 'tr',
        ru: 'ru'
    };
    const LOCALE_FORMATS = {
        ko: 'ko-KR',
        en: 'en-US',
        'zh-CN': 'zh-CN',
        vi: 'vi-VN',
        tr: 'tr-TR',
        ru: 'ru-RU'
    };

    const localeData = window.INOROBOT_LOCALES || {};
    const hasOwn = Object.prototype.hasOwnProperty;
    // The 3D simulation moves button titles into data-simulation-tooltip for its own tooltip,
    // sometimes before the title is translated, so that attribute is translated as well.
    const TRANSLATED_ATTRIBUTES = ['title', 'aria-label', 'placeholder', 'alt', 'data-simulation-tooltip'];
    const TRANSLATED_ATTRIBUTE_SELECTOR = TRANSLATED_ATTRIBUTES.map(function (name) { return '[' + name + ']'; }).join(', ');
    // locales-data.js stores each page dictionary once and defines `legacy` (the shared
    // fallback dictionary) as their union, built on first use.
    const textSources = new WeakMap();
    const attributeSources = new WeakMap();
    let currentLocale = DEFAULT_LOCALE;
    let mutationObserver = null;
    let localeChannel = null;
    let localeSynchronizationReady = false;
    // A shared link sets the language for this tab, not the recipient's global preference.
    let urlLocaleIsPinned = false;

    function normalizePath(pathname) {
        const value = String(pathname || '/').replace(/\/index\.html$/i, '/');
        return value.endsWith('/') ? value : value + '/';
    }

    function getRouteLocale() {
        return ROUTE_LOCALES[normalizePath(window.location.pathname)] || null;
    }

    function isLandingPage() {
        return Boolean(getRouteLocale());
    }

    function readUrlLocale(url) {
        const locale = url.searchParams.get(LOCALE_PARAMETER);
        return SUPPORTED_LOCALES.includes(locale) ? locale : null;
    }

    function localPath(url) {
        return url.pathname + url.search + url.hash;
    }

    function updateLocationLocale() {
        const url = new URL(window.location.href);
        if (!TOOL_PAGE_PATH.test(normalizePath(url.pathname)) || url.searchParams.has('embed')) return;
        if (url.searchParams.get(LOCALE_PARAMETER) === currentLocale
            && url.searchParams.getAll(LOCALE_PARAMETER).length === 1) return;
        url.searchParams.set(LOCALE_PARAMETER, currentLocale);
        // Preserve the tool's own history state (e.g. the model detail modal).
        window.history.replaceState(window.history.state, '', localPath(url));
    }

    function readStorageLocale(storage) {
        try {
            const stored = storage.getItem(STORAGE_KEY);
            return SUPPORTED_LOCALES.includes(stored) ? stored : null;
        } catch {
            return null;
        }
    }

    function readSessionLocale() {
        return readStorageLocale(window.sessionStorage);
    }

    function readSharedLocale() {
        return readStorageLocale(window.localStorage);
    }

    function writeSessionLocale(locale) {
        try {
            window.sessionStorage.setItem(STORAGE_KEY, locale);
        } catch {
            // The site still works when browser storage is unavailable.
        }
    }

    function writeSharedLocale(locale) {
        try {
            window.localStorage.setItem(STORAGE_KEY, locale);
        } catch {
            // Fall back to session-only synchronization when local storage is unavailable.
        }
    }

    function persistLocale(locale, shouldBroadcast) {
        writeSessionLocale(locale);
        writeSharedLocale(locale);
        if (shouldBroadcast !== false && localeChannel) {
            try {
                localeChannel.postMessage({ locale: locale });
            } catch {
                // Storage and page lifecycle events still keep the locale synchronized.
            }
        }
    }

    function resolveInitialLocale() {
        const routeLocale = getRouteLocale();
        const currentUrl = new URL(window.location.href);
        const urlLocale = readUrlLocale(currentUrl);
        if (urlLocale && !currentUrl.searchParams.has('embed')
            && (routeLocale || TOOL_PAGE_PATH.test(normalizePath(currentUrl.pathname)))) {
            urlLocaleIsPinned = true;
            if (routeLocale && routeLocale !== urlLocale) {
                currentUrl.pathname = LANDING_ROUTES[urlLocale];
                window.location.replace(localPath(currentUrl));
            }
            return urlLocale;
        }
        const storedLocale = readSharedLocale() || readSessionLocale();
        if (routeLocale) {
            const currentPath = normalizePath(window.location.pathname);
            if (currentPath === '/' && storedLocale && storedLocale !== DEFAULT_LOCALE) {
                writeSessionLocale(storedLocale);
                const targetPath = LANDING_ROUTES[storedLocale] || '/';
                if (normalizePath(targetPath) !== currentPath) {
                    currentUrl.pathname = targetPath;
                    window.location.replace(localPath(currentUrl));
                }
                return storedLocale;
            }
            persistLocale(routeLocale, true);
            return routeLocale;
        }
        const initialLocale = storedLocale || DEFAULT_LOCALE;
        writeSessionLocale(initialLocale);
        return initialLocale;
    }

    function getByPath(source, path) {
        const text = String(path || '');
        const value = text.split('.').reduce(function (current, key) {
            return current && hasOwn.call(current, key) ? current[key] : undefined;
        }, source);
        if (value !== undefined) return value;
        // Dictionary keys are source sentences and may contain periods, e.g. "legacy.Enter text."
        const separator = text.indexOf('.');
        if (separator <= 0 || !source) return undefined;
        const table = source[text.slice(0, separator)];
        const key = text.slice(separator + 1);
        return table && typeof table === 'object' && hasOwn.call(table, key) ? table[key] : undefined;
    }

    function interpolate(value, variables) {
        if (typeof value !== 'string') return value;
        return value.replace(/\{([A-Za-z0-9_]+)\}/g, function (match, key) {
            return variables && Object.prototype.hasOwnProperty.call(variables, key)
                ? String(variables[key])
                : match;
        });
    }

    function t(key, variables, fallback) {
        const selected = getByPath(localeData[currentLocale], key);
        const korean = getByPath(localeData[DEFAULT_LOCALE], key);
        const value = selected !== undefined ? selected : (korean !== undefined ? korean : fallback);
        return interpolate(value === undefined ? key : value, variables);
    }

    function get(key, fallback) {
        const selected = getByPath(localeData[currentLocale], key);
        if (selected !== undefined) return selected;
        const korean = getByPath(localeData[DEFAULT_LOCALE], key);
        return korean !== undefined ? korean : fallback;
    }

    const compiledPatterns = new Map();

    function compilePattern(patternSource) {
        let expression = compiledPatterns.get(patternSource);
        if (expression === undefined) {
            try {
                expression = new RegExp(patternSource);
            } catch {
                expression = null;
            }
            compiledPatterns.set(patternSource, expression);
        }
        return expression;
    }

    function translateFromPageData(pageData, source, normalizedSource) {
        const dictionary = pageData && pageData.legacy;
        if (dictionary && hasOwn.call(dictionary, source)) return dictionary[source];
        if (dictionary && hasOwn.call(dictionary, normalizedSource)) return dictionary[normalizedSource];

        const patterns = pageData && pageData.patterns;
        if (Array.isArray(patterns)) {
            for (const item of patterns) {
                if (!item || !item.source || typeof item.target !== 'string') continue;
                const expression = compilePattern(item.source);
                if (expression && expression.test(source)) return source.replace(expression, item.target);
            }
        }
        return undefined;
    }

    let translationTables = null;

    function getTranslationTables() {
        const pageKey = detectPageKey();
        if (!translationTables || translationTables.locale !== currentLocale || translationTables.pageKey !== pageKey) {
            translationTables = {
                locale: currentLocale,
                pageKey: pageKey,
                page: get('pageTranslations.' + pageKey, null),
                fallback: {
                    legacy: get('legacy', {}),
                    patterns: get('patterns', [])
                }
            };
        }
        return translationTables;
    }

    function translateSource(source) {
        const normalizedSource = String(source).replace(/\s+/g, ' ').trim();
        const tables = getTranslationTables();
        const pageResult = translateFromPageData(tables.page, source, normalizedSource);
        if (pageResult !== undefined) return pageResult;

        const fallbackResult = translateFromPageData(tables.fallback, source, normalizedSource);
        if (fallbackResult !== undefined) return fallbackResult;
        return source;
    }

    function shouldSkipTextNode(node) {
        const parent = node && node.parentElement;
        return !parent || Boolean(parent.closest('script, style, code, pre, textarea, [data-i18n-skip]'));
    }

    function translateTextNode(node, captureSource) {
        if (!node || shouldSkipTextNode(node)) return;
        const rawValue = node.data;
        const trimmed = rawValue.trim();
        if (!trimmed) return;

        if (captureSource || !textSources.has(node)) {
            textSources.set(node, trimmed);
        }

        const source = textSources.get(node);
        const translated = translateSource(source);
        const leading = rawValue.match(/^\s*/)[0];
        const trailing = rawValue.match(/\s*$/)[0];
        node.data = leading + translated + trailing;
    }

    function getAttributeSourceMap(element) {
        if (!attributeSources.has(element)) attributeSources.set(element, {});
        return attributeSources.get(element);
    }

    function translateAttribute(element, attributeName, captureSource) {
        if (!element.hasAttribute(attributeName)) return;
        const sources = getAttributeSourceMap(element);
        if (captureSource || !hasOwn.call(sources, attributeName)) {
            const value = element.getAttribute(attributeName);
            // The simulation copies an already translated title into its tooltip attribute;
            // keep the title's original text so a later language change can translate it again.
            const copiedTitle = attributeName === 'data-simulation-tooltip'
                && hasOwn.call(sources, 'title')
                && translateSource(sources.title) === value;
            sources[attributeName] = copiedTitle ? sources.title : value;
        }
        element.setAttribute(attributeName, translateSource(sources[attributeName]));
    }

    function applyExplicitKeys(root) {
        const elements = [];
        if (root.nodeType === Node.ELEMENT_NODE) elements.push(root);
        if (root.querySelectorAll) elements.push.apply(elements, root.querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-placeholder], [data-i18n-aria-label], [data-i18n-alt]'));

        elements.forEach(function (element) {
            if (element.dataset.i18n) element.textContent = t(element.dataset.i18n);
            if (element.dataset.i18nTitle) element.title = t(element.dataset.i18nTitle);
            if (element.dataset.i18nPlaceholder) element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
            if (element.dataset.i18nAriaLabel) element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
            if (element.dataset.i18nAlt) element.setAttribute('alt', t(element.dataset.i18nAlt));
        });
    }

    function walkAndTranslate(root, captureSource) {
        if (!root) return;
        applyExplicitKeys(root);

        if (root.nodeType === Node.TEXT_NODE) {
            translateTextNode(root, captureSource);
            return;
        }

        if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
            translateTextNode(node, captureSource);
            node = walker.nextNode();
        }

        localizeNavigationLinks(root);

        const explicitAttributeKeys = {
            title: 'i18nTitle',
            'aria-label': 'i18nAriaLabel',
            placeholder: 'i18nPlaceholder',
            alt: 'i18nAlt'
        };
        const elements = [];
        if (root.nodeType === Node.ELEMENT_NODE) elements.push(root);
        if (root.querySelectorAll) elements.push.apply(elements, root.querySelectorAll(TRANSLATED_ATTRIBUTE_SELECTOR));
        elements.forEach(function (element) {
            if (element.closest('[data-i18n-skip]')) return;
            TRANSLATED_ATTRIBUTES.forEach(function (attributeName) {
                const explicitKey = explicitAttributeKeys[attributeName];
                if (explicitKey && element.dataset[explicitKey]) return;
                translateAttribute(element, attributeName, captureSource);
            });
        });
    }

    let pageKeyCache = { pathname: null, key: 'home' };

    function detectPageKey() {
        const currentPath = window.location.pathname;
        if (pageKeyCache.pathname !== currentPath) {
            pageKeyCache = { pathname: currentPath, key: resolvePageKey() };
        }
        return pageKeyCache.key;
    }

    function resolvePageKey() {
        const pathname = normalizePath(window.location.pathname).toLowerCase();
        if (ROUTE_LOCALES[normalizePath(window.location.pathname)]) return 'home';
        if (pathname.includes('/7_debuggingtool/zerocalibration/') || pathname.includes('/debuggingsupport/zerocalibration/')) return 'zeroCalibration';
        if (pathname.includes('/7_debuggingtool/') || pathname.includes('/debuggingsupport/')) return 'debugging';
        if (pathname.includes('/4_projectgenerator/') || pathname.includes('/inorobotprojectgen/')) return 'projectGenerator';
        if (pathname.includes('/3_toolselector/') || pathname.includes('/inorobottoolselect/')) return 'toolSelector';
        if (pathname.includes('/2_3dsimulation/') || pathname.includes('/2_robot3dviewer/') || pathname.includes('/inorobot3dview/')) return 'robot3dViewer';
        if (pathname.includes('/1_robotmodelselect/') || pathname.includes('/inorobotselect/')) return 'robotSelect';
        if (pathname.includes('/6_document/') || pathname.includes('/manual/')) return 'manual';
        if (pathname.includes('/5_software/') || pathname.includes('/software/')) return 'software';
        if (pathname.includes('/privacy/')) return 'privacy';
        if (pathname.includes('/servo/')) return 'servo';
        return 'home';
    }

    function updateMetadata() {
        const pageKey = detectPageKey();
        const title = t('pages.' + pageKey + '.title', null, document.title);
        const description = t('pages.' + pageKey + '.description', null, '');
        document.documentElement.lang = HTML_LANGS[currentLocale] || currentLocale;
        document.documentElement.dataset.locale = currentLocale;
        document.title = title;

        let descriptionElement = document.querySelector('meta[name="description"]');
        if (!descriptionElement && description) {
            descriptionElement = document.createElement('meta');
            descriptionElement.name = 'description';
            document.head.appendChild(descriptionElement);
        }
        if (descriptionElement && description) descriptionElement.content = description;

        [
            ['meta[property="og:title"]', title],
            ['meta[property="og:description"]', description],
            ['meta[name="twitter:title"]', title],
            ['meta[name="twitter:description"]', description]
        ].forEach(function (entry) {
            const element = document.querySelector(entry[0]);
            if (element && entry[1]) element.content = entry[1];
        });
    }

    function localizeNavigationLink(link) {
        if (link.tagName !== 'A' || link.hasAttribute('download')) return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#')) return;
        let target;
        try { target = new URL(href, document.baseURI); } catch { return; }
        if (target.origin !== window.location.origin) return;

        if (!link.hasAttribute('data-tool-guide-launch')
            && (link.hasAttribute('data-i18n-home-link') || hasOwn.call(ROUTE_LOCALES, href))) {
            link.setAttribute('data-i18n-home-link', '');
            target.pathname = LANDING_ROUTES[currentLocale];
            if (urlLocaleIsPinned) target.searchParams.set(LOCALE_PARAMETER, currentLocale);
            else target.searchParams.delete(LOCALE_PARAMETER);
        } else {
            if (!TOOL_PAGE_PATH.test(normalizePath(target.pathname)) || target.searchParams.has('embed')) return;
            if (target.searchParams.get(LOCALE_PARAMETER) === currentLocale
                && target.searchParams.getAll(LOCALE_PARAMETER).length === 1) return;
            target.searchParams.set(LOCALE_PARAMETER, currentLocale);
        }
        const localized = localPath(target);
        if (href !== localized) link.setAttribute('href', localized);
    }

    function localizeNavigationLinks(root) {
        if (root.nodeType === Node.ELEMENT_NODE) localizeNavigationLink(root);
        if (root.querySelectorAll) root.querySelectorAll('a[href]').forEach(localizeNavigationLink);
    }

    function createLanguageSwitcher() {
        let container = document.getElementById('inorobot-language-switcher');
        if (!container) {
            container = document.createElement('div');
            container.id = 'inorobot-language-switcher';
            container.className = 'inorobot-language-switcher';
            container.lang = 'en';
            container.translate = false;
            container.setAttribute('data-i18n-skip', '');

            const select = document.createElement('select');
            select.id = 'inorobot-language-select';
            select.className = 'inorobot-language-select';
            select.setAttribute('aria-label', 'Language');
            [
                ['ko', 'Korean'],
                ['en', 'English'],
                ['zh-CN', 'Chinese (Simplified)'],
                ['vi', 'Vietnamese'],
                ['tr', 'Turkish'],
                ['ru', 'Russian']
            ].forEach(function (entry) {
                const option = document.createElement('option');
                option.value = entry[0];
                option.textContent = entry[1];
                select.appendChild(option);
            });

            container.appendChild(select);
            document.body.appendChild(container);
        }

        const languageSlot = document.querySelector('[data-i18n-language-slot]');
        if (languageSlot && container.parentElement !== languageSlot) {
            languageSlot.appendChild(container);
        }
        container.dataset.embedded = languageSlot ? 'true' : 'false';

        const select = container.querySelector('select');
        if (!select) return;
        if (select.dataset.localeListener !== 'true') {
            select.addEventListener('change', function () {
                const nextLocale = select.value;
                if (!SUPPORTED_LOCALES.includes(nextLocale)) return;
                if (isLandingPage()) {
                    persistLocale(nextLocale, true);
                    const target = new URL(window.location.href);
                    target.pathname = LANDING_ROUTES[nextLocale];
                    target.searchParams.delete(LOCALE_PARAMETER);
                    window.location.assign(localPath(target));
                } else {
                    setLocale(nextLocale);
                }
            });
            select.dataset.localeListener = 'true';
        }
        select.value = currentLocale;
        container.dataset.landing = isLandingPage() ? 'true' : 'false';
    }

    function translateMutations(mutations) {
        mutations.forEach(function (mutation) {
            // A record queued before this batch may describe a value this runtime has already
            // translated (for example while walking a newly added node). Re-capturing it would
            // store the translation as the source and break the next language change.
            if (mutation.type === 'characterData') {
                const current = mutation.target.data.trim();
                if (textSources.has(mutation.target) && translateSource(textSources.get(mutation.target)) === current) return;
                textSources.delete(mutation.target);
                translateTextNode(mutation.target, true);
            } else if (mutation.type === 'attributes') {
                if (mutation.attributeName === 'href') {
                    localizeNavigationLink(mutation.target);
                    return;
                }
                const sources = getAttributeSourceMap(mutation.target);
                const name = mutation.attributeName;
                const current = mutation.target.getAttribute(name);
                if (current !== null && hasOwn.call(sources, name) && translateSource(sources[name]) === current) return;
                delete sources[name];
                translateAttribute(mutation.target, name, true);
            } else {
                mutation.addedNodes.forEach(function (node) {
                    walkAndTranslate(node, true);
                });
            }
        });
    }

    function stopObserver() {
        if (!mutationObserver) return;
        // disconnect() discards records not yet delivered, such as a dialog appended just
        // before a page translates another element, so translate those first.
        const pending = mutationObserver.takeRecords();
        mutationObserver.disconnect();
        if (pending.length) translateMutations(pending);
    }

    function startObserver() {
        if (!document.body) return;
        if (!mutationObserver) {
            mutationObserver = new MutationObserver(function (mutations) {
                stopObserver();
                translateMutations(mutations);
                startObserver();
            });
        }

        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: [...TRANSLATED_ATTRIBUTES, 'href']
        });
    }

    function applyLocale(captureSource) {
        stopObserver();
        updateMetadata();
        walkAndTranslate(document.body, Boolean(captureSource));
        createLanguageSwitcher();
        startObserver();
    }

    function setLocale(locale, options) {
        const nextLocale = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
        const previousLocale = currentLocale;
        currentLocale = nextLocale;
        if (options && options.persist === false) {
            writeSessionLocale(nextLocale);
        } else {
            urlLocaleIsPinned = false;
            persistLocale(nextLocale, !options || options.broadcast !== false);
        }
        updateLocationLocale();
        applyLocale(false);
        document.dispatchEvent(new CustomEvent('inorobot:languagechange', {
            detail: { locale: nextLocale, previousLocale: previousLocale }
        }));
        return nextLocale;
    }

    function synchronizeLocale(locale) {
        if (urlLocaleIsPinned || !SUPPORTED_LOCALES.includes(locale)) return;

        writeSessionLocale(locale);
        if (isLandingPage()) {
            const targetPath = LANDING_ROUTES[locale] || '/';
            if (normalizePath(window.location.pathname) !== normalizePath(targetPath)) {
                const url = new URL(window.location.href);
                url.pathname = targetPath;
                window.location.replace(localPath(url));
                return;
            }
        }

        if (locale !== currentLocale) {
            setLocale(locale, { persist: false });
        }
    }

    function synchronizeFromStorage() {
        const storedLocale = readSharedLocale() || readSessionLocale();
        if (storedLocale) synchronizeLocale(storedLocale);
    }

    function setupLocaleSynchronization() {
        if (localeSynchronizationReady) return;
        localeSynchronizationReady = true;

        if ('BroadcastChannel' in window) {
            try {
                localeChannel = new BroadcastChannel(CHANNEL_NAME);
                localeChannel.addEventListener('message', function (event) {
                    const locale = event && event.data ? event.data.locale : null;
                    synchronizeLocale(locale);
                });
            } catch {
                localeChannel = null;
            }
        }

        window.addEventListener('storage', function (event) {
            if (event.key === STORAGE_KEY && SUPPORTED_LOCALES.includes(event.newValue)) {
                synchronizeLocale(event.newValue);
            }
        });
        // Same-document navigation, such as closing a model detail modal, restores
        // a previous address without rerunning init. Keep that entry shareable too.
        window.addEventListener('popstate', updateLocationLocale);
        window.addEventListener('pageshow', synchronizeFromStorage);
        window.addEventListener('focus', synchronizeFromStorage);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') synchronizeFromStorage();
        });
    }

    function formatNumber(value, options) {
        return new Intl.NumberFormat(LOCALE_FORMATS[currentLocale], options).format(value);
    }

    function formatDate(value, options) {
        return new Intl.DateTimeFormat(LOCALE_FORMATS[currentLocale], options).format(value instanceof Date ? value : new Date(value));
    }

    function init() {
        setupLocaleSynchronization();
        currentLocale = resolveInitialLocale();
        updateLocationLocale();
        applyLocale(true);
        document.dispatchEvent(new CustomEvent('inorobot:i18nready', {
            detail: { locale: currentLocale }
        }));
    }

    window.InoRobotI18n = {
        t: t,
        get: get,
        translate: translateSource,
        setLocale: setLocale,
        formatNumber: formatNumber,
        formatDate: formatDate,
        apply: function (root) {
            stopObserver();
            walkAndTranslate(root || document.body, true);
            startObserver();
        },
        refresh: function (root) {
            stopObserver();
            walkAndTranslate(root || document.body, false);
            startObserver();
        },
        get locale() {
            return currentLocale;
        },
        get supportedLocales() {
            return SUPPORTED_LOCALES.slice();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
