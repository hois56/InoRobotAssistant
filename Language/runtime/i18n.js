(function () {
    'use strict';

    const STORAGE_KEY = 'inorobot.locale';
    const CHANNEL_NAME = 'inorobot.locale.sync';
    const DEFAULT_LOCALE = 'ko';
    const SUPPORTED_LOCALES = ['ko', 'en', 'zh-CN', 'vi'];
    const LANDING_ROUTES = {
        ko: '/',
        en: '/en/',
        'zh-CN': '/cn/',
        vi: '/vn/'
    };
    const ROUTE_LOCALES = {
        '/': 'ko',
        '/kr/': 'ko',
        '/en/': 'en',
        '/cn/': 'zh-CN',
        '/vn/': 'vi'
    };
    const HTML_LANGS = {
        ko: 'ko',
        en: 'en',
        'zh-CN': 'zh-CN',
        vi: 'vi'
    };
    const LOCALE_FORMATS = {
        ko: 'ko-KR',
        en: 'en-US',
        'zh-CN': 'zh-CN',
        vi: 'vi-VN'
    };

    const localeData = window.INOROBOT_LOCALES || {};
    const textSources = new WeakMap();
    const attributeSources = new WeakMap();
    let currentLocale = DEFAULT_LOCALE;
    let mutationObserver = null;
    let localeChannel = null;
    let localeSynchronizationReady = false;

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
        const storedLocale = readSharedLocale() || readSessionLocale();
        if (routeLocale) {
            const currentPath = normalizePath(window.location.pathname);
            if (currentPath === '/' && storedLocale && storedLocale !== DEFAULT_LOCALE) {
                writeSessionLocale(storedLocale);
                const targetPath = LANDING_ROUTES[storedLocale] || '/';
                if (normalizePath(targetPath) !== currentPath) {
                    window.location.replace(targetPath);
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
        return String(path || '').split('.').reduce(function (value, key) {
            return value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
        }, source);
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

    function translateFromPageData(pageData, source, normalizedSource) {
        const dictionary = pageData && pageData.legacy;
        if (dictionary && Object.prototype.hasOwnProperty.call(dictionary, source)) return dictionary[source];
        if (dictionary && Object.prototype.hasOwnProperty.call(dictionary, normalizedSource)) return dictionary[normalizedSource];

        const patterns = pageData && pageData.patterns;
        if (Array.isArray(patterns)) {
            for (const item of patterns) {
                if (!item || !item.source || typeof item.target !== 'string') continue;
                const expression = new RegExp(item.source);
                if (expression.test(source)) return source.replace(expression, item.target);
            }
        }
        return undefined;
    }

    function translateSource(source) {
        const normalizedSource = String(source).replace(/\s+/g, ' ').trim();
        const pageTranslation = get('pageTranslations.' + detectPageKey(), null);
        const pageResult = translateFromPageData(pageTranslation, source, normalizedSource);
        if (pageResult !== undefined) return pageResult;

        const fallbackResult = translateFromPageData({
            legacy: get('legacy', {}),
            patterns: get('patterns', [])
        }, source, normalizedSource);
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
        if (captureSource || !Object.prototype.hasOwnProperty.call(sources, attributeName)) {
            sources[attributeName] = element.getAttribute(attributeName);
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

        const attributes = ['title', 'aria-label', 'placeholder', 'alt'];
        const elements = [];
        if (root.nodeType === Node.ELEMENT_NODE) elements.push(root);
        if (root.querySelectorAll) elements.push.apply(elements, root.querySelectorAll('[title], [aria-label], [placeholder], [alt]'));
        elements.forEach(function (element) {
            if (element.closest('[data-i18n-skip]')) return;
            attributes.forEach(function (attributeName) {
                translateAttribute(element, attributeName, captureSource);
            });
        });
    }

    function detectPageKey() {
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

    function updateHomeLinks() {
        const homePath = LANDING_ROUTES[currentLocale] || '/';
        const landingSelectors = [
            'a[data-i18n-home-link]',
            'a[href="/"]',
            'a[href="/kr/"]',
            'a[href="/en/"]',
            'a[href="/cn/"]',
            'a[href="/vn/"]'
        ];
        document.querySelectorAll(landingSelectors.join(', ')).forEach(function (link) {
            link.setAttribute('data-i18n-home-link', '');
            link.setAttribute('href', homePath);
        });
    }

    function createLanguageSwitcher() {
        let container = document.getElementById('inorobot-language-switcher');
        if (!container) {
            container = document.createElement('div');
            container.id = 'inorobot-language-switcher';
            container.className = 'inorobot-language-switcher';

            const label = document.createElement('span');
            label.className = 'inorobot-language-label';
            label.setAttribute('aria-hidden', 'true');
            label.textContent = 'Language';

            const select = document.createElement('select');
            select.id = 'inorobot-language-select';
            select.className = 'inorobot-language-select';
            [
                ['ko', '한국어'],
                ['en', 'English'],
                ['zh-CN', '简体中文'],
                ['vi', 'Tiếng Việt']
            ].forEach(function (entry) {
                const option = document.createElement('option');
                option.value = entry[0];
                option.textContent = entry[1];
                select.appendChild(option);
            });

            container.append(label, select);
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
                    window.location.assign(LANDING_ROUTES[nextLocale]);
                } else {
                    setLocale(nextLocale);
                }
            });
            select.dataset.localeListener = 'true';
        }
        select.value = currentLocale;
        select.setAttribute('aria-label', t('common.languageSelector'));
        container.setAttribute('aria-label', t('common.languageSelector'));
        container.dataset.landing = isLandingPage() ? 'true' : 'false';
    }

    function stopObserver() {
        if (mutationObserver) mutationObserver.disconnect();
    }

    function startObserver() {
        if (!document.body) return;
        if (!mutationObserver) {
            mutationObserver = new MutationObserver(function (mutations) {
                stopObserver();
                mutations.forEach(function (mutation) {
                    if (mutation.type === 'characterData') {
                        textSources.delete(mutation.target);
                        translateTextNode(mutation.target, true);
                    } else if (mutation.type === 'attributes') {
                        const sources = getAttributeSourceMap(mutation.target);
                        delete sources[mutation.attributeName];
                        translateAttribute(mutation.target, mutation.attributeName, true);
                    } else {
                        mutation.addedNodes.forEach(function (node) {
                            walkAndTranslate(node, true);
                        });
                    }
                });
                startObserver();
            });
        }

        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['title', 'aria-label', 'placeholder', 'alt']
        });
    }

    function applyLocale(captureSource) {
        stopObserver();
        updateMetadata();
        walkAndTranslate(document.body, Boolean(captureSource));
        updateHomeLinks();
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
            persistLocale(nextLocale, !options || options.broadcast !== false);
        }
        applyLocale(false);
        document.dispatchEvent(new CustomEvent('inorobot:languagechange', {
            detail: { locale: nextLocale, previousLocale: previousLocale }
        }));
        return nextLocale;
    }

    function synchronizeLocale(locale) {
        if (!SUPPORTED_LOCALES.includes(locale)) return;

        writeSessionLocale(locale);
        if (isLandingPage()) {
            const targetPath = LANDING_ROUTES[locale] || '/';
            if (normalizePath(window.location.pathname) !== normalizePath(targetPath)) {
                window.location.replace(targetPath);
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
