(function () {
    'use strict';

    // Runs inside the real tool page that the home "사용 가이드" player shows in an iframe.
    // Every guide is a list of steps. The player owns the clock and tells this script which
    // step is active and how far into it we are; everything visible (scroll, pointer, clicks,
    // typing, dropdowns, toasts) is derived from that time, so pausing and seeking always
    // land on the same picture.
    const params = new URLSearchParams(window.location.search);
    const embedMode = params.get('embed');
    const path = window.location.pathname;
    const app = window.self === window.top ? ''
        : path.includes('/1_RobotModelSelect/') ? (embedMode === 'manual' ? 'model' : '')
            : embedMode !== 'manual-guide' ? ''
                : path.includes('/2_3DSimulation/') ? 'simulation'
                    : path.includes('/3_ToolSelector/') ? 'tool'
                        : path.includes('/4_ProjectGenerator/') ? 'project'
                            : path.includes('/6_Document/') ? 'document' : '';
    if (!app) return;

    document.documentElement.dataset.toolGuideEmbed = app;

    // A page scroll takes SCROLL_MS, longer for a long way so the page never rushes past in a blur:
    // dense text sweeping by faster than SCROLL_PEAK_SPEED (page px per ms, at the middle of the
    // eased scroll) flickers. SCROLL_MAX_MS only bounds very long scrolls.
    const SCROLL_MS = 420;
    const SCROLL_MAX_MS = 2000;
    const SCROLL_PEAK_SPEED = 1.2;
    const GLIDE_MS = 520;
    const CLICK_MS = 460;
    const TYPE_MS = 85;
    // After a click opens or changes something, the lit area moves to that result this much later.
    const RESULT_DELAY = 350;
    // Size the camera reserves for the download/notice toast (bottom right of the page).
    const TOAST_BOX = { width: 460, height: 70, right: 24, bottom: 22 };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const translate = source => window.InoRobotI18n?.translate(source) || source;
    const $ = selector => document.querySelector(selector);
    const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

    function waitFor(test, timeout = 15000, interval = 100) {
        return new Promise((resolve, reject) => {
            const started = performance.now();
            const poll = () => {
                let result = null;
                try { result = test(); } catch { result = null; }
                if (result) { resolve(result); return; }
                if (performance.now() - started >= timeout) { reject(new Error('Guide target timed out.')); return; }
                window.setTimeout(poll, interval);
            };
            poll();
        });
    }

    // ---------------------------------------------------------------- effects

    let cursor = null;
    let ring = null;
    let ripple = null;
    let caret = null;
    let toast = null;
    let menuEl = null;
    let menuKey = '';
    let pressedEl = null;
    let cursorAt = null;

    function injectStyles() {
        if (document.querySelector('[data-tool-guide-runtime-style]')) return;
        const style = document.createElement('style');
        style.dataset.toolGuideRuntimeStyle = 'true';
        style.textContent = `
            html[data-tool-guide-embed] { scroll-behavior: auto !important; }
            html[data-tool-guide-embed] [data-i18n-language-slot],
            html[data-tool-guide-embed] #inorobot-language-switcher,
            html[data-tool-guide-embed] .viewer-language-row { display: none !important; }
            html[data-tool-guide-embed] a[href="/"],
            html[data-tool-guide-embed] .logo-link { pointer-events: none !important; }
            html[data-tool-guide-embed="simulation"] #program-panel { left:16px !important; right:auto !important; width:300px !important; }
            html[data-tool-guide-embed="project"] #prjName { caret-color:transparent; }
            html[data-tool-guide-embed="project"] #prismContainer { max-height:410px !important; min-height:0 !important; overflow:auto !important; }
            .tool-guide-cursor { position:fixed; left:0; top:0; z-index:2147483646; width:26px; height:32px; color:var(--tool-action); opacity:0; pointer-events:none; filter:drop-shadow(0 1px 2px rgba(0,0,0,.28)); transform:translate3d(-80px,-80px,0); transition:opacity .16s ease; }
            .tool-guide-cursor svg { display:block; width:100%; height:100%; transform-origin:top left; }
            .tool-guide-cursor.is-visible { opacity:1; }
            .tool-guide-ring { position:fixed; left:0; top:0; z-index:2147483643; border:2px solid var(--tool-accent); border-radius:8px; opacity:0; pointer-events:none; box-shadow:0 0 0 3px rgb(255 255 255 / 65%); transition:opacity .2s ease; }
            .tool-guide-ring.is-visible { opacity:1; }
            .tool-guide-ripple { position:fixed; left:0; top:0; z-index:2147483645; width:14px; height:14px; margin:-7px 0 0 -7px; border:2px solid var(--tool-accent); box-shadow:0 0 0 1px white; border-radius:999px; opacity:0; pointer-events:none; }
            .tool-guide-caret { position:fixed; z-index:2147483644; width:2px; background:var(--tool-accent); pointer-events:none; }
            .tool-guide-pressed { transform:scale(.97) !important; transition:transform .1s ease !important; }
            .tool-guide-toast { position:fixed; right:24px; bottom:22px; z-index:2147483645; display:flex; align-items:center; gap:12px; min-width:320px; max-width:calc(100vw - 48px); padding:14px 16px; border:1px solid var(--tool-border-strong); border-radius:10px; background:var(--tool-surface); color:var(--tool-ink); box-shadow:0 4px 16px rgb(22 55 82 / 16%); animation:toolGuideToastIn .3s cubic-bezier(.16,1,.3,1) 1; }
            .tool-guide-toast-check { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; flex:0 0 auto; border-radius:999px; background:var(--tool-selected); color:var(--tool-accent); font-weight:800; }
            .tool-guide-toast strong,.tool-guide-toast small { display:block; }
            .tool-guide-toast strong { font:700 15px/1.3 system-ui,sans-serif; }
            .tool-guide-toast small { margin-top:4px; color:var(--tool-muted); font:13px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
            .tool-guide-menu { position:fixed; z-index:2147483642; overflow:auto; max-height:252px; padding:6px; border:1px solid var(--tool-border-strong); border-radius:10px; background:var(--tool-surface); color:var(--tool-ink); box-shadow:0 4px 16px rgb(22 55 82 / 16%); pointer-events:none; font:500 16px/1.4 system-ui,sans-serif; }
            .tool-guide-menu [role="option"] { min-height:40px; padding:9px 12px; border-radius:5px; white-space:nowrap; }
            .tool-guide-menu [aria-selected="true"] { background:var(--tool-inset); }
            .tool-guide-menu .is-hovered { background:var(--tool-selected); }
            .tool-guide-menu-group { padding:7px 12px; color:var(--tool-muted); font-size:13px; }
            .tool-guide-snap-anchor { position:fixed; width:120px; height:120px; pointer-events:none; }
            html[data-tool-guide-embed="document"] .tool-guide-revealing .filter-section-content { animation:toolGuideSectionOpen .26s cubic-bezier(.16,1,.3,1) 1; }
            .tool-guide-document-viewer { position:fixed; inset:20px 64px; z-index:2147483638; display:flex; overflow:hidden; flex-direction:column; border:1px solid var(--tool-border-strong); border-radius:10px; background:var(--tool-inset); box-shadow:0 8px 28px rgb(22 55 82 / 18%); animation:toolGuideViewerIn .32s cubic-bezier(.16,1,.3,1) 1 both; }
            .tool-guide-document-viewer.is-instant { animation:none; }
            .tool-guide-document-viewer.is-closing { animation:toolGuideViewerOut .2s cubic-bezier(.4,0,1,1) 1 forwards; }
            .tool-guide-document-viewer>header { display:flex; align-items:center; gap:12px; min-height:48px; padding:0 8px 0 16px; border-bottom:1px solid var(--tool-line); background:var(--tool-header); color:var(--tool-ink); }
            .tool-guide-document-icon { display:inline-flex; align-items:center; justify-content:center; width:34px; height:22px; flex:0 0 auto; border-radius:4px; background:#d64545; color:#fff; font:800 11px/1 system-ui,sans-serif; letter-spacing:.04em; }
            .tool-guide-document-title { min-width:0; flex:1; overflow:hidden; font:600 14px/1.25 system-ui,sans-serif; text-overflow:ellipsis; white-space:nowrap; }
            .tool-guide-document-close { display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; flex:0 0 auto; padding:0; border:0; border-radius:6px; background:transparent; color:var(--tool-muted); font:400 24px/1 system-ui,sans-serif; }
            .tool-guide-document-page-wrap { flex:1; overflow:auto; padding:28px 28px 4px; scrollbar-width:thin; scrollbar-color:#8b95a5 transparent; }
            .tool-guide-document-page { position:relative; display:flex; flex-direction:column; width:min(600px,100%); aspect-ratio:210/297; margin:0 auto 24px; padding:48px 52px 36px; background:#fff; color:#111827; box-shadow:0 1px 4px rgba(15,23,42,.3); font-family:Arial,Helvetica,sans-serif; }
            .tool-guide-document-page .doc-brand { color:#1f5fa8; font-size:14px; font-weight:800; letter-spacing:.16em; }
            .tool-guide-document-page .doc-art { display:block; width:100%; height:auto; margin-top:36px; }
            .tool-guide-document-page h1,.tool-guide-document-page h2 { color:#111827; font-family:Arial,Helvetica,sans-serif; font-weight:700; letter-spacing:0; }
            .tool-guide-document-page h1 { margin:40px 0 10px; font-size:30px; line-height:1.2; }
            .tool-guide-document-page .doc-sub { color:#475569; font-size:17px; line-height:1.4; }
            .tool-guide-document-page .doc-rule { width:56px; height:3px; margin:22px 0; background:#1f5fa8; }
            .tool-guide-document-page .doc-foot { display:flex; justify-content:space-between; margin-top:auto; padding-top:12px; border-top:1px solid #d5dbe3; color:#64748b; font-size:12px; }
            .tool-guide-document-page h2 { margin:0 0 20px; padding-bottom:12px; border-bottom:2px solid #111827; font-size:22px; line-height:1.2; }
            .tool-guide-document-page .doc-toc { display:flex; align-items:baseline; gap:10px; padding:10px 0; border-bottom:1px solid #e5e9ef; font-size:15px; line-height:1.4; }
            .tool-guide-document-page .doc-toc b { width:22px; color:#1f5fa8; }
            .tool-guide-document-page .doc-toc i { flex:1; align-self:flex-end; margin-bottom:5px; border-bottom:1px dotted #9aa5b4; }
            @keyframes toolGuideToastIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
            @keyframes toolGuideViewerIn { from{opacity:0;transform:translateY(14px) scale(.985)} to{opacity:1;transform:translateY(0) scale(1)} }
            @keyframes toolGuideViewerOut { from{opacity:1;transform:translateY(0) scale(1)} to{opacity:0;transform:translateY(10px) scale(.985)} }
            @keyframes toolGuideSectionOpen { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
            @media (prefers-reduced-motion:reduce) { .tool-guide-toast,.tool-guide-document-viewer,.tool-guide-revealing .filter-section-content { animation:none !important; } }
        `;
        document.head.appendChild(style);
    }

    function ensureEffects() {
        injectStyles();
        if (cursor) return;
        cursor = document.createElement('div');
        cursor.className = 'tool-guide-cursor';
        cursor.setAttribute('aria-hidden', 'true');
        cursor.innerHTML = '<svg viewBox="0 0 24 30" fill="currentColor" stroke="white" stroke-width="1.5" stroke-linejoin="round"><path d="M2.2 1.6 20.4 17c.9.8.3 2.3-.9 2.3h-7l-3.7 7.8c-.5 1.1-2.1.9-2.4-.2L.4 3.2c-.4-1.4.8-2.5 1.8-1.6Z"/></svg>';
        ring = document.createElement('div');
        ring.className = 'tool-guide-ring';
        ring.setAttribute('aria-hidden', 'true');
        ripple = document.createElement('div');
        ripple.className = 'tool-guide-ripple';
        ripple.setAttribute('aria-hidden', 'true');
        document.body.append(ring, ripple, cursor);
    }

    // A native modal <dialog> sits in the top layer, so effects must live inside it to stay visible.
    function mountEffects() {
        const host = document.querySelector('dialog[open]') || document.body;
        [ring, ripple, cursor, caret, menuEl, toast].forEach(element => {
            if (element && element.parentElement !== host) host.appendChild(element);
        });
    }

    function closeToast() {
        toast?.remove();
        toast = null;
    }

    function showToast(title, detail) {
        closeToast();
        toast = document.createElement('div');
        toast.className = 'tool-guide-toast';
        toast.setAttribute('role', 'status');
        toast.innerHTML = '<span class="tool-guide-toast-check" aria-hidden="true">✓</span><span><strong></strong><small></small></span>';
        toast.querySelector('strong').textContent = translate(title);
        toast.querySelector('small').textContent = detail || '';
        (document.querySelector('dialog[open]') || document.body).appendChild(toast);
    }

    function closeMenu() {
        menuEl?.remove();
        menuEl = null;
        menuKey = '';
    }

    function setPressed(element) {
        if (pressedEl === element) return;
        pressedEl?.classList.remove('tool-guide-pressed');
        pressedEl = element || null;
        pressedEl?.classList.add('tool-guide-pressed');
    }

    function clearEffects() {
        cursor?.classList.remove('is-visible');
        ring?.classList.remove('is-visible');
        if (ripple) ripple.style.opacity = '0';
        caret?.remove();
        caret = null;
        closeMenu();
        closeToast();
        setPressed(null);
        cursorAt = null;
        APP.clearEffects?.();
    }

    // ---------------------------------------------------------------- DOM helpers

    function resolveOne(item, elapsed) {
        const value = typeof item === 'function' ? item(elapsed) : item;
        if (value instanceof Element) return value.isConnected ? value : null;
        return typeof value === 'string' ? document.querySelector(value) : null;
    }

    function resolveAll(target, elapsed) {
        const value = typeof target === 'function' ? target(elapsed) : target;
        return (Array.isArray(value) ? value : [value]).map(item => resolveOne(item, elapsed)).filter(Boolean);
    }

    function resolve(target, elapsed) {
        return resolveAll(target, elapsed)[0] || null;
    }

    // Keep a result toast inside the highlighted area so the player does not dim it.
    const withToast = target => Object.assign(elapsed => [...resolveAll(target, elapsed), toast], { withToast: true });

    function rectOf(element) {
        const rect = element.getBoundingClientRect();
        if (!rect.width && !rect.height) return null;
        if (element.matches('input[type="range"]')) {
            const min = Number(element.min || 0);
            const max = Number(element.max || 100);
            const fraction = Math.max(0, Math.min(1, (Number(element.value) - min) / ((max - min) || 1)));
            return { left: rect.left + 8 + (rect.width - 16) * fraction - 12, top: rect.top + rect.height / 2 - 12, width: 24, height: 24 };
        }
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }

    function unionRect(elements) {
        const rects = elements.map(rectOf).filter(Boolean);
        if (!rects.length) return null;
        const left = Math.min(...rects.map(rect => rect.left));
        const top = Math.min(...rects.map(rect => rect.top));
        const right = Math.max(...rects.map(rect => rect.left + rect.width));
        const bottom = Math.max(...rects.map(rect => rect.top + rect.height));
        return { left, top, width: right - left, height: bottom - top };
    }

    function setValue(targetLike, value, eventType = 'input') {
        const element = resolveOne(targetLike);
        if (!element) return null;
        const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype
            : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype
                : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : null;
        const setter = prototype && Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (setter) setter.call(element, String(value));
        else element.value = String(value);
        element.dispatchEvent(new Event(eventType, { bubbles: true }));
        return element;
    }

    function chooseOption(select, matcher) {
        if (!select) return null;
        const option = Array.from(select.options).find(candidate => candidate.value && matcher(candidate))
            || Array.from(select.options).find(candidate => candidate.value);
        if (!option) return null;
        if (select.value !== option.value) {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return option;
    }

    function scrollPosition(node) {
        return node === document.scrollingElement
            ? { left: window.scrollX, top: window.scrollY }
            : { left: node.scrollLeft, top: node.scrollTop };
    }

    function setScrollPosition(node, position) {
        if (node === document.scrollingElement) window.scrollTo(position.left, position.top);
        else { node.scrollLeft = position.left; node.scrollTop = position.top; }
    }

    // Bottom edge of a header that stays pinned to the top of the page while it scrolls.
    function pinnedTop() {
        let inset = 0;
        document.querySelectorAll('body > header, body > nav').forEach(element => {
            if (!/sticky|fixed/.test(getComputedStyle(element).position)) return;
            const rect = element.getBoundingClientRect();
            if (rect.top <= 1 && rect.height < window.innerHeight / 3) inset = Math.max(inset, rect.bottom);
        });
        return inset;
    }

    // A fixed or sticky element (a modal, a toolbar) does not move when its page scrolls.
    function pinnedWithin(element, container) {
        for (let node = element; node && node !== container && node !== document.body; node = node.parentElement) {
            const position = getComputedStyle(node).position;
            if (position === 'fixed' || position === 'sticky') return true;
        }
        return false;
    }

    // Already readable where it is: inside the page view (below a pinned header) and inside every
    // scrolling box around it.
    function comfortablyVisible(rect, nodes) {
        let top = pinnedTop();
        let bottom = window.innerHeight;
        let left = 0;
        let right = window.innerWidth;
        nodes.forEach(node => {
            if (node === document.scrollingElement) return;
            const box = node.getBoundingClientRect();
            top = Math.max(top, box.top);
            bottom = Math.min(bottom, box.top + node.clientHeight);
            left = Math.max(left, box.left);
            right = Math.min(right, box.left + node.clientWidth);
        });
        const margin = 8;
        return rect.top >= top + margin && rect.top + rect.height <= bottom - margin && rect.left >= left - 1 && rect.left + rect.width <= right + 1;
    }

    function getScrollableNodes(target) {
        const nodes = [];
        let parent = target.parentElement;
        while (parent && parent !== document.body && parent !== document.documentElement) {
            const style = getComputedStyle(parent);
            const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight + 1;
            const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth + 1;
            if (canScrollY || canScrollX) nodes.push(parent);
            parent = parent.parentElement;
        }
        if (document.scrollingElement) nodes.push(document.scrollingElement);
        return nodes;
    }

    // ---------------------------------------------------------------- pieces drawn each frame

    // Where the fake dropdown sits: under the select, or above it when there is no room below.
    function menuPlacement(select, height) {
        const rect = select.getBoundingClientRect();
        const width = Math.min(window.innerWidth - 32, Math.max(260, rect.width));
        return {
            left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
            top: rect.bottom + height + 12 <= window.innerHeight ? rect.bottom + 6 : Math.max(12, rect.top - height - 6),
            width,
            height
        };
    }

    // The dropdown's box before it opens, so the camera can frame it from the start of the step.
    function predictMenuRect(spec, elapsed) {
        const select = resolve(spec.select, elapsed);
        if (!select) return null;
        if (menuEl && menuKey === `${stepIndex}:${select.id || select.name || ''}`) return menuPlacement(select, menuEl.offsetHeight);
        const options = Array.from(select.options).filter(option => option.value);
        const groups = new Set(options.map(option => (option.parentElement.tagName === 'OPTGROUP' ? option.parentElement : null)).filter(Boolean)).size;
        return menuPlacement(select, Math.min(252, options.length * 40 + groups * 31) + 14);
    }

    function toastArea() {
        return {
            left: window.innerWidth - TOAST_BOX.right - TOAST_BOX.width,
            top: window.innerHeight - TOAST_BOX.bottom - TOAST_BOX.height,
            width: TOAST_BOX.width,
            height: TOAST_BOX.height
        };
    }

    function renderMenu(spec, elapsed) {
        const select = spec && resolve(spec.select, elapsed);
        if (!select || elapsed < spec.open || elapsed >= spec.pick + 260) { closeMenu(); return null; }
        const key = `${stepIndex}:${select.id || select.name || ''}`;
        if (key !== menuKey) {
            closeMenu();
            menuKey = key;
            menuEl = document.createElement('div');
            menuEl.className = 'tool-guide-menu notranslate';
            menuEl.setAttribute('translate', 'no');
            menuEl.setAttribute('data-i18n-skip', '');
            menuEl.setAttribute('role', 'listbox');
            menuEl.setAttribute('aria-hidden', 'true');
            let group = null;
            Array.from(select.options).filter(option => option.value).forEach(option => {
                if (option.parentElement.tagName === 'OPTGROUP' && group !== option.parentElement) {
                    group = option.parentElement;
                    const label = document.createElement('div');
                    label.className = 'tool-guide-menu-group';
                    label.textContent = group.label;
                    menuEl.appendChild(label);
                }
                const row = document.createElement('div');
                row.setAttribute('role', 'option');
                row.textContent = option.textContent;
                row.dataset.value = option.value;
                if (spec.match(option) && !menuEl.querySelector('[data-demo-option]')) row.dataset.demoOption = 'true';
                menuEl.appendChild(row);
            });
            (document.querySelector('dialog[open]') || document.body).appendChild(menuEl);
            const option = menuEl.querySelector('[data-demo-option]');
            menuEl.scrollTop = Math.max(0, (option?.offsetTop || 0) - 100);
        }
        const place = menuPlacement(select, menuEl.offsetHeight);
        Object.assign(menuEl.style, { width: `${place.width}px`, left: `${place.left}px`, top: `${place.top}px` });
        const demo = menuEl.querySelector('[data-demo-option]');
        demo?.classList.toggle('is-hovered', elapsed >= spec.pick - 450);
        menuEl.querySelectorAll('[role="option"]').forEach(row => row.setAttribute('aria-selected', String(row.dataset.value === select.value)));
        return demo;
    }

    function applyMenu(spec) {
        if (spec.apply) { spec.apply(); return; }
        chooseOption(resolve(spec.select), spec.match);
    }

    function renderTyping(list, elapsed, final) {
        let active = null;
        for (const [selector, text, at] of list || []) {
            const input = resolveOne(selector);
            if (!input) continue;
            if (final) {
                if (input.value !== text) setValue(input, text);
                continue;
            }
            if (elapsed < at - 200) continue;
            const count = elapsed < at ? 0 : Math.min(text.length, Math.floor((elapsed - at) / TYPE_MS) + 1);
            let value = text.slice(0, count);
            // A number field rejects "0." as a value; keep the previous character until it is valid again.
            if (input.type === 'number' && /[.-]$/.test(value)) value = text.slice(0, count - 1);
            if (input.value !== value) setValue(input, value);
            if (elapsed < at + text.length * TYPE_MS + 250) active = input;
        }
        return active;
    }

    function drawCaret(input, elapsed) {
        if (!input) { caret?.remove(); caret = null; return; }
        if (!caret) {
            caret = document.createElement('div');
            caret.className = 'tool-guide-caret';
            caret.setAttribute('aria-hidden', 'true');
        }
        mountEffects();
        const rect = input.getBoundingClientRect();
        const style = getComputedStyle(input);
        const context = document.createElement('canvas').getContext('2d');
        context.font = style.font;
        const left = style.textAlign === 'right' || style.textAlign === 'end'
            ? rect.right - parseFloat(style.paddingRight) - 2
            : rect.left + parseFloat(style.paddingLeft) + context.measureText(input.value).width + 1;
        Object.assign(caret.style, {
            left: `${left}px`,
            top: `${rect.top + rect.height * .24}px`,
            height: `${Math.max(12, rect.height * .52)}px`,
            opacity: Math.floor(elapsed / 450) % 2 ? '0' : '1'
        });
    }

    function cursorTarget(rect, centered) {
        if (centered) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        return {
            x: Math.min(window.innerWidth - 28, Math.max(8, rect.left + Math.min(rect.width * .72, rect.width - 8))),
            y: Math.min(window.innerHeight - 34, Math.max(8, rect.top + Math.min(rect.height * .66, rect.height - 6)))
        };
    }

    function drawPointer(element, elapsed) {
        const rect = element && rectOf(element);
        if (!rect) {
            cursor.classList.remove('is-visible');
            run.arrived = true;
            return;
        }
        const destination = cursorTarget(rect, run.step.center);
        if (run.pointerEl !== element) {
            // The first target is reached from the start of the step (it follows the page while it
            // scrolls), so a seek into the middle of a step shows the pointer already there; later
            // targets glide from where it is. Short hops between neighbouring fields are quicker.
            run.pointerFrom = cursorAt;
            run.pointerSince = run.pointerEl ? elapsed : 0;
            run.previousPointerEl = run.pointerEl;
            run.pointerEl = element;
            const distance = cursorAt ? Math.hypot(destination.x - cursorAt.x, destination.y - cursorAt.y) : 140;
            run.glide = Math.max(220, Math.min(GLIDE_MS, 200 + distance));
        }
        const from = run.pointerFrom || { x: destination.x + 90, y: destination.y + 70 };
        const progress = reducedMotion.matches ? 1 : ease((elapsed - run.pointerSince) / run.glide);
        const x = from.x + (destination.x - from.x) * progress;
        const y = from.y + (destination.y - from.y) * progress;
        cursor.style.transform = `translate3d(${x}px,${y}px,0)`;
        cursor.classList.add('is-visible');
        cursorAt = { x, y };
        run.arrived = progress >= 1;
    }

    function drawRing(rect, visible) {
        if (!rect || !visible) { ring.classList.remove('is-visible'); return; }
        Object.assign(ring.style, {
            transform: `translate3d(${Math.round(rect.left - 5)}px,${Math.round(rect.top - 5)}px,0)`,
            width: `${Math.round(rect.width + 10)}px`,
            height: `${Math.round(rect.height + 10)}px`
        });
        ring.classList.add('is-visible');
    }

    const clickTimes = step => [...(step.click || []), ...(step.menu ? [step.menu.open, step.menu.pick] : [])];

    // The ring marks the control being used, so it goes away once the clicks and typing are done.
    function interactionEnd(step) {
        const ends = [
            ...clickTimes(step).map(time => time + CLICK_MS),
            ...(step.type || []).map(([, text, at]) => at + text.length * TYPE_MS + 250)
        ];
        return ends.length ? Math.max(...ends) : Infinity;
    }

    // When a click opens or changes something, the lit area moves from the control to that result.
    function resultTime(step) {
        if (!step.result) return Infinity;
        if (step.resultAt !== undefined) return step.resultAt;
        const times = [...clickTimes(step), ...(step.actions || []).map(([at]) => at)];
        return (times.length ? Math.max(...times) : 0) + RESULT_DELAY;
    }

    function drawClick(step, elapsed) {
        const clicks = clickTimes(step);
        const at = clicks.find(time => elapsed >= time && elapsed < time + CLICK_MS);
        const art = cursor.querySelector('svg');
        if (at === undefined || !cursorAt) {
            ripple.style.opacity = '0';
            art.style.transform = 'scale(1)';
            setPressed(null);
            return;
        }
        // The ripple stays where the click happened even if the pointer already heads to the next control.
        if (run.clickAt !== at) {
            const leaving = run.pointerSince === elapsed && run.previousPointerEl;
            run.clickAt = at;
            run.clickPoint = { ...cursorAt };
            run.clickEl = leaving ? run.previousPointerEl : run.pointerEl;
        }
        const progress = (elapsed - at) / CLICK_MS;
        Object.assign(ripple.style, {
            transform: `translate3d(${run.clickPoint.x}px,${run.clickPoint.y}px,0) scale(${.5 + progress * 3.7})`,
            opacity: String(1 - progress)
        });
        art.style.transform = progress < .3 && run.clickEl === run.pointerEl ? 'scale(.86)' : 'scale(1)';
        setPressed(progress < .35 && run.clickEl?.isConnected ? run.clickEl : null);
    }

    // ---------------------------------------------------------------- engine

    let prepared = false;
    let paused = true;
    let cueId = '';
    let cueStart = 0;
    let forceRebuild = false;
    let stepIndex = -1;
    let stepStart = 0;
    let lastTime = -1;
    let run = null;
    let focusRect = null;
    let focusKey = '';
    let cameraRect = null;
    let APP = null;
    const elementKeys = new WeakMap();
    let nextElementKey = 1;

    function elementKey(element) {
        if (!elementKeys.has(element)) elementKeys.set(element, nextElementKey++);
        return elementKeys.get(element);
    }

    function rebuild(index) {
        clearEffects();
        APP.reset();
        const from = APP.absolute ? Math.max(0, index - 1) : 0;
        for (let i = from; i < index; i += 1) completeStep(APP.steps[i]);
    }

    function completeStep(step) {
        if (step.complete) { step.complete(); return; }
        step.enter?.(true);
        if (step.menu) applyMenu(step.menu);
        (step.actions || []).forEach(([, action]) => action(false));
        renderTyping(step.type, 0, true);
    }

    function finishStep(current) {
        const { step } = current;
        (step.actions || []).forEach(([, action], index) => {
            if (current.fired.has(index)) return;
            current.fired.add(index);
            action(false);
        });
        if (step.menu && !current.menuApplied) applyMenu(step.menu);
        renderTyping(step.type, 0, true);
        closeMenu();
        drawCaret(null);
        setPressed(null);
    }

    const inResult = (step, elapsed) => elapsed >= resultTime(step);
    const targetOf = (step, elapsed) => (inResult(step, elapsed) ? step.result : step.target);

    // What the player's camera should frame: the lit target without the passing dropdown or toast,
    // plus the room those will need, so opening a dropdown or a toast never moves the picture.
    function cameraBox(step, elapsed) {
        const result = inResult(step, elapsed);
        const elements = resolveAll(result ? step.result : (step.view || step.target), elapsed).filter(element => element !== menuEl && element !== toast);
        const rects = [unionRect(elements)];
        if (step.menu && !result) rects.push(predictMenuRect(step.menu, elapsed));
        if (step.toast || step.target?.withToast) rects.push(toastArea());
        const present = rects.filter(Boolean);
        if (!present.length) return null;
        const left = Math.min(...present.map(rect => rect.left));
        const top = Math.min(...present.map(rect => rect.top));
        return {
            left, top,
            width: Math.max(...present.map(rect => rect.left + rect.width)) - left,
            height: Math.max(...present.map(rect => rect.top + rect.height)) - top
        };
    }

    // Scroll the step's target into view over SCROLL_MS, but only when it is not readable where it
    // already is. Called when a step starts and again whenever the step's target becomes a different
    // element (a dialog opened or closed, say).
    function planScroll(current, elapsed = 0, instant = false) {
        const { step } = current;
        if (step.scroll === false) return;
        const spec = inResult(step, elapsed) ? step.result : (step.scrollTarget || step.target);
        const anchor = resolve(spec, elapsed);
        if (anchor === current.scrollAnchor) return;
        // Something that is not shown yet (still loading, say) is planned again once it appears.
        const rect = anchor && rectOf(anchor);
        if (!rect) return;
        current.scrollAnchor = anchor;
        const nodes = getScrollableNodes(anchor);
        // Everything lit together (a part list and its 3D view, say) should come into view together.
        const area = unionRect(resolveAll(spec, elapsed).filter(element => element !== menuEl && element !== toast)) || rect;
        if (pinnedWithin(anchor, nodes[0]) || comfortablyVisible(area, nodes)) return;
        const before = nodes.map(scrollPosition);
        // Scroll margins make the browser frame the whole area: centred below the pinned header, or
        // starting at its top when it is taller than the view.
        const header = pinnedTop();
        const tall = area.height > (window.innerHeight - header) * .8;
        const margins = [anchor.style.scrollMarginTop, anchor.style.scrollMarginBottom];
        anchor.style.scrollMarginTop = `${rect.top - area.top + header + (tall ? 12 : 0)}px`;
        anchor.style.scrollMarginBottom = `${tall ? 0 : area.top + area.height - rect.top - rect.height}px`;
        anchor.scrollIntoView({ block: tall ? 'start' : 'center', inline: 'nearest' });
        [anchor.style.scrollMarginTop, anchor.style.scrollMarginBottom] = margins;
        const after = nodes.map(scrollPosition);
        current.finalRect = cameraBox(step, elapsed);
        nodes.forEach((node, index) => setScrollPosition(node, before[index]));
        const distance = Math.max(0, ...after.map((position, index) => Math.abs(position.top - before[index].top) + Math.abs(position.left - before[index].left)));
        if (distance > 1) {
            // The eased scroll peaks at 1.5x its average speed.
            const duration = Math.round(Math.min(SCROLL_MAX_MS, Math.max(SCROLL_MS, 280 + distance * 0.36, distance * 1.5 / SCROLL_PEAK_SPEED)));
            // A seek that lands after the target changed shows the finished scroll, not its start.
            current.scroll = { nodes, before, after, duration, at: instant ? elapsed - duration : elapsed };
            current.scrollDone = false;
        }
    }

    function enterStep(index) {
        const step = APP.steps[index];
        stepIndex = index;
        stepStart = cueStart;
        if (!step.keepToast) closeToast();
        run = { step, fired: new Set(), menuApplied: false, toastShown: false, scroll: null, scrollDone: false, scrollAnchor: undefined, finalRect: null, pointerEl: null, pointerFrom: cursorAt, pointerSince: 0, glide: GLIDE_MS, arrived: false, firstTick: true };
        step.enter?.(false);
        planScroll(run, 0);
    }

    function tickStep(elapsed) {
        const current = run;
        const { step } = current;
        mountEffects();
        // While paused the clock does not move, so a scroll planned now is shown already finished.
        planScroll(current, elapsed, (current.firstTick && elapsed > 0) || paused);
        current.firstTick = false;
        if (current.scroll && !current.scrollDone) {
            const progress = reducedMotion.matches ? 1 : ease((elapsed - current.scroll.at) / current.scroll.duration);
            current.scroll.nodes.forEach((node, index) => {
                const a = current.scroll.before[index];
                const b = current.scroll.after[index];
                setScrollPosition(node, { left: a.left + (b.left - a.left) * progress, top: a.top + (b.top - a.top) * progress });
            });
            current.scrollDone = progress >= 1;
        }
        (step.actions || []).forEach(([at, action], index) => {
            if (elapsed < at || current.fired.has(index)) return;
            current.fired.add(index);
            action(true);
        });
        if (run !== current) return;
        if (step.toast && elapsed >= step.toast[0] && !current.toastShown) {
            current.toastShown = true;
            showToast(step.toast[1], typeof step.toast[2] === 'function' ? step.toast[2]() : step.toast[2]);
        }
        step.tick?.(elapsed);
        let menuOption = null;
        if (step.menu) {
            menuOption = renderMenu(step.menu, elapsed);
            if (elapsed >= step.menu.pick && !current.menuApplied) {
                current.menuApplied = true;
                applyMenu(step.menu);
            }
        }
        const typing = renderTyping(step.type, elapsed, false);
        const pointer = step.pointer === false ? null
            : menuOption && elapsed >= step.menu.open + 120 ? menuOption
                : typing || resolve(step.pointer !== undefined ? step.pointer : step.target, elapsed);
        // After the click the pointer rests where it clicked, like a real mouse, even if the page scrolls.
        const resting = inResult(step, elapsed) && pointer && pointer === current.pointerEl && cursorAt;
        if (!resting) drawPointer(pointer, elapsed);
        const litElements = resolveAll(targetOf(step, elapsed), elapsed);
        const live = unionRect(litElements);
        focusRect = live;
        // Tells the player when the lit target becomes something else, so it slides the lit area there.
        focusKey = `${stepIndex}:${litElements.map(elementKey).join(',')}`;
        cameraRect = current.scroll && !current.scrollDone ? current.finalRect || cameraBox(step, elapsed) : cameraBox(step, elapsed);
        // The ring marks the control being used; the lit (undimmed) area around it is the step's target.
        // Once the control has been used (or what it opened is lit instead) the ring goes away.
        const ringOn = (typeof step.ring === 'function' ? step.ring(elapsed) : step.ring !== false)
            && !inResult(step, elapsed) && elapsed < interactionEnd(step);
        drawRing(pointer ? rectOf(pointer) : live, ringOn && (current.arrived || !pointer));
        drawClick(step, elapsed);
        drawCaret(typing, elapsed);
    }

    // The lit area where it will be once the page has finished scrolling, so the player moves the
    // highlight there once while the page scrolls under it. key changes when the lit target becomes
    // another element; moving is true while the page scrolls.
    function settledFocusRect() {
        if (!focusRect) return null;
        const scroll = run?.scroll;
        const moving = Boolean(scroll && !run.scrollDone);
        let left = 0;
        let top = 0;
        if (moving) {
            scroll.nodes.forEach((node, index) => {
                const position = scrollPosition(node);
                left += scroll.after[index].left - position.left;
                top += scroll.after[index].top - position.top;
            });
        }
        return { ...focusRect, left: focusRect.left - left, top: focusRect.top - top, key: focusKey, moving };
    }

    function renderTimelineCue(id, start = 0, force = false) {
        if (!prepared || !id) return false;
        if (force || id !== cueId || Number(start) !== cueStart) forceRebuild = forceRebuild || Boolean(force);
        cueId = String(id);
        cueStart = Number(start) || 0;
        return true;
    }

    function setTimelineTime(time) {
        if (!prepared || !cueId) return;
        const t = Math.max(0, Number(time) || 0);
        const index = APP.steps.findIndex(step => step.id === cueId);
        if (index < 0) return;
        const jumped = forceRebuild || lastTime < 0 || t < lastTime - 1 || t - lastTime > 400;
        if (index !== stepIndex || jumped) {
            if (!jumped && index === stepIndex + 1 && run) finishStep(run);
            else rebuild(index);
            enterStep(index);
        }
        forceRebuild = false;
        lastTime = t;
        tickStep(Math.max(0, t - stepStart));
    }

    function resetTimeline() {
        clearEffects();
        if (prepared) APP.reset();
        cueId = '';
        stepIndex = -1;
        lastTime = -1;
        run = null;
        focusRect = null;
        focusKey = '';
        cameraRect = null;
    }

    // ---------------------------------------------------------------- Tool Selector (mode D · STEP CAD)

    // A vacuum Tool (flange face at Z 0, Ø40 suction pad tip at Z 100) whose parts carry readable names.
    const TOOL_CAD_URL = '/0_Home/guide-assets/Single_VAC_Tool.step';
    const TOOL_CAD_NAME = 'Single_VAC_Tool.step';
    // A fixed date keeps the file identical between plays, so the page reuses its import cache.
    const TOOL_CAD_MODIFIED = Date.UTC(2026, 10, 16);
    const TOOL_CAD_PART = 'Air_fitting';
    const TOOL_CAD_MATERIAL = 'brass';
    const TOOL_TCP_Z = '100';
    const TOOL_ROBOT = 'S4';
    const TOOL_DEFAULT_ROBOT = 'R25';
    let toolCadFile = null;
    let toolCadJob = Promise.resolve();
    let toolCadGeneration = 0;

    const modeD = () => window.ToolModeD || null;
    const toolCadPart = () => Array.from(document.querySelectorAll('#cad-parts-list .cad-part-row'))
        .find(row => row.querySelector('b')?.textContent === TOOL_CAD_PART) || null;
    const toolCadMaterial = () => toolCadPart()?.querySelector('[data-part-material]') || null;
    const toolTcpZ = () => $('[data-vector="tcp"][data-axis="z"]');
    const isToolRobot = name => option => option.textContent.trim() === name;

    async function fetchToolCad() {
        if (!toolCadFile) {
            const response = await fetch(TOOL_CAD_URL);
            if (!response.ok) throw new Error('The guide CAD sample is missing.');
            toolCadFile = new File([await response.arrayBuffer()], TOOL_CAD_NAME, { lastModified: TOOL_CAD_MODIFIED });
        }
        return toolCadFile;
    }

    // Reading the CAD file is asynchronous, so everything that needs the loaded parts runs in order
    // behind it. Rewinding the guide starts a new generation and drops whatever was still queued.
    function queueToolCad(task) {
        const generation = toolCadGeneration;
        toolCadJob = toolCadJob
            .then(() => (generation === toolCadGeneration ? task() : null))
            .catch(error => console.error('Tool guide CAD step failed:', error));
        return toolCadJob;
    }

    const loadToolCad = () => queueToolCad(async () => modeD()?.loadFile(await fetchToolCad()));
    // Press the page's own buttons so it calculates exactly as for a user. The page's own smooth
    // scroll to the result is skipped: the guide scrolls to the result itself, and two scrolls
    // running at once made the picture shake.
    const pressToolCad = selector => () => queueToolCad(() => {
        const button = $(selector);
        if (!button) return;
        const scrollIntoView = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function () {};
        try { button.click(); } finally { Element.prototype.scrollIntoView = scrollIntoView; }
    });

    const TOOL = {
        prepare: async () => {
            await waitFor(() => $('#cad-robot')?.options.length && modeD()?.loadFile);
            // Read the sample once up front so the first play shows the model straight away.
            try { await modeD().loadFile(await fetchToolCad()); } catch (error) { console.error('Tool guide CAD warm-up failed:', error); }
            modeD().reset();
        },
        reset() {
            toolCadGeneration += 1;
            toolCadJob = Promise.resolve();
            modeD()?.reset();
            chooseOption($('#cad-robot'), isToolRobot(TOOL_DEFAULT_ROBOT));
            $('.tab[data-mode="direct"]')?.click();
            window.scrollTo(0, 0);
        },
        steps: [
            {
                id: 'tool_mode', target: '.tabs', pointer: '.tab[data-mode="cad"]', click: [800],
                actions: [[800, () => $('.tab[data-mode="cad"]')?.click()]], result: '#mode-cad .cad-top-grid'
            },
            {
                // The file dialog is skipped: the sample file is "chosen" a moment after the click.
                id: 'tool_cad_load', target: '.cad-import-section', pointer: '.cad-file-button', click: [800],
                actions: [[1100, loadToolCad]], result: ['.cad-parts-section', '.cad-viewport-shell'], resultAt: 1400
            },
            {
                id: 'tool_cad_material', target: () => [toolCadPart(), menuEl], pointer: toolCadMaterial,
                menu: {
                    select: toolCadMaterial, open: 800, pick: 2000, match: option => option.value === TOOL_CAD_MATERIAL,
                    apply: () => queueToolCad(() => chooseOption(toolCadMaterial(), option => option.value === TOOL_CAD_MATERIAL))
                }
            },
            {
                id: 'tool_cad_tcp', target: () => [toolTcpZ()?.closest('.cad-vector-block'), $('.cad-viewport-shell')], pointer: toolTcpZ,
                click: [800], type: [[toolTcpZ, TOOL_TCP_Z, 950]],
                actions: [[1300, () => queueToolCad(() => setValue(toolTcpZ(), TOOL_TCP_Z, 'change'))]]
            },
            { id: 'tool_cad_calc', target: '#cad-calculate', click: [800], actions: [[800, pressToolCad('#cad-calculate')]], result: '#cad-result', resultAt: 900 },
            {
                id: 'tool_cad_robot', target: () => [$('#cad-robot')?.closest('.row'), $('#cad-robot-spec'), menuEl], pointer: '#cad-robot',
                menu: {
                    select: '#cad-robot', open: 800, pick: 2000, match: isToolRobot(TOOL_ROBOT),
                    apply: () => queueToolCad(() => chooseOption($('#cad-robot'), isToolRobot(TOOL_ROBOT)))
                }
            },
            { id: 'tool_cad_judge', target: '#cad-robot-calculate', click: [800], actions: [[800, pressToolCad('#cad-robot-calculate')]], result: '#cad-robot-result' },
            { id: 'tool_overall', target: '#cad-robot-overall', pointer: false }
        ],
        state: () => ({
            mode: $('.tab.active')?.dataset.mode || '',
            parts: document.querySelectorAll('#cad-parts-list .cad-part-row').length,
            material: toolCadMaterial()?.value || '',
            tcp: toolTcpZ()?.value || '',
            mass: $('#cad-result')?.classList.contains('hide') ? '' : $('#cad-result-mass')?.textContent.trim() || '',
            robot: $('#cad-robot')?.selectedOptions[0]?.textContent.trim() || '',
            overall: $('#cad-robot-result')?.hidden ? '' : $('#cad-robot-overall')?.textContent.trim() || ''
        })
    };

    // ---------------------------------------------------------------- Project Generator

    const PROJECT_MODEL = /R25/i;
    let projectPackage = null;
    let projectPackageStarted = false;
    let projectGeneration = 0;
    let projectExportJob = Promise.resolve();

    const projectRow = index => document.querySelectorAll('#stepsList > div')[index] || null;
    const projectRowSelect = (row, index) => projectRow(row)?.querySelectorAll('select')[index] || null;

    function setProjectCheckbox(id, checked) {
        const checkbox = document.getElementById(id);
        if (!checkbox || checkbox.checked === Boolean(checked)) return;
        checkbox.checked = Boolean(checked);
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function openProjectOptions() {
        const modal = $('#optionsModal');
        if (modal?.classList.contains('hidden')) $('#btnOption')?.click();
    }

    function applyProjectOptions() {
        const modal = $('#optionsModal');
        if (modal && !modal.classList.contains('hidden')) $('#btnApplyOptions')?.click();
    }

    function setProjectProcess(row, index, value) {
        const select = projectRowSelect(row, index);
        if (!select || select.value === value) return;
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Process vocabulary in the generator is English; keep the demo dropdowns untranslated.
    function normalizeProjectSelects() {
        document.querySelectorAll('#stepsList select').forEach(select => {
            if (select.hasAttribute('data-i18n-skip')) return;
            select.setAttribute('data-i18n-skip', '');
            select.classList.add('notranslate');
            select.setAttribute('translate', 'no');
            Array.from(select.options).forEach(option => { if (option.textContent !== option.value) option.textContent = option.value; });
        });
    }

    function generateProjectPackage() {
        if (projectPackageStarted) return;
        projectPackageStarted = true;
        const generation = projectGeneration;
        projectExportJob = projectExportJob.then(async () => {
            if (generation !== projectGeneration) return;
            const originalSaveAs = window.saveAs;
            // Run the real generator but keep the tutorial ZIP in memory instead of downloading it.
            window.saveAs = (blob, name) => { if (generation === projectGeneration) projectPackage = { size: blob.size, name }; };
            try { await window.exportProj(); }
            finally { window.saveAs = originalSaveAs; }
        }).catch(error => console.error('Project guide generation failed:', error));
    }

    const PROJECT = {
        prepare: () => waitFor(() => $('#stepsList > div')),
        reset() {
            $('#guideModal')?.classList.add('hidden');
            $('#visionModal')?.classList.add('hidden');
            const options = $('#optionsModal');
            if (options && !options.classList.contains('hidden')) $('#btnCancelOptions')?.click();
            while (document.querySelectorAll('#stepsList > div').length > 1 && typeof window.rStep === 'function') {
                window.rStep(document.querySelectorAll('#stepsList > div').length - 1);
            }
            setValue('#prjName', 'InoRobot_');
            chooseOption($('#cmbRobotModel'), option => !PROJECT_MODEL.test(option.textContent));
            openProjectOptions();
            options?.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                if (!checkbox.checked) return;
                checkbox.checked = false;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            });
            setValue('#numRecipeCount', 2, 'change');
            applyProjectOptions();
            setProjectProcess(0, 0, 'Tray');
            setProjectProcess(0, 1, 'Get');
            normalizeProjectSelects();
            projectGeneration += 1;
            projectPackage = null;
            projectPackageStarted = false;
            window.scrollTo(0, 0);
        },
        steps: [
            { id: 'project_name', target: '#prjName', click: [800], type: [['#prjName', 'InoRobot_Demo', 950]] },
            { id: 'project_model', target: () => [$('#cmbRobotModel'), menuEl], pointer: '#cmbRobotModel', menu: { select: '#cmbRobotModel', open: 800, pick: 2000, match: option => PROJECT_MODEL.test(option.textContent) } },
            { id: 'project_row', target: () => projectRow(0), pointer: false },
            { id: 'project_add', target: '#btnAdd', click: [800], actions: [[800, () => { if (!projectRow(1)) $('#btnAdd')?.click(); normalizeProjectSelects(); }]], result: () => projectRow(1) },
            { id: 'project_type', target: () => [projectRow(1), menuEl], pointer: () => projectRowSelect(1, 0), menu: { select: () => projectRowSelect(1, 0), open: 800, pick: 2000, match: option => option.value === 'Stage' } },
            { id: 'project_method', target: () => [projectRow(1), menuEl], pointer: () => projectRowSelect(1, 1), menu: { select: () => projectRowSelect(1, 1), open: 800, pick: 2000, match: option => option.value === 'Put' } },
            { id: 'project_preview', target: '#prismContainer', pointer: false },
            { id: 'project_options', target: '#btnOption', click: [800], actions: [[800, openProjectOptions]], result: '#optionsModal > div' },
            { id: 'project_option_pick', target: () => $('#chkTcpSpeed')?.closest('label') || $('#chkTcpSpeed'), click: [800], actions: [[800, () => setProjectCheckbox('chkTcpSpeed', true)]] },
            { id: 'project_apply', target: '#btnApplyOptions', click: [700], actions: [[700, applyProjectOptions]], result: '#prismContainer' },
            {
                id: 'project_generate', target: withToast('#btnGenerate'), pointer: '#btnGenerate', click: [700], actions: [[700, generateProjectPackage]],
                tick: elapsed => { if (elapsed >= 1200 && projectPackage?.size && !toast) showToast('Project package is ready', projectPackage.name); }
            }
        ],
        state: () => ({ package: projectPackage, rows: document.querySelectorAll('#stepsList > div').length })
    };

    // ---------------------------------------------------------------- Document

    const DOCUMENT_HARDWARE_TOGGLE = '#filterToggleHardware';
    const DOCUMENT_QUERY = 'IR-S4';
    let preview = null;

    function closePreview() {
        preview?.remove();
        preview = null;
        document.querySelectorAll('.tool-guide-document-viewer').forEach(viewer => viewer.remove());
    }

    function dismissPreview() {
        const closing = preview;
        if (!closing) return;
        preview = null;
        closing.classList.add('is-closing');
        window.setTimeout(() => closing.remove(), reducedMotion.matches ? 0 : 220);
    }

    // The real "preview" button opens the PDF in a new tab, so the guide shows a PDF viewer tab
    // with a cover page and a table of contents.
    function showDocumentPreview(instant) {
        closePreview();
        const fileName = $('#manualList .manual-item h3')?.textContent.trim() || 'IR-S4&S7&S10 Series User Guide - Manipulator.pdf';
        const [heading, subtitle] = fileName.replace(/\.pdf$/i, '').split(/\s+-\s+/);
        preview = document.createElement('section');
        preview.className = `tool-guide-document-viewer${instant ? ' is-instant' : ''}`;
        preview.setAttribute('aria-hidden', 'true');
        preview.innerHTML = `
            <header><span class="tool-guide-document-icon">PDF</span><span class="tool-guide-document-title"></span><button type="button" class="tool-guide-document-close" aria-label="Close preview">×</button></header>
            <div class="tool-guide-document-page-wrap">
                <article class="tool-guide-document-page"><div class="doc-brand">INOVANCE</div><svg class="doc-art" viewBox="0 0 320 150" aria-hidden="true"><rect width="320" height="150" fill="#eef1f5"/><rect x="36" y="118" width="72" height="14" rx="2" fill="#c3ccd8"/><rect x="60" y="66" width="24" height="54" rx="3" fill="#9aa8ba"/><rect x="48" y="52" width="140" height="22" rx="11" fill="#1f5fa8"/><rect x="164" y="52" width="104" height="22" rx="11" fill="#2f78c7"/><rect x="250" y="64" width="8" height="52" fill="#6b7a8f"/><rect x="242" y="114" width="24" height="6" fill="#4a5568"/><circle cx="72" cy="63" r="5" fill="#eef1f5"/><circle cx="176" cy="63" r="5" fill="#eef1f5"/></svg><h1></h1><div class="doc-sub"></div><div class="doc-rule"></div><div class="doc-foot"><span>Inovance Technology</span><span>User Guide</span></div></article>
                <article class="tool-guide-document-page"><h2>Contents</h2>
                    <div class="doc-toc"><b>1</b>Safety Precautions<i></i>5</div><div class="doc-toc"><b>2</b>Product Overview<i></i>13</div><div class="doc-toc"><b>3</b>Installation<i></i>27</div><div class="doc-toc"><b>4</b>Electrical Connection<i></i>45</div><div class="doc-toc"><b>5</b>Maintenance<i></i>71</div></article>
            </div>`;
        preview.querySelector('.tool-guide-document-title').textContent = fileName;
        preview.querySelector('h1').textContent = heading;
        preview.querySelector('.doc-sub').textContent = subtitle || 'User Guide';
        document.body.appendChild(preview);
    }

    // Scroll from the cover to the table of contents, stopping with the contents at the top.
    function scrollDocumentPreview(progress) {
        const wrap = preview?.querySelector('.tool-guide-document-page-wrap');
        if (!wrap) return;
        const contents = wrap.querySelectorAll('.tool-guide-document-page')[1];
        const maximum = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
        const end = contents
            ? Math.min(maximum, wrap.scrollTop + contents.getBoundingClientRect().top - wrap.getBoundingClientRect().top - 24)
            : maximum;
        wrap.scrollTop = Math.max(0, end) * ease(progress);
    }

    function openDocumentSection(animate) {
        const toggle = $(DOCUMENT_HARDWARE_TOGGLE);
        const section = toggle?.closest('[data-filter-section]');
        if (!section || !section.classList.contains('is-collapsed')) return;
        if (animate) {
            section.classList.add('tool-guide-revealing');
            window.setTimeout(() => section.classList.remove('tool-guide-revealing'), 400);
        }
        toggle.click();
    }

    function selectDocumentType() {
        const button = $('#typeFilters [data-type="scara"]');
        if (button && !button.classList.contains('active')) button.click();
    }

    const documentRow = selector => () => $(`#manualList .manual-item ${selector}`);

    const DOCUMENT = {
        prepare: () => waitFor(() => $('#manualList .manual-item')),
        clearEffects: closePreview,
        reset() {
            closePreview();
            document.querySelectorAll('.filter-btn').forEach(button => button.classList.remove('active'));
            ['#typeFilters [data-type="all"]', '#catFilters [data-cat="all"]', '#eduFilters [data-cat="all"]'].forEach(selector => $(selector)?.classList.add('active'));
            document.querySelectorAll('[data-filter-section]').forEach(section => {
                section.classList.add('is-collapsed');
                section.classList.remove('tool-guide-revealing');
                section.querySelector('.filter-section-toggle')?.setAttribute('aria-expanded', 'false');
            });
            const search = $('#manualSearch');
            if (search) search.value = '';
            window.renderManuals?.();
            window.scrollTo(0, 0);
        },
        steps: [
            {
                id: 'doc_section', target: DOCUMENT_HARDWARE_TOGGLE, click: [800], actions: [[800, live => openDocumentSection(live)]],
                result: () => $(DOCUMENT_HARDWARE_TOGGLE)?.closest('[data-filter-section]')
            },
            { id: 'doc_type', target: '#typeFilters', pointer: '#typeFilters [data-type="scara"]', click: [800], actions: [[800, selectDocumentType]] },
            { id: 'doc_count', target: '.document-results', pointer: false, scroll: false },
            { id: 'doc_search', target: '#manualSearch', click: [800], type: [['#manualSearch', DOCUMENT_QUERY, 950]] },
            { id: 'doc_result', target: documentRow(''), pointer: false },
            {
                // The PDF opens like a new tab, so the pointer leaves the page with it.
                id: 'doc_view', click: [800], actions: [[1100, live => showDocumentPreview(!live)]],
                target: documentRow('[data-action="view"]'), result: '.tool-guide-document-viewer', resultAt: 1100,
                pointer: elapsed => (elapsed < 1100 ? documentRow('[data-action="view"]')() : null)
            },
            {
                id: 'doc_preview', target: '.tool-guide-document-viewer', pointer: false, scroll: false, ring: false,
                enter: () => { if (!preview) showDocumentPreview(true); },
                tick: elapsed => scrollDocumentPreview((elapsed - 300) / 2800),
                complete: () => { if (!preview) showDocumentPreview(true); scrollDocumentPreview(1); }
            },
            {
                id: 'doc_close', scroll: false, click: [800],
                target: '.tool-guide-document-close', result: documentRow(''), resultAt: 800,
                pointer: elapsed => (elapsed < 800 ? '.tool-guide-document-close' : null),
                enter: () => { if (!preview) { showDocumentPreview(true); scrollDocumentPreview(1); } },
                actions: [[800, live => (live ? dismissPreview() : closePreview())]]
            },
            { id: 'doc_download', target: withToast(documentRow('[data-action="download"]')), pointer: documentRow('[data-action="download"]'), click: [800], toast: [1300, 'Document download is ready', () => $('#manualList .manual-item h3')?.textContent.trim() || 'IR-S4 User Guide.pdf'] }
        ],
        state: () => ({ count: $('#manualCountValue')?.textContent || '', query: $('#manualSearch')?.value || '', preview: Boolean(preview) })
    };

    // ---------------------------------------------------------------- Robot Model Select

    const MODEL_ID = 'IR-R25-178S-INT';
    const MODEL_FILTERS = [['Type', '6-Axis'], ['Payload(kg)', '25'], ['Manipulator Length(mm)', '1783']];
    const modelApi = () => window.InoRobotModelManual || null;
    const modelFilter = index => () => document.querySelector(`.filter-option[data-filter-id="${CSS.escape(MODEL_FILTERS[index][0])}"][data-option-id="${CSS.escape(MODEL_FILTERS[index][1])}"]`);
    const modelCard = () => document.querySelector(`#product-container [data-product-id="${MODEL_ID}"]`);
    const modelOption = (name, value) => () => Array.from(document.querySelectorAll(`.modal-body input[name="${name}"]`)).find(input => input.value === value)?.closest('label') || null;
    const modelFilterRow = index => () => modelFilter(index)()?.closest('.filter-options')?.parentElement || modelFilter(index)();
    const modelOptionGroup = (name, value) => () => modelOption(name, value)()?.parentElement || null;
    const modelModalOpen = () => Boolean(document.querySelector('.modal-overlay[style*="flex"], #modal-overlay[style*="flex"]')) || Boolean(modelApi()?.getState?.().modalOpen);

    function selectModelFilter(index) {
        const button = modelFilter(index)();
        if (button && !button.classList.contains('active')) button.click();
    }

    function chooseModelOption(name, value) {
        const label = modelOption(name, value)();
        const input = label?.querySelector('input');
        if (input && !input.checked) label.click();
    }

    function openModelCard() {
        if (modelApi()?.getState?.().productId === MODEL_ID && modelModalOpen()) return;
        modelCard()?.click();
    }

    const MODEL = {
        prepare: () => waitFor(() => modelApi() && $('#product-container [data-product-id]')),
        reset() {
            modelApi()?.cancel?.();
            window.scrollTo(0, 0);
        },
        // Choice steps light up the whole group of choices; the pointer and ring mark the one picked.
        steps: [
            { id: 'model_type', target: modelFilterRow(0), pointer: modelFilter(0), click: [800], actions: [[800, () => selectModelFilter(0)]] },
            { id: 'model_payload', target: modelFilterRow(1), pointer: modelFilter(1), click: [800], actions: [[800, () => selectModelFilter(1)]] },
            { id: 'model_reach', target: modelFilterRow(2), pointer: modelFilter(2), click: [800], actions: [[800, () => selectModelFilter(2)]] },
            { id: 'model_result', target: modelCard, pointer: false },
            { id: 'model_open', target: modelCard, center: true, click: [800], actions: [[800, openModelCard]], result: '#options-modal .modal-content' },
            { id: 'model_cable', target: modelOptionGroup('cableTypeSelection', 'High Flex (유연형)'), pointer: modelOption('cableTypeSelection', 'High Flex (유연형)'), click: [800], actions: [[800, () => chooseModelOption('cableTypeSelection', 'High Flex (유연형)')]] },
            { id: 'model_pendant', target: modelOptionGroup('pendantConfig', 'without-cover'), pointer: modelOption('pendantConfig', 'without-cover'), click: [800], actions: [[800, () => chooseModelOption('pendantConfig', 'without-cover')]] },
            // The communication card is far down the options window; the scroll there takes about 1.3 s.
            { id: 'model_comm', target: modelOptionGroup('commSelection', 'IRCB501-2PN-BD'), pointer: modelOption('commSelection', 'IRCB501-2PN-BD'), click: [1500], actions: [[1500, () => chooseModelOption('commSelection', 'IRCB501-2PN-BD')]] },
            { id: 'model_code', target: '#dynamic-purchase-code', pointer: false },
            { id: 'model_cad', target: withToast('#download-cad-btn'), pointer: '#download-cad-btn', scroll: false, click: [700], toast: [1100, '다운로드 완료', `Inovance_CAD_${MODEL_ID}.zip`] },
            { id: 'model_add_cart', target: '#add-to-cart-btn', pointer: '#add-to-cart-btn', scroll: false, click: [800], actions: [[800, () => $('#add-to-cart-btn')?.click()]], result: '#cart-overlay .cart-panel', resultAt: 800 },
            { id: 'model_excel', target: withToast('#cart-download-btn'), pointer: '#cart-download-btn', scroll: false, click: [700], toast: [1100, '다운로드 완료', `Inovance_Config_${MODEL_ID}.xlsx`] },
            {
                id: 'model_preview', target: '.model-manual-document-viewer', pointer: false, scroll: false, ring: false,
                enter: () => modelApi()?.renderTimelineCue?.('preview', { force: true }),
                tick: elapsed => modelApi()?.setPreviewScroll?.(ease((elapsed - 400) / 2400)),
                complete: () => { modelApi()?.renderTimelineCue?.('preview', { force: true }); modelApi()?.setPreviewScroll?.(1); }
            }
        ],
        state: () => modelApi()?.getState?.() || null
    };

    // ---------------------------------------------------------------- 3D Simulation

    const simApi = () => window.InoRobotSimulationManual || null;
    let snapAnchor = null;

    function snapAnchorElement() {
        const point = simApi()?.getSnapScreenPoint?.();
        if (!point) return null;
        if (!snapAnchor) {
            snapAnchor = document.createElement('div');
            snapAnchor.className = 'tool-guide-snap-anchor';
            snapAnchor.setAttribute('aria-hidden', 'true');
            document.body.appendChild(snapAnchor);
        }
        snapAnchor.style.left = `${point.x - 60}px`;
        snapAnchor.style.top = `${point.y - 60}px`;
        return snapAnchor;
    }

    // The real Test button fills the picker with the test models. Close it through its own Cancel
    // button so the app's pending confirmation is resolved and the next open works again.
    function closeTestPicker() {
        const dialog = document.getElementById('test-model-dialog');
        if (dialog?.open) document.getElementById('btn-cancel-test-model')?.click();
        if (dialog?.open) simApi()?.closeTestDialog?.();
    }

    function openTestPicker() {
        const dialog = document.getElementById('test-model-dialog');
        if (dialog?.open) return;
        document.getElementById('btn-test-model')?.click();
        if (!dialog?.open) simApi()?.showTestDialog?.();
    }

    const testQuantity = category => () => document.querySelector(`#test-model-dialog [data-test-category="${category}"] [data-test-quantity]`);

    // Puts the 3D app into the state that matched one moment of the original walkthrough.
    // The app keeps snapshots ("milestones") for each of these states.
    function simulationScene(cue) {
        const api = simApi();
        if (!api) return;
        const pickerCue = ['simulation_test_dialog', 'simulation_test_confirm_focus', 'simulation_test_confirm_press'].includes(cue);
        if (!pickerCue) closeTestPicker();
        api.setCue?.(cue);
        const has = list => list.includes(cue);
        let base = null;
        if (has(['simulation_reset', 'simulation_model_focus', 'simulation_model_press', 'simulation_model_loading'])) {
            api.applyMilestone?.('blank');
        } else if (has(['simulation_model_loaded', 'simulation_jog_focus', 'simulation_jog_move'])) {
            base = 'robot';
            api.applyMilestone?.(base);
        } else if (has(['simulation_jog_done', 'simulation_test_focus', 'simulation_test_press', 'simulation_test_dialog',
            'simulation_test_confirm_focus', 'simulation_test_confirm_press', 'simulation_test_loading'])) {
            api.applyMilestone?.('jog');
        } else if (has(['simulation_test_ready', 'simulation_snap_panel', 'simulation_snap_focus', 'simulation_snap_press', 'simulation_snap_active',
            'simulation_snap_face_focus', 'simulation_snap_face_press', 'simulation_snap_face_selected',
            'simulation_snap_target_focus', 'simulation_snap_target_press', 'simulation_snap_target_selected', 'simulation_snap_move'])) {
            base = 'test';
            api.applyMilestone?.(base);
        } else if (has(['simulation_snap_done', 'simulation_program_focus', 'simulation_program_launcher_press', 'simulation_program_open', 'simulation_program_pose_a'])) {
            base = has(['simulation_program_open', 'simulation_program_pose_a']) ? 'programBase' : 'snap';
            api.applyMilestone?.(base);
        } else if (has(['simulation_program_teach_a_focus', 'simulation_program_teach_a_press'])) {
            api.applyMilestone?.('programPoseA');
        } else if (has(['simulation_program_teach_a_done', 'simulation_program_pose_b'])) {
            base = 'programP0';
            api.applyMilestone?.(base);
        } else if (has(['simulation_program_teach_b_focus', 'simulation_program_teach_b_press'])) {
            api.applyMilestone?.('programPoseB');
        } else if (has(['simulation_program_teach_b_done', 'simulation_program_repeat_focus', 'simulation_program_repeat_press'])) {
            api.applyMilestone?.('programP1');
        } else if (has(['simulation_program_repeat_done', 'simulation_program_run_focus', 'simulation_program_run_press'])) {
            api.applyMilestone?.('programReady');
        } else if (has(['simulation_program_run_started', 'simulation_program_running', 'simulation_program_close_focus', 'simulation_program_close_press',
            'simulation_program_close_done', 'simulation_jog_close_focus', 'simulation_jog_close_press', 'simulation_jog_close_done', 'simulation_full_view_running'])) {
            const programState = api.getState?.();
            if (!programState?.robotName || programState.programSteps !== 2 || !programState.repeat) api.applyMilestone?.('programReady');
            if (cue === 'simulation_program_run_started') api.startProgram?.();
            else api.ensureProgramRunning?.();
        }

        api.showModelSelection?.(!has(['simulation_reset', 'simulation_model_focus', 'simulation_model_press']));
        api.showLoading?.(cue === 'simulation_model_loading', '로봇 모델을 생성하는 중...');
        if (pickerCue) openTestPicker();
        if (cue === 'simulation_test_loading') api.showLoading?.(true, 'Test 설비와 Tool을 배치하는 중...');
        const snapActivated = has(['simulation_snap_active', 'simulation_snap_face_focus', 'simulation_snap_face_press', 'simulation_snap_face_selected',
            'simulation_snap_target_focus', 'simulation_snap_target_press', 'simulation_snap_target_selected', 'simulation_snap_move', 'simulation_snap_done']);
        if ((has(['simulation_jog_focus', 'simulation_jog_move', 'simulation_snap_panel', 'simulation_snap_focus', 'simulation_snap_press'])
            || cue.startsWith('simulation_program_')) && !snapActivated) {
            api.setJogMode?.('joint');
        }
        if (snapActivated) api.setSnapMode?.(true);
        if (has(['simulation_snap_face_selected', 'simulation_snap_target_focus', 'simulation_snap_target_press',
            'simulation_snap_target_selected', 'simulation_snap_move', 'simulation_snap_done'])) api.showSnapSelection?.();
        if (has(['simulation_snap_target_selected', 'simulation_snap_move', 'simulation_snap_done'])) api.showSnapTarget?.();
        if (base) api.setCue?.(cue);

        const showJogPanel = has(['simulation_jog_focus', 'simulation_jog_move'])
            || cue.startsWith('simulation_snap_')
            || (cue.startsWith('simulation_program_') && !has(['simulation_program_focus', 'simulation_program_launcher_press']))
            || has(['simulation_jog_close_focus', 'simulation_jog_close_press']);
        const showProgramPanel = cue.startsWith('simulation_program_')
            && !has(['simulation_program_focus', 'simulation_program_launcher_press', 'simulation_program_close_done']);
        api.setPanelVisible?.('model-browser-panel', cue === 'simulation_test_ready');
        api.setPanelVisible?.('jog-panel', showJogPanel);
        api.setPanelVisible?.('program-panel', showProgramPanel);
        if (has(['simulation_model_loaded', 'simulation_jog_done', 'simulation_program_focus', 'simulation_program_launcher_press',
            'simulation_program_open', 'simulation_full_view_running'])) api.focusRobot?.();
    }

    const scene = cue => () => simulationScene(cue);

    // The app interpolates its robot motion inside fixed windows of the original 75 s timeline;
    // map this step's own time onto that window.
    function motion(cue, windowStart, windowEnd, from, to) {
        return elapsed => {
            if (elapsed > to + 120) return;
            const api = simApi();
            api?.setCue?.(cue);
            const progress = Math.max(0, Math.min(1, (elapsed - from) / (to - from)));
            api?.setTimelineTime?.(windowStart + (windowEnd - windowStart) * progress);
        };
    }

    const sceneThenMotion = (cue, windowStart, windowEnd) => () => {
        simulationScene(cue);
        motion(cue, windowStart, windowEnd, 0, 1)(1);
    };

    const panelHide = id => () => document.getElementById(id)?.querySelector('[data-panel-action="hide"]') || null;
    const jogSlider = () => document.querySelector('#jog-controls .jog-row input[type="range"]');

    const SIMULATION = {
        absolute: true,
        prepare: async () => {
            const api = await waitFor(() => simApi(), 20000);
            await api.prepare();
        },
        clearEffects: () => { snapAnchor?.remove(); snapAnchor = null; },
        reset() {
            closeTestPicker();
            simApi()?.setPaused?.(true);
            simApi()?.reset?.();
        },
        steps: [
            {
                id: 'sim_model', enter: scene('simulation_reset'),
                target: () => ['#model-select', menuEl], result: '#canvas-container', resultAt: 2300,
                pointer: elapsed => (elapsed < 2300 ? '#model-select' : null),
                menu: { select: '#model-select', open: 800, pick: 2000, match: option => /IR-S4/i.test(option.textContent), apply: scene('simulation_model_loading') },
                actions: [[3400, scene('simulation_model_loaded')]],
                complete: scene('simulation_model_loaded')
            },
            { id: 'sim_view', enter: scene('simulation_model_loaded'), target: '#canvas-container', pointer: false, ring: false, scroll: false },
            {
                id: 'sim_jog_open', enter: scene('simulation_model_loaded'), target: '[data-panel-toggle="jog-panel"]', scroll: false, click: [800],
                actions: [[800, scene('simulation_jog_focus')]], result: '#jog-panel', complete: scene('simulation_jog_focus')
            },
            {
                id: 'sim_jog_move', enter: scene('simulation_jog_move'), target: () => jogSlider()?.closest('.jog-row') || jogSlider(), pointer: jogSlider, center: true, scroll: false,
                click: [500], tick: motion('simulation_jog_move', 13000, 16000, 600, 2800),
                complete: sceneThenMotion('simulation_jog_move', 13000, 16000)
            },
            {
                id: 'sim_test_open', enter: scene('simulation_test_focus'), target: '#btn-test-model', scroll: false, click: [800],
                actions: [[800, scene('simulation_test_dialog')]], result: '#test-model-dialog', complete: scene('simulation_test_dialog')
            },
            {
                // Enter a quantity for one model and one tool, then press "일괄 가져오기".
                id: 'sim_test_import', enter: scene('simulation_test_dialog'),
                // The picker closes at 2100 when the import starts; the 3D view is lit from then on.
                target: elapsed => (elapsed < 1700 ? '#test-model-dialog .test-model-picker-body' : elapsed < 2100 ? '#test-model-dialog .simulation-reset-dialog-actions' : '#canvas-container'),
                pointer: elapsed => (elapsed < 1150 ? testQuantity('model')() : elapsed < 1700 ? testQuantity('tool')() : elapsed < 2100 ? '#btn-confirm-test-model' : null),
                scrollTarget: elapsed => (elapsed < 1150 ? testQuantity('model')() : elapsed < 1700 ? testQuantity('tool')() : '#btn-confirm-test-model'),
                ring: elapsed => elapsed < 2100,
                click: [500, 1250, 1950], type: [[testQuantity('model'), '1', 700], [testQuantity('tool'), '1', 1450]],
                actions: [[2100, scene('simulation_test_loading')], [3200, scene('simulation_test_ready')]],
                toast: [3200, 'Test 모델 배치 완료', 'Test_Equipment_CAD.step · Vacuum_Tool_X200mm.stl'],
                complete: scene('simulation_test_ready')
            },
            { id: 'sim_test_tree', enter: scene('simulation_test_ready'), target: '#model-browser-panel', pointer: false, scroll: false, keepToast: true, complete: scene('simulation_test_ready') },
            { id: 'sim_snap_button', enter: scene('simulation_snap_panel'), target: '#btn-snap-move', scroll: false, click: [800], actions: [[800, scene('simulation_snap_active')]], complete: scene('simulation_snap_active') },
            { id: 'sim_snap_face', enter: scene('simulation_snap_active'), target: snapAnchorElement, center: true, scroll: false, click: [1000], actions: [[1000, scene('simulation_snap_face_selected')]], complete: scene('simulation_snap_face_selected') },
            { id: 'sim_snap_point', enter: scene('simulation_snap_face_selected'), target: snapAnchorElement, center: true, scroll: false, click: [900], actions: [[900, scene('simulation_snap_target_selected')]], complete: scene('simulation_snap_target_selected') },
            {
                id: 'sim_snap_move', enter: scene('simulation_snap_move'), target: '#canvas-container', pointer: false, ring: false, scroll: false,
                tick: motion('simulation_snap_move', 41500, 44500, 200, 2400),
                actions: [[2500, scene('simulation_snap_done')]], toast: [2500, '스냅 이동 완료', '선택한 CAD 스냅 위치'],
                complete: scene('simulation_snap_done')
            },
            {
                id: 'sim_program_open', enter: scene('simulation_program_focus'), target: '[data-panel-toggle="program-panel"]', scroll: false, click: [800],
                actions: [[800, scene('simulation_program_open')]], result: '#program-panel', complete: scene('simulation_program_open')
            },
            // While the robot moves to the pose, show the whole scene; then point at the + button.
            {
                id: 'sim_teach_a', enter: scene('simulation_program_pose_a'), scroll: false,
                target: elapsed => (elapsed < 1600 ? '#canvas-container' : '#program-panel'), pointer: '#program-add-step', ring: elapsed => elapsed >= 1600,
                tick: motion('simulation_program_pose_a', 49500, 51000, 200, 1500),
                click: [2100], actions: [[2100, scene('simulation_program_teach_a_done')]], complete: scene('simulation_program_teach_a_done')
            },
            {
                id: 'sim_teach_b', enter: scene('simulation_program_pose_b'), scroll: false,
                target: elapsed => (elapsed < 1600 ? '#canvas-container' : '#program-panel'), pointer: '#program-add-step', ring: elapsed => elapsed >= 1600,
                tick: motion('simulation_program_pose_b', 53100, 54500, 200, 1500),
                click: [2100], actions: [[2100, scene('simulation_program_teach_b_done')]], complete: scene('simulation_program_teach_b_done')
            },
            { id: 'sim_repeat', enter: scene('simulation_program_repeat_focus'), target: '#program-repeat-robot', click: [800], actions: [[800, scene('simulation_program_repeat_done')]], complete: scene('simulation_program_repeat_done') },
            {
                id: 'sim_run', enter: scene('simulation_program_run_focus'), target: withToast('#program-run-robot'), pointer: '#program-run-robot', scrollTarget: '#program-run-robot', click: [800],
                actions: [[800, scene('simulation_program_run_started')]], toast: [900, '자동 반복 운전 중', 'P[0] Pick ↔ P[1] Place'],
                complete: scene('simulation_program_running')
            },
            {
                id: 'sim_watch', enter: scene('simulation_program_close_focus'), scroll: false,
                // Each hide button stays the target until it is clicked; the panel it closes is gone after that.
                target: elapsed => (elapsed < 800 ? panelHide('program-panel')() : elapsed < 1600 ? panelHide('jog-panel')() : '#canvas-container'),
                pointer: elapsed => (elapsed < 800 ? panelHide('program-panel')() : elapsed < 1600 ? panelHide('jog-panel')() : null),
                ring: elapsed => elapsed < 1600,
                click: [800, 1600],
                actions: [[800, scene('simulation_program_close_done')], [1600, scene('simulation_jog_close_done')], [2100, scene('simulation_full_view_running')]],
                toast: [2100, '패널을 닫고 반복 동작 확인', 'P[0] Pick ↔ P[1] Place'],
                complete: scene('simulation_full_view_running')
            }
        ],
        state: () => simApi()?.getState?.() || null
    };

    const APPS = { tool: TOOL, project: PROJECT, document: DOCUMENT, model: MODEL, simulation: SIMULATION };
    APP = APPS[app];

    async function prepare() {
        ensureEffects();
        if (prepared) return true;
        await APP.prepare();
        prepared = true;
        return true;
    }

    function setPaused(nextPaused) {
        paused = Boolean(nextPaused);
        document.documentElement.classList.toggle('tool-guide-paused', paused);
        if (app === 'simulation') simApi()?.setPaused?.(paused);
        if (app === 'model') modelApi()?.setPaused?.(paused);
    }

    window.InoRobotToolManual = Object.freeze({
        app,
        prepare,
        renderTimelineCue,
        setTimelineTime,
        resetTimeline,
        setPaused,
        steps: () => APP.steps.map(step => step.id),
        getFocusRect: settledFocusRect,
        getPointer: () => (cursorAt && cursor?.classList.contains('is-visible') ? { ...cursorAt } : null),
        getCameraRect: () => (cameraRect ? { ...cameraRect } : null),
        getFocusPoint: () => (focusRect ? { x: focusRect.left + focusRect.width / 2, y: focusRect.top + focusRect.height / 2 } : null),
        getState: () => ({
            app,
            prepared,
            paused,
            activeCue: cueId,
            step: run?.step.id || '',
            cursorVisible: Boolean(cursor?.classList.contains('is-visible')),
            ringVisible: Boolean(ring?.classList.contains('is-visible')),
            toast: toast?.querySelector('small')?.textContent || '',
            [app]: APP.state?.() ?? null
        })
    });
}());
