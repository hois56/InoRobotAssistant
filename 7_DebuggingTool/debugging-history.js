(function () {
    'use strict';

    const tools = {
        logAnalyzer: { title: 'Log Analyzer', markdownPath: './InoRobotLogAnalyzer/업데이트_기록.md' },
        communicationTester: {
            title: 'Communication Tester',
            markdownPath: './CommunicationTester/업데이트_기록.md'
        },
        labelGenerator: {
            title: 'Label Generator',
            markdownPath: './InoRobotLabelGen/업데이트기록.md'
        },
        trace: {
            title: 'Trace',
            markdownPath: './Trace/업데이트_기록.md'
        },
        projectCompare: {
            title: 'Project Compare',
            markdownPath: './ProjectCompare/업데이트_기록.md'
        },
        cadLightweight: {
            title: 'CAD Lightweight',
            markdownPath: './CADLightweight/업데이트_기록.md'
        }
    };

    const modal = document.getElementById('debug-history-modal');
    const title = document.getElementById('debug-history-title');
    const currentVersion = document.getElementById('debug-history-current-version');
    const body = document.getElementById('debug-history-body');
    const closeButton = document.getElementById('debug-history-close');

    if (!modal || !title || !currentVersion || !body || !closeButton) return;

    const markdownPromises = {};
    let lastFocusedElement = null;
    let previousBodyOverflow = '';
    let activeToolKey = null;

    function getEmbeddedMarkdown(toolKey) {
        const locale = window.InoRobotI18n?.locale || 'ko';
        const localized = window.INOROBOT_LOCALES?.[locale]?.debugHistoryMarkdown;
        if (localized) {
            const entries = InoSite.history(localized, toolKey);
            if (entries.length) return entries;
        }

        const encoded = window.DEBUGGING_HISTORY_DATA?.[toolKey];
        if (!encoded) return null;

        try {
            const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
            return InoSite.history(new TextDecoder('utf-8').decode(bytes));
        } catch (error) {
            console.error('내장된 디버깅 툴 버전 기록을 읽지 못했습니다.', error);
            return null;
        }
    }

    function loadMarkdown(toolKey) {
        if (markdownPromises[toolKey]) return markdownPromises[toolKey];

        const tool = tools[toolKey];
        const embeddedMarkdown = getEmbeddedMarkdown(toolKey);
        if (embeddedMarkdown) {
            markdownPromises[toolKey] = Promise.resolve(embeddedMarkdown);
        } else if (window.location.protocol === 'file:') {
            markdownPromises[toolKey] = Promise.reject(new Error('Embedded history data is unavailable'));
        } else {
            markdownPromises[toolKey] = fetch(tool.markdownPath, { cache: 'no-cache' })
                .then((response) => {
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return response.text().then(markdown => InoSite.history(markdown));
                })
                .catch((error) => {
                    delete markdownPromises[toolKey];
                    throw error;
                });
        }

        return markdownPromises[toolKey];
    }

    let request = 0;
    let displayedTool = null;

    function renderMessage(message) {
        const text = document.createElement('p');
        text.className = 'history-message';
        text.textContent = window.InoRobotI18n
            ? window.InoRobotI18n.translate(message)
            : message;
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

    async function openHistory(toolKey, trigger) {
        const tool = tools[toolKey];
        if (!tool) return;

        activeToolKey = toolKey;
        lastFocusedElement = trigger;
        title.textContent = window.InoRobotI18n
            ? window.InoRobotI18n.translate(tool.title)
            : tool.title;
        currentVersion.textContent = trigger.dataset.currentVersion
            ? (window.InoRobotI18n?.t('common.currentVersion', {
                version: trigger.dataset.currentVersion.replace(/^V/i, '')
            }) || `Current Ver ${trigger.dataset.currentVersion.replace(/^V/i, '')}`)
            : '';
        if (!modal.classList.contains('is-open')) showModal();
        const ticket = ++request;
        if (displayedTool === toolKey) {
            body.scrollTop = 0;
            return;
        }
        displayedTool = null;
        renderMessage('버전 기록을 불러오는 중입니다.');

        try {
            const entries = await loadMarkdown(toolKey);
            if (ticket !== request) return;
            const empty = '등록된 버전 기록이 없습니다.';
            InoSite.renderHistory(body, entries, window.InoRobotI18n?.translate(empty) || empty);
            displayedTool = toolKey;
        } catch (error) {
            if (ticket !== request) return;
            renderMessage('버전 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
    }

    document.querySelectorAll('[data-debug-history]').forEach((button) => {
        button.addEventListener('click', () => openHistory(button.dataset.debugHistory, button));
    });

    closeButton.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
    });

    document.addEventListener('inorobot:languagechange', async () => {
        Object.keys(markdownPromises).forEach((key) => delete markdownPromises[key]);
        displayedTool = null;
        request++;
        if (activeToolKey && modal.classList.contains('is-open')) openHistory(activeToolKey, lastFocusedElement);
    });
})();
