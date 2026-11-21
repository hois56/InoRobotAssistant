(function () {
    'use strict';

    const cardHeadings = {
        robotSelect: 'Robot Model Select',
        robot3dViewer: '3D Simulation',
        toolSelector: 'Robot Tool Selector',
        projectGenerator: 'Project Generator',
        software: 'Software',
        manual: 'Document',
        debuggingTool: 'Debugging Tool'
    };

    const modal = document.getElementById('version-history-modal');
    const dialog = modal?.querySelector('.history-dialog');
    const title = document.getElementById('history-dialog-title');
    const currentVersion = document.getElementById('history-current-version');
    const body = document.getElementById('history-dialog-body');
    const closeButton = document.getElementById('history-close-button');

    if (!modal || !dialog || !title || !currentVersion || !body || !closeButton) return;

    function getLocalizedCardHeading(cardKey) {
        const heading = cardHeadings[cardKey];
        return window.InoRobotI18n?.translate(heading) || heading;
    }

    function translate(message, variables) {
        return window.InoRobotI18n?.translate(message, variables) || message;
    }

    let historyMarkdownPromise = null;
    let lastFocusedElement = null;
    let previousBodyOverflow = '';
    let activeCardKey = null;

    function getEmbeddedHistoryMarkdown() {
        const locale = window.InoRobotI18n?.locale || 'ko';
        const localized = window.INOROBOT_LOCALES?.[locale]?.historyMarkdown;
        if (localized) return localized;

        const encoded = window.SITE_CARD_HISTORY_MARKDOWN_BASE64;
        if (encoded) {
            try {
                const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
                return new TextDecoder('utf-8').decode(bytes);
            } catch (error) {
                console.error('내장된 버전 기록을 읽지 못했습니다.', error);
            }
        }

        return null;
    }

    function loadHistoryMarkdown() {
        if (!historyMarkdownPromise) {
            const embeddedMarkdown = getEmbeddedHistoryMarkdown();
            if (embeddedMarkdown) {
                historyMarkdownPromise = Promise.resolve(embeddedMarkdown);
            } else if (window.location.protocol === 'file:') {
                historyMarkdownPromise = Promise.reject(new Error('Embedded history data is unavailable'));
            } else {
                historyMarkdownPromise = fetch('/0_Home/UPDATE_HISTORY.md?v=20260730-2', { cache: 'no-store' })
                    .then((response) => {
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        return response.text();
                    })
                    .catch((error) => {
                        historyMarkdownPromise = null;
                        throw error;
                    });
            }
        }

        return historyMarkdownPromise;
    }

    let displayedCard = null;
    let request = 0;
    const sections = new Map();

    function renderMessage(message) {
        const text = document.createElement('p');
        text.className = 'history-message';
        text.textContent = translate(message);
        body.replaceChildren(text);
    }

    function showModal() {
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeButton.focus({ preventScroll: true });
    }

    function closeModal() {
        if (!modal.classList.contains('is-open')) return;

        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = previousBodyOverflow;

        if (lastFocusedElement instanceof HTMLElement) {
            lastFocusedElement.focus({ preventScroll: true });
        }
    }

    async function openHistory(cardKey, trigger) {
        const heading = cardHeadings[cardKey];
        if (!heading) return;

        activeCardKey = cardKey;
        lastFocusedElement = trigger;
        title.textContent = getLocalizedCardHeading(cardKey);

        const version = window.SITE_CARD_VERSIONS?.[cardKey];
        currentVersion.textContent = version
            ? (window.InoRobotI18n?.t('common.currentVersion', { version }) || `Current Ver ${version}`)
            : '';
        if (!modal.classList.contains('is-open')) showModal();
        const ticket = ++request;
        if (displayedCard === cardKey) {
            body.scrollTop = 0;
            return;
        }
        displayedCard = null;
        renderMessage('버전 기록을 불러오는 중입니다.');

        try {
            const markdown = await loadHistoryMarkdown();
            if (ticket !== request) return;
            if (!sections.has(cardKey)) sections.set(cardKey, InoSite.history(markdown, heading, true));
            InoSite.renderHistory(body, sections.get(cardKey), translate('등록된 버전 기록이 없습니다.'));
            displayedCard = cardKey;
        } catch (error) {
            if (ticket !== request) return;
            renderMessage('버전 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
    }

    document.querySelectorAll('[data-history-card]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openHistory(button.dataset.historyCard, button);
        });
    });

    closeButton.addEventListener('click', closeModal);

    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('is-open')) {
            closeModal();
        }
    });

    document.addEventListener('inorobot:languagechange', () => {
        historyMarkdownPromise = null;
        sections.clear();
        displayedCard = null;
        request++;
        if (activeCardKey && modal.classList.contains('is-open')) openHistory(activeCardKey, lastFocusedElement);
    });
})();
