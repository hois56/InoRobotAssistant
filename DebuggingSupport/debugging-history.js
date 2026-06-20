(function () {
    'use strict';

    const tools = {
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

    function getEmbeddedMarkdown(toolKey) {
        const encoded = window.DEBUGGING_HISTORY_DATA?.[toolKey];
        if (!encoded) return null;

        try {
            const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
            return new TextDecoder('utf-8').decode(bytes);
        } catch (error) {
            console.error('내장된 디버깅 툴 버전 기록을 읽지 못했습니다.', error);
            return null;
        }
    }

    function loadMarkdown(toolKey) {
        if (markdownPromises[toolKey]) return markdownPromises[toolKey];

        const tool = tools[toolKey];
        const embeddedMarkdown = getEmbeddedMarkdown(toolKey);

        if (window.location.protocol === 'file:') {
            markdownPromises[toolKey] = embeddedMarkdown
                ? Promise.resolve(embeddedMarkdown)
                : Promise.reject(new Error('Embedded history data is unavailable'));
        } else {
            markdownPromises[toolKey] = fetch(tool.markdownPath, { cache: 'no-cache' })
                .then((response) => {
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return response.text();
                })
                .catch((error) => {
                    if (embeddedMarkdown) return embeddedMarkdown;
                    delete markdownPromises[toolKey];
                    throw error;
                });
        }

        return markdownPromises[toolKey];
    }

    function appendInlineMarkdown(container, value) {
        String(value || '').split(/(`[^`]+`)/g).forEach((part) => {
            if (part.startsWith('`') && part.endsWith('`')) {
                const code = document.createElement('code');
                code.textContent = part.slice(1, -1);
                container.appendChild(code);
            } else if (part) {
                container.appendChild(document.createTextNode(part));
            }
        });
    }

    function renderHistory(markdown) {
        body.replaceChildren();
        let versionBlock = null;

        markdown.split(/\r?\n/).forEach((line) => {
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
            const tagMatch = rawEntry.match(/^`\[([^\]]+)\]`\s*(.*)$/);
            const tagName = tagMatch ? tagMatch[1] : '안내';
            const description = tagMatch ? tagMatch[2] : rawEntry;
            const entry = document.createElement('div');
            const tag = document.createElement('span');
            const text = document.createElement('div');

            entry.className = 'history-entry';
            tag.className = 'history-tag';
            tag.dataset.tag = tagName;
            tag.textContent = tagName;
            appendInlineMarkdown(text, description);
            entry.append(tag, text);
            versionBlock.appendChild(entry);
        });

        if (!body.children.length) renderMessage('등록된 버전 기록이 없습니다.');
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

    async function openHistory(toolKey, trigger) {
        const tool = tools[toolKey];
        if (!tool) return;

        lastFocusedElement = trigger;
        title.textContent = tool.title;
        currentVersion.textContent = trigger.dataset.currentVersion
            ? `Current Ver ${trigger.dataset.currentVersion.replace(/^V/i, '')}`
            : '';
        renderMessage('버전 기록을 불러오는 중입니다.');
        showModal();

        try {
            renderHistory(await loadMarkdown(toolKey));
        } catch (error) {
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
})();
