(function () {
    'use strict';

    const cardHeadings = {
        robotSelect: 'Robot Model Select',
        robot3dViewer: 'Robot 3D Viewer',
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

    let historyMarkdownPromise = null;
    let lastFocusedElement = null;
    let previousBodyOverflow = '';
    let activeCardKey = null;

    function getEmbeddedHistoryMarkdown() {
        const locale = window.InoRobotI18n?.locale || 'ko';
        const localized = window.INOROBOT_LOCALES?.[locale]?.historyMarkdown;
        if (locale !== 'ko' && localized) return localized;

        const encoded = window.SITE_CARD_HISTORY_MARKDOWN_BASE64;
        if (!encoded) return null;

        try {
            const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
            return new TextDecoder('utf-8').decode(bytes);
        } catch (error) {
            console.error('내장된 버전 기록을 읽지 못했습니다.', error);
            return null;
        }
    }

    function loadHistoryMarkdown() {
        if (!historyMarkdownPromise) {
            const embeddedMarkdown = getEmbeddedHistoryMarkdown();
            const locale = window.InoRobotI18n?.locale || 'ko';

            if (locale !== 'ko') {
                historyMarkdownPromise = embeddedMarkdown
                    ? Promise.resolve(embeddedMarkdown)
                    : Promise.reject(new Error('Localized history data is unavailable'));
            } else if (window.location.protocol === 'file:') {
                historyMarkdownPromise = embeddedMarkdown
                    ? Promise.resolve(embeddedMarkdown)
                    : Promise.reject(new Error('Embedded history data is unavailable'));
            } else {
                historyMarkdownPromise = fetch('./UPDATE_HISTORY.md', { cache: 'no-cache' })
                    .then((response) => {
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        return response.text();
                    })
                    .catch((error) => {
                        if (embeddedMarkdown) return embeddedMarkdown;
                        historyMarkdownPromise = null;
                        throw error;
                    });
            }
        }

        return historyMarkdownPromise;
    }

    function extractCardSection(markdown, heading) {
        const lines = markdown.split(/\r?\n/);
        const startIndex = lines.findIndex((line) => line.trim() === `## ${heading}`);
        if (startIndex < 0) return [];

        let endIndex = lines.length;
        for (let index = startIndex + 1; index < lines.length; index += 1) {
            const line = lines[index].trim();
            if (line === '---' || line.startsWith('## ')) {
                endIndex = index;
                break;
            }
        }

        return lines.slice(startIndex + 1, endIndex);
    }

    function appendInlineMarkdown(container, value) {
        const parts = String(value || '').split(/(`[^`]+`)/g);

        parts.forEach((part) => {
            if (part.startsWith('`') && part.endsWith('`')) {
                const code = document.createElement('code');
                code.textContent = part.slice(1, -1);
                container.appendChild(code);
            } else if (part) {
                container.appendChild(document.createTextNode(part));
            }
        });
    }

    function renderHistory(lines) {
        body.replaceChildren();
        let versionBlock = null;

        lines.forEach((line) => {
            const trimmed = line.trim();

            if (trimmed.startsWith('### ')) {
                versionBlock = document.createElement('section');
                versionBlock.className = 'history-version-block';

                const versionTitle = document.createElement('h3');
                versionTitle.className = 'history-version-title';
                versionTitle.textContent = trimmed.slice(4).trim();
                versionBlock.appendChild(versionTitle);
                body.appendChild(versionBlock);
                return;
            }

            if (!versionBlock || !trimmed.startsWith('- ')) return;

            const rawEntry = trimmed.slice(2).trim();
            const tagMatch = rawEntry.match(/^`\[([^\]]+)\]`\s*(.*)$/)
                || rawEntry.match(/^\*\*\[([^\]]+)\]\*\*\s*(.*)$/);
            const tagName = tagMatch ? tagMatch[1] : '안내';
            const description = tagMatch ? tagMatch[2] : rawEntry;

            const entry = document.createElement('div');
            entry.className = 'history-entry';

            const tag = document.createElement('span');
            tag.className = 'history-tag';
            tag.dataset.tag = tagName;
            tag.textContent = tagName;

            const text = document.createElement('div');
            appendInlineMarkdown(text, description);

            entry.append(tag, text);
            versionBlock.appendChild(entry);
        });

        if (!body.children.length) {
            const message = document.createElement('p');
            message.className = 'history-message';
            message.textContent = '등록된 버전 기록이 없습니다.';
            body.appendChild(message);
        }

        body.scrollTop = 0;
    }

    function renderMessage(message) {
        const text = document.createElement('p');
        text.className = 'history-message';
        text.textContent = message;
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
        title.textContent = heading;

        const version = window.SITE_CARD_VERSIONS?.[cardKey];
        currentVersion.textContent = version ? `Current Ver ${version}` : '';
        renderMessage('버전 기록을 불러오는 중입니다.');
        showModal();

        try {
            const markdown = await loadHistoryMarkdown();
            renderHistory(extractCardSection(markdown, heading));
        } catch (error) {
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

    document.addEventListener('inorobot:languagechange', async () => {
        historyMarkdownPromise = null;
        if (!activeCardKey || !modal.classList.contains('is-open')) return;
        const heading = cardHeadings[activeCardKey];
        title.textContent = heading;
        renderMessage('버전 기록을 불러오는 중입니다.');
        try {
            const markdown = await loadHistoryMarkdown();
            renderHistory(extractCardSection(markdown, heading));
        } catch {
            renderMessage('버전 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
    });
})();
