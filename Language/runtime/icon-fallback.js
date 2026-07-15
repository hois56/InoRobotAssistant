(function () {
    'use strict';

    const symbols = {
        'activity': '∿',
        'arrow-left': '←',
        'badge-check': '✓',
        'book-open': '▤',
        'box': '◈',
        'bug': '◇',
        'calculator': '∑',
        'code': '</>',
        'cpu': '▣',
        'download': '↓',
        'edit-3': '✎',
        'file-spreadsheet': '▦',
        'folder': '▱',
        'git-compare': '⇄',
        'graduation-cap': '△',
        'history': '↻',
        'info': 'i',
        'layers': '▤',
        'list-checks': '☑',
        'monitor': '▣',
        'network': '⎔',
        'package': '▣',
        'plus': '+',
        'refresh-cw': '↻',
        'scroll-text': '≡',
        'search': '⌕',
        'settings': '⚙',
        'tag': '◇',
        'target': '◎',
        'wrench': '⚙',
        'x': '×'
    };

    function apply(root) {
        const icons = [];
        if (root && root.nodeType === Node.ELEMENT_NODE && root.matches('i[data-lucide]')) icons.push(root);
        if (root && root.querySelectorAll) icons.push(...root.querySelectorAll('i[data-lucide]'));
        icons.forEach(function (icon) {
            if (icon.textContent.trim()) return;
            icon.textContent = symbols[icon.dataset.lucide] || '•';
            icon.classList.add('inorobot-icon-fallback');
        });
    }

    function start() {
        apply(document);
        if (!document.body) return;
        new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(apply);
            });
        }).observe(document.body, { childList: true, subtree: true });
    }

    window.InoRobotIconFallback = { apply: apply };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
