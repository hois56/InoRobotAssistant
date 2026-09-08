(function () {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    if (params.get('embed') !== 'manual-guide' || window.self === window.top) return;

    const path = window.location.pathname;
    const app = path.includes('/2_3DSimulation/') ? 'simulation'
        : path.includes('/3_ToolSelector/') ? 'tool'
            : path.includes('/4_ProjectGenerator/') ? 'project'
                : path.includes('/6_Document/') ? 'document' : '';
    if (!app) return;

    document.documentElement.dataset.toolGuideEmbed = app;

    let cursor = null;
    let spotlight = null;
    let ripple = null;
    let toast = null;
    let preview = null;
    let focusPoint = null;
    let activeCue = '';
    let effectToken = 0;
    let prepared = false;
    let demoModelLoaded = false;
    let guidePaused = true;
    let scrollFollowFrame = null;
    let activeScrollNodes = [];
    let activeScroll = null;
    let pausedScroll = null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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
            .tool-guide-cursor { position:fixed; left:0; top:0; z-index:2147483642; width:25px; height:31px; color:#fff; opacity:0; pointer-events:none; filter:drop-shadow(0 4px 5px rgba(0,0,0,.8)); transform:translate3d(-60px,-60px,0); transition:transform .55s cubic-bezier(.16,1,.3,1),opacity .18s ease; }
            .tool-guide-cursor svg { display:block; width:100%; height:100%; }
            .tool-guide-cursor.is-visible { opacity:1; }
            .tool-guide-spotlight { position:fixed; z-index:2147483640; border:2px solid rgba(56,189,248,.95); opacity:0; pointer-events:none; box-shadow:0 0 0 4px rgba(56,189,248,.1),0 10px 28px rgba(14,165,233,.2); transition:left .42s cubic-bezier(.16,1,.3,1),top .42s cubic-bezier(.16,1,.3,1),width .42s cubic-bezier(.16,1,.3,1),height .42s cubic-bezier(.16,1,.3,1),opacity .18s ease; }
            .tool-guide-spotlight.is-visible { opacity:1; }
            .tool-guide-spotlight.is-pulsing { animation:toolGuideSpotlightOnce .55s ease-out 1; }
            .tool-guide-ripple { position:fixed; z-index:2147483643; width:12px; height:12px; margin:-6px 0 0 -6px; border:2px solid rgba(255,255,255,.92); border-radius:999px; opacity:0; pointer-events:none; }
            .tool-guide-ripple.is-visible { animation:toolGuideClickRipple .45s ease-out 1; }
            .tool-guide-hover { filter:brightness(1.1) !important; }
            .tool-guide-pressed { transform:scale(.97) !important; transition:transform .12s ease !important; }
            .tool-guide-toast { position:fixed; right:24px; bottom:22px; z-index:2147483645; display:flex; align-items:center; gap:12px; min-width:310px; max-width:calc(100vw - 48px); padding:13px 16px; border:1px solid rgba(148,163,184,.22); border-radius:12px; background:rgba(15,23,42,.97); color:#e2e8f0; box-shadow:0 18px 45px rgba(0,0,0,.48); animation:toolGuideToastIn .3s cubic-bezier(.16,1,.3,1) 1; }
            .tool-guide-toast-check { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; flex:0 0 auto; border-radius:999px; background:rgba(16,185,129,.18); color:#6ee7b7; font-weight:800; }
            .tool-guide-toast strong,.tool-guide-toast small { display:block; }
            .tool-guide-toast strong { font:700 13px/1.3 system-ui,sans-serif; }
            .tool-guide-toast small { margin-top:3px; color:#94a3b8; font:11px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
            .tool-guide-document-viewer { position:fixed; inset:18px; z-index:2147483638; display:flex; overflow:hidden; flex-direction:column; border:1px solid rgba(148,163,184,.24); border-radius:16px; background:#cbd5e1; box-shadow:0 28px 80px rgba(0,0,0,.7); animation:toolGuideViewerIn .36s cubic-bezier(.16,1,.3,1) 1; }
            .tool-guide-document-viewer>header { display:flex; align-items:center; gap:12px; min-height:58px; padding:10px 16px; border-bottom:1px solid rgba(148,163,184,.2); background:#0f172a; color:#f8fafc; }
            .tool-guide-document-icon { display:inline-flex; align-items:center; justify-content:center; width:42px; height:30px; flex:0 0 auto; border-radius:7px; background:#ef4444; color:#fff; font:800 11px/1 system-ui,sans-serif; letter-spacing:.04em; }
            .tool-guide-document-title { min-width:0; flex:1; }
            .tool-guide-document-title strong,.tool-guide-document-title small { display:block; }
            .tool-guide-document-title strong { overflow:hidden; font:700 14px/1.25 system-ui,sans-serif; text-overflow:ellipsis; white-space:nowrap; }
            .tool-guide-document-title small { margin-top:3px; color:#94a3b8; font:10px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
            .tool-guide-document-close { display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; flex:0 0 auto; border:1px solid rgba(148,163,184,.2); border-radius:8px; background:rgba(255,255,255,.06); color:#cbd5e1; font:500 22px/1 system-ui,sans-serif; }
            .tool-guide-document-page-wrap { flex:1; overflow:auto; padding:26px; }
            .tool-guide-document-page { width:min(680px,100%); min-height:820px; margin:0 auto; padding:56px 62px; background:#fff; color:#0f172a; box-shadow:0 12px 34px rgba(15,23,42,.28); font-family:Arial,sans-serif; }
            .tool-guide-document-page .doc-brand { color:#e11d48; font-size:12px; font-weight:800; letter-spacing:.12em; }
            .tool-guide-document-page h1 { margin:42px 0 12px; font-size:28px; line-height:1.25; }
            .tool-guide-document-page p { color:#475569; font-size:14px; line-height:1.65; }
            .tool-guide-document-page .doc-line { height:10px; margin:13px 0; border-radius:4px; background:#e2e8f0; }
            .tool-guide-document-page .doc-line.short { width:62%; }
            .tool-guide-document-page .doc-section { margin-top:42px; padding-top:20px; border-top:2px solid #0f172a; font-size:17px; font-weight:800; }
            html.tool-guide-paused .tool-guide-cursor,html.tool-guide-paused .tool-guide-spotlight { transition-duration:0s !important; }
            @keyframes toolGuideSpotlightOnce { 0%{box-shadow:0 0 0 0 rgba(56,189,248,.35)} 100%{box-shadow:0 0 0 9px rgba(56,189,248,0),0 10px 28px rgba(14,165,233,.16)} }
            @keyframes toolGuideClickRipple { 0%{opacity:.95;transform:scale(.45)} 100%{opacity:0;transform:scale(4.2)} }
            @keyframes toolGuideToastIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
            @keyframes toolGuideViewerIn { from{opacity:0;transform:translateY(14px) scale(.985)} to{opacity:1;transform:translateY(0) scale(1)} }
            @media (prefers-reduced-motion:reduce) { .tool-guide-cursor,.tool-guide-spotlight,.tool-guide-ripple,.tool-guide-toast,.tool-guide-document-viewer { animation:none !important; transition:none !important; } }
        `;
        document.head.appendChild(style);
    }

    function ensureEffects() {
        injectStyles();
        if (cursor) return;
        cursor = document.createElement('div');
        cursor.className = 'tool-guide-cursor';
        cursor.setAttribute('aria-hidden', 'true');
        cursor.innerHTML = '<svg viewBox="0 0 24 30" fill="currentColor"><path d="M2.2 1.6 20.4 17c.9.8.3 2.3-.9 2.3h-7l-3.7 7.8c-.5 1.1-2.1.9-2.4-.2L.4 3.2c-.4-1.4.8-2.5 1.8-1.6Z"/></svg>';
        spotlight = document.createElement('div');
        spotlight.className = 'tool-guide-spotlight';
        spotlight.setAttribute('aria-hidden', 'true');
        ripple = document.createElement('div');
        ripple.className = 'tool-guide-ripple';
        ripple.setAttribute('aria-hidden', 'true');
        document.body.append(cursor, spotlight, ripple);
    }

    function closeToast() {
        toast?.remove();
        toast = null;
    }

    function closePreview() {
        preview?.remove();
        preview = null;
    }

    function clearEffects(options = {}) {
        effectToken += 1;
        stopActiveScroll();
        document.querySelectorAll('.tool-guide-hover,.tool-guide-pressed').forEach(element => element.classList.remove('tool-guide-hover', 'tool-guide-pressed'));
        cursor?.classList.remove('is-visible');
        spotlight?.classList.remove('is-visible', 'is-pulsing');
        ripple?.classList.remove('is-visible');
        focusPoint = null;
        if (!options.keepToast) closeToast();
        if (!options.keepPreview) closePreview();
    }

    function resolveTarget(target) {
        if (target instanceof Element) return target;
        return typeof target === 'string' ? document.querySelector(target) : null;
    }

    function getScrollableNodes(target) {
        const nodes = [];
        let parent = target.parentElement;
        while (parent && parent !== document.body && parent !== document.documentElement) {
            const style = getComputedStyle(parent);
            const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight;
            const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth;
            if (canScrollY || canScrollX) nodes.push(parent);
            parent = parent.parentElement;
        }
        const scrollingElement = document.scrollingElement;
        if (scrollingElement) nodes.push(scrollingElement);
        return nodes;
    }

    function getScrollNodePosition(node) {
        if (node === document.scrollingElement) {
            return { left: window.scrollX, top: window.scrollY };
        }
        return { left: node.scrollLeft, top: node.scrollTop };
    }

    function getScrollDistance(target, nodes) {
        const targetRect = target.getBoundingClientRect();
        return nodes.reduce((largest, node) => {
            const root = node === document.scrollingElement;
            const bounds = root
                ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
                : node.getBoundingClientRect();
            const current = getScrollNodePosition(node);
            const maximumLeft = root
                ? Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
                : Math.max(0, node.scrollWidth - node.clientWidth);
            const maximumTop = root
                ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
                : Math.max(0, node.scrollHeight - node.clientHeight);
            const relativeLeft = targetRect.left - bounds.left;
            const relativeTop = targetRect.top - bounds.top;
            const desiredLeft = current.left + relativeLeft - Math.max(0, (bounds.width - targetRect.width) / 2);
            const desiredTop = current.top + relativeTop - Math.max(0, (bounds.height - targetRect.height) / 2);
            const nextLeft = Math.max(0, Math.min(maximumLeft, desiredLeft));
            const nextTop = Math.max(0, Math.min(maximumTop, desiredTop));
            return Math.max(largest, Math.abs(nextLeft - current.left), Math.abs(nextTop - current.top));
        }, 0);
    }

    function getScrollSnapshot(nodes) {
        return nodes.map(node => getScrollNodePosition(node));
    }

    function scrollSnapshotChanged(previous, next) {
        return next.some((position, index) => (
            Math.abs(position.left - (previous[index]?.left ?? position.left)) > .5
            || Math.abs(position.top - (previous[index]?.top ?? position.top)) > .5
        ));
    }

    function stopActiveScroll(preserve = false) {
        if (scrollFollowFrame !== null) cancelAnimationFrame(scrollFollowFrame);
        scrollFollowFrame = null;
        pausedScroll = preserve && activeScroll?.token === effectToken ? activeScroll : null;
        activeScrollNodes.forEach(node => {
            if (node === document.scrollingElement) {
                window.scrollTo({ left: window.scrollX, top: window.scrollY, behavior: 'auto' });
                return;
            }
            node.scrollTo({ left: node.scrollLeft, top: node.scrollTop, behavior: 'auto' });
        });
        activeScrollNodes = [];
        activeScroll = null;
    }

    function positionHighlight(target, options, pulse) {
        if (!target.isConnected) return false;
        const rect = target.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        const cursorX = Math.min(window.innerWidth - 28, Math.max(8, rect.left + Math.min(rect.width * .72, rect.width - 8)));
        const cursorY = Math.min(window.innerHeight - 34, Math.max(8, rect.top + Math.min(rect.height * .66, rect.height - 6)));
        focusPoint = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        cursor.style.transform = `translate3d(${cursorX}px,${cursorY}px,0)`;
        cursor.classList.add('is-visible');
        if (options.ring !== false) {
            const radius = getComputedStyle(target).borderRadius || '10px';
            Object.assign(spotlight.style, { left: `${Math.round(rect.left - 4)}px`, top: `${Math.round(rect.top - 4)}px`, width: `${Math.round(rect.width + 8)}px`, height: `${Math.round(rect.height + 8)}px`, borderRadius: radius });
            spotlight.classList.add('is-visible');
            if (pulse) {
                spotlight.classList.remove('is-pulsing');
                void spotlight.offsetWidth;
                spotlight.classList.add('is-pulsing');
            }
        }
        if (options.hover) target.classList.add('tool-guide-hover');
        if (options.press && pulse) {
            target.classList.add('tool-guide-pressed');
            ripple.style.left = `${cursorX}px`;
            ripple.style.top = `${cursorY}px`;
            ripple.classList.remove('is-visible');
            void ripple.offsetWidth;
            ripple.classList.add('is-visible');
        }
        return true;
    }

    function scheduleActivation(options, token) {
        if (typeof options.onActivate !== 'function') return;
        const delay = Math.max(0, Number(options.delay ?? options.activateDelay ?? 120) || 0);
        window.setTimeout(() => {
            if (token !== effectToken) return;
            options.onActivate();
        }, delay);
    }

    function finishHighlight(target, options, token) {
        if (token !== effectToken || !target.isConnected) return;
        if (positionHighlight(target, options, true)) scheduleActivation(options, token);
        activeScrollNodes = [];
        activeScroll = null;
    }

    function followTargetDuringScroll(target, options, token, animateScroll, scrollDistance = 0) {
        if (!animateScroll || scrollDistance <= 1) {
            finishHighlight(target, options, token);
            return;
        }
        const rect = target.getBoundingClientRect();
        const cursorX = Math.min(window.innerWidth - 28, Math.max(8, rect.left + Math.min(rect.width * .72, rect.width - 8)));
        const cursorY = Math.min(window.innerHeight - 34, Math.max(8, rect.top + Math.min(rect.height * .66, rect.height - 6)));
        cursor.style.transform = `translate3d(${cursorX}px,${cursorY}px,0)`;
        cursor.classList.add('is-visible');
        spotlight?.classList.remove('is-visible', 'is-pulsing');
        ripple?.classList.remove('is-visible');
        const started = performance.now();
        let previousSnapshot = getScrollSnapshot(activeScrollNodes);
        let stableFrames = 0;
        const follow = now => {
            if (token !== effectToken || !target.isConnected) return;
            const nextSnapshot = getScrollSnapshot(activeScrollNodes);
            if (scrollSnapshotChanged(previousSnapshot, nextSnapshot)) stableFrames = 0;
            else stableFrames += 1;
            previousSnapshot = nextSnapshot;
            const elapsed = now - started;
            const finished = elapsed >= 900 || (elapsed >= 160 && stableFrames >= 4);
            if (!finished) {
                scrollFollowFrame = requestAnimationFrame(follow);
                return;
            }
            scrollFollowFrame = null;
            finishHighlight(target, options, token);
        };
        scrollFollowFrame = requestAnimationFrame(follow);
    }

    function resumePausedScroll() {
        const state = pausedScroll;
        pausedScroll = null;
        if (!state || state.token !== effectToken || !state.target.isConnected || reducedMotion.matches) return;
        activeScroll = state;
        activeScrollNodes = getScrollableNodes(state.target);
        const scrollDistance = getScrollDistance(state.target, activeScrollNodes);
        state.target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        followTargetDuringScroll(state.target, state.options, state.token, true, scrollDistance);
    }

    function highlight(targetLike, options = {}) {
        ensureEffects();
        clearEffects({ keepToast: options.keepToast, keepPreview: options.keepPreview });
        const target = resolveTarget(targetLike);
        if (!target) return false;
        const token = effectToken;
        activeScrollNodes = options.scroll === false ? [] : getScrollableNodes(target);
        const scrollDistance = options.scroll === false ? 0 : getScrollDistance(target, activeScrollNodes);
        const animateScroll = options.scroll !== false && scrollDistance > 1 && !guidePaused && !reducedMotion.matches;
        if (options.scroll !== false) {
            target.scrollIntoView({ behavior: animateScroll ? 'smooth' : 'auto', block: 'center', inline: 'center' });
        }
        activeScroll = animateScroll ? { target, options, token } : null;
        followTargetDuringScroll(target, options, token, animateScroll, scrollDistance);
        return true;
    }

    function showToast(title, fileName) {
        closeToast();
        toast = document.createElement('div');
        toast.className = 'tool-guide-toast';
        toast.setAttribute('role', 'status');
        toast.innerHTML = '<span class="tool-guide-toast-check" aria-hidden="true">✓</span><span><strong></strong><small></small></span>';
        toast.querySelector('strong').textContent = window.InoRobotI18n?.translate(title) || title;
        toast.querySelector('small').textContent = fileName;
        document.body.appendChild(toast);
        focusPoint = { x: window.innerWidth - Math.min(180, window.innerWidth / 3), y: window.innerHeight - 54 };
    }

    function showDocumentPreview() {
        closePreview();
        const item = document.querySelector('#manualList .manual-item');
        const title = item?.querySelector('h3')?.textContent.trim() || 'IR-S4 & S7 & S10 Series User Guide.pdf';
        preview = document.createElement('section');
        preview.className = 'tool-guide-document-viewer';
        preview.setAttribute('aria-hidden', 'true');
        preview.innerHTML = `
            <header><span class="tool-guide-document-icon">PDF</span><span class="tool-guide-document-title"><strong></strong><small>Document preview · Page 1</small></span><button type="button" class="tool-guide-document-close" aria-label="Close preview">×</button></header>
            <div class="tool-guide-document-page-wrap"><article class="tool-guide-document-page"><div class="doc-brand">INOVANCE ROBOTICS</div><h1></h1><p>User Guide · Manipulator</p><div class="doc-section">1. Safety and product overview</div><div class="doc-line"></div><div class="doc-line"></div><div class="doc-line short"></div><div class="doc-section">2. Installation</div><div class="doc-line"></div><div class="doc-line short"></div></article></div>`;
        preview.querySelector('header strong').textContent = title;
        preview.querySelector('h1').textContent = title.replace(/\.pdf$/i, '');
        document.body.appendChild(preview);
        focusPoint = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    function setValue(targetLike, value, eventType = 'input') {
        const element = resolveTarget(targetLike);
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
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return option;
    }

    const TOOL_DEMO_MODEL = /R25/i;

    function chooseBaselineOption(select, excludedMatcher) {
        return chooseOption(select, option => option.value && !excludedMatcher(option));
    }

    function chooseToolDemoModel() {
        return chooseOption(document.getElementById('robot'), option => TOOL_DEMO_MODEL.test(option.textContent));
    }

    function toolReset(options = {}) {
        document.querySelector('.tab[data-mode="direct"]')?.click();
        chooseBaselineOption(document.getElementById('robot'), option => TOOL_DEMO_MODEL.test(option.textContent));
        [['#d_m', 0], ['#d_lx', 0], ['#d_ly', 0], ['#d_lz', 0], ['#d_ixx', 0], ['#d_iyy', 0], ['#d_izz', 0]].forEach(([selector, value]) => setValue(selector, value));
        document.getElementById('result')?.classList.add('hide');
        if (options.scroll !== false) window.scrollTo(0, 0);
    }

    function setToolMass() {
        setValue('#d_m', 5);
    }

    function setToolDistance() {
        setValue('#d_lx', 35);
        setValue('#d_ly', 0);
        setValue('#d_lz', 120);
    }

    function setToolInertia() {
        setValue('#d_ixx', .018);
        setValue('#d_iyy', .021);
        setValue('#d_izz', .015);
    }

    function calculateToolResult() {
        if (typeof window.calculate === 'function') window.calculate();
    }

    const TOOL_CUES = [
        'tool_reset', 'tool_model_focus', 'tool_model_select', 'tool_mass_focus', 'tool_mass_value',
        'tool_distance_focus', 'tool_distance_value', 'tool_inertia_focus', 'tool_inertia_value',
        'tool_calculate_focus', 'tool_calculate_press', 'tool_result', 'tool_overall'
    ];

    function renderTool(cue) {
        const rank = Math.max(0, TOOL_CUES.indexOf(cue));
        toolReset({ scroll: false });
        if (rank > 2) chooseToolDemoModel();
        if (rank > 4) setToolMass();
        if (rank > 6) setToolDistance();
        if (rank > 8) setToolInertia();
        if (rank > 10) calculateToolResult();
        const targets = {
            tool_reset: '#robot-card', tool_model_focus: '#robot', tool_model_select: '#robot',
            tool_mass_focus: '#d_m', tool_mass_value: '#d_m', tool_distance_focus: '#d_lz', tool_distance_value: '#d_lz',
            tool_inertia_focus: '#d_izz', tool_inertia_value: '#d_izz', tool_calculate_focus: '#main-calculate',
            tool_calculate_press: '#main-calculate', tool_result: '#summary', tool_overall: '#overall'
        };
        const actions = {
            tool_model_select: chooseToolDemoModel,
            tool_mass_value: setToolMass,
            tool_distance_value: setToolDistance,
            tool_inertia_value: setToolInertia,
            tool_calculate_press: calculateToolResult
        };
        highlight(targets[cue], {
            press: /select|value|press/.test(cue),
            hover: /focus|press/.test(cue),
            ring: !['tool_reset', 'tool_result'].includes(cue),
            onActivate: actions[cue]
        });
    }

    // Inputs, pointer, scroll and click feedback share the media clock.
    const TOOL_INPUTS = [
        [7000, '#d_m', '5'], [10000, '#d_lx', '35'], [13000, '#d_lz', '120'],
        [16000, '#d_ixx', '0.018'], [18500, '#d_iyy', '0.021'], [21000, '#d_izz', '0.015']
    ];
    const TOOL_SHOTS = [[0, '#robot'], [2700, 'option'], [5200, '#robot'],
        ...TOOL_INPUTS.map(([at, selector]) => [at, selector]),
        [24000, '#main-calculate'], [27700, '#summary'], [32000, '#overall']];
    const TOOL_CLICKS = [1750, 4800, ...TOOL_INPUTS.map(([at]) => at + 800), 25900];
    let demoTime = -1;
    let demoCalculated = false;
    let simulationTarget = null;
    let simulationCueStart = 0;
    let simulationCueKey = '';

    function resetDemoMotion() {
        demoTime = -1;
        demoCalculated = false;
        projectShot = -1;
        projectMotion = null;
        projectRect = null;
        closeProjectMenu();
        projectCaret?.remove();
        projectCaret = null;
    }

    function prepareClockEffects() {
        ensureEffects();
        ensureProjectStyles();
        for (const element of [cursor, spotlight, ripple]) {
            element.style.setProperty('transition', 'none', 'important');
            element.style.setProperty('animation', 'none', 'important');
        }
    }

    function renderToolTime(time) {
        prepareClockEffects();
        const snap = demoTime < 0 || time < demoTime || time - demoTime > 250;
        if (demoTime < 0 || time < demoTime) {
            toolReset();
            resetDemoMotion();
        }
        if (time >= 4920 && demoTime < 4920) chooseToolDemoModel();
        for (const [at, selector, text] of TOOL_INPUTS) {
            const count = Math.max(0, Math.min(text.length, Math.floor((time - at - 1100) / 180)));
            const value = time < at + 1000 ? '0' : text.slice(0, count);
            const input = document.querySelector(selector);
            if (input.value !== value) setValue(input, value);
        }
        if (time >= 26020 && !demoCalculated) { calculateToolResult(); demoCalculated = true; }
        updateProjectMenu(time);
        let shot = 0;
        TOOL_SHOTS.forEach(([at], index) => { if (time >= at) shot = index; });
        drawProjectPointer(time, shot, snap, TOOL_SHOTS, TOOL_CLICKS);
        const typing = TOOL_INPUTS.find(([at]) => time >= at + 800 && time < at + 2500);
        projectCaret?.remove(); projectCaret = null;
        if (typing) {
            const input = document.querySelector(typing[1]);
            input.focus({ preventScroll:true });
            input.style.caretColor = 'transparent';
            const rect = input.getBoundingClientRect(), style = getComputedStyle(input);
            const context = document.createElement('canvas').getContext('2d');
            context.font = style.font;
            projectCaret = document.createElement('div');
            projectCaret.className = 'project-guide-caret';
            const caretX = style.textAlign === 'right' ? rect.right - parseFloat(style.paddingRight) - 2
                : rect.left + parseFloat(style.paddingLeft) + context.measureText(input.value).width + 2;
            Object.assign(projectCaret.style, { left:`${caretX}px`, top:`${rect.top + 8}px`, height:`${Math.max(12, rect.height - 16)}px`, opacity:Math.floor(time / 450) % 2 ? '0' : '1' });
            document.body.appendChild(projectCaret);
        } else if (document.activeElement?.matches('input')) document.activeElement.blur();
        demoTime = time;
    }

    function renderSimulationTime(time) {
        prepareClockEffects();
        // Native modal dialogs occupy the top layer, above body z-indexes.
        const effectHost = document.querySelector('dialog[open]') || document.body;
        for (const effect of [cursor, spotlight, ripple]) {
            if (effect.parentElement !== effectHost) effectHost.appendChild(effect);
        }
        const snap = demoTime < 0 || time < demoTime || time - demoTime > 250;
        updateProjectMenu(time);
        let target = simulationTarget;
        let start = simulationCueStart;
        if (/simulation_snap_(face|target)_/.test(activeCue)) {
            const point = getSimulationApi()?.getSnapScreenPoint?.();
            if (point) {
                let anchor = document.getElementById('guide-snap-anchor');
                if (!anchor) {
                    anchor = document.createElement('div');
                    anchor.id = 'guide-snap-anchor';
                    anchor.style.cssText = 'position:fixed;width:20px;height:20px;pointer-events:none';
                    document.body.appendChild(anchor);
                }
                anchor.style.left = `${point.x - 10}px`;
                anchor.style.top = `${point.y - 10}px`;
                target = anchor;
            }
        }
        if (time < 3800) {
            target = time >= 2300 ? 'option' : '#model-select';
            start = time >= 2300 ? 2300 : 0;
        }
        const key = `${activeCue}:${start}`;
        if (key !== simulationCueKey) { projectShot = -1; simulationCueKey = key; }
        const clicks = time < 3800 ? [1380, 3300] : activeCue.endsWith('_press') ? [start] : [];
        drawProjectPointer(time, 0, snap, [[start, target]], clicks);
        if (target === '#canvas-container') { cursor.classList.remove('is-visible'); spotlight.classList.remove('is-visible'); }
        demoTime = time;
    }

    const PROJECT_DEMO_NAME = 'InoRobot_Demo';
    const PROJECT_BASE_NAME = 'InoRobot_';
    const PROJECT_DEMO_MODEL = /R25/i;

    function setProjectName(value) {
        setValue('#prjName', value);
    }

    function chooseProjectDemoModel() {
        return chooseOption(document.getElementById('cmbRobotModel'), option => PROJECT_DEMO_MODEL.test(option.textContent));
    }

    function setProjectCheckbox(id, checked) {
        const checkbox = document.getElementById(id);
        if (!checkbox) return false;
        checkbox.checked = Boolean(checked);
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function openProjectOptions() {
        const modal = document.getElementById('optionsModal');
        if (!modal || !modal.classList.contains('hidden')) return Boolean(modal);
        document.getElementById('btnOption')?.click();
        return !modal.classList.contains('hidden');
    }

    function applyProjectOptions() {
        const modal = document.getElementById('optionsModal');
        if (!modal || modal.classList.contains('hidden')) return false;
        document.getElementById('btnApplyOptions')?.click();
        return modal.classList.contains('hidden');
    }

    function resetProjectOptions() {
        const modal = document.getElementById('optionsModal');
        if (!modal) return;
        if (!modal.classList.contains('hidden')) document.getElementById('btnCancelOptions')?.click();
        openProjectOptions();
        modal.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });
        setValue('#numRecipeCount', 2, 'change');
        applyProjectOptions();
    }

    function setProjectProcessChoice(rowIndex, selectIndex, value) {
        const row = document.querySelectorAll('#stepsList > div')[rowIndex];
        const select = row?.querySelectorAll('select')[selectIndex];
        if (!select) return false;
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function projectReset() {
        document.getElementById('guideModal')?.classList.add('hidden');
        document.getElementById('visionModal')?.classList.add('hidden');
        const optionsModal = document.getElementById('optionsModal');
        if (optionsModal && !optionsModal.classList.contains('hidden')) document.getElementById('btnCancelOptions')?.click();
        while (document.querySelectorAll('#stepsList > div').length > 1 && typeof window.rStep === 'function') {
            window.rStep(document.querySelectorAll('#stepsList > div').length - 1);
        }
        setProjectName(PROJECT_BASE_NAME);
        chooseBaselineOption(document.getElementById('cmbRobotModel'), option => PROJECT_DEMO_MODEL.test(option.textContent));
        resetProjectOptions();
        setProjectProcessChoice(0, 0, 'Tray');
        setProjectProcessChoice(0, 1, 'Get');
    }

    function ensureProjectSecondStep() {
        if (document.querySelectorAll('#stepsList > div').length < 2) document.getElementById('btnAdd')?.click();
        return document.querySelectorAll('#stepsList > div').length >= 2;
    }

    // Every visible effect uses the player's clock; no timeout can finish an
    // action while paused or leak into a different chapter after seeking.
    const projectRowSelect = index => document.querySelectorAll('#stepsList > div')[1]?.querySelectorAll('select')[index];
    const PROJECT_SHOTS = [
        [0, '#prjName'], [4300, '#cmbRobotModel'], [6000, 'option'],
        [7400, '#cmbRobotModel'], [9000, '#btnAdd'],
        [11000, () => projectRowSelect(0)], [12600, 'option'],
        [14000, () => projectRowSelect(0)], [14600, () => projectRowSelect(1)],
        [16300, 'option'], [17700, () => projectRowSelect(1)],
        [18500, '#prismContainer'], [22000, '#btnOption'],
        [23300, '#chkTcpSpeed'], [27300, '#btnApplyOptions'],
        [29300, '#btnOption'], [30300, '#prismContainer'], [33000, '#btnGenerate']
    ];
    const PROJECT_CLICKS = [1600, 5100, 7000, 9800, 11800, 13700, 15400, 17400, 23000, 25100, 28700, 35000];
    const PROJECT_ACTIONS = [
        [7120, chooseProjectDemoModel], [9920, ensureProjectSecondStep],
        [13820, () => setProjectProcessChoice(1, 0, 'Stage')],
        [17520, () => setProjectProcessChoice(1, 1, 'Put')],
        [23120, openProjectOptions], [25220, () => setProjectCheckbox('chkTcpSpeed', true)],
        [28820, applyProjectOptions]
    ];
    let projectTime = -1;
    let projectAction = 0;
    let projectShot = -1;
    let projectMotion = null;
    let projectRect = null;
    let projectMenu = null;
    let projectMenuKey = '';
    let projectCaret = null;
    let projectPackage = null;
    let projectPackageStarted = false;
    let projectGeneration = 0;
    let projectExportJob = Promise.resolve();

    function closeProjectMenu() {
        projectMenu?.remove();
        projectMenu = null;
        projectMenuKey = '';
    }

    function resetProjectPlayback() {
        clearEffects();
        closeProjectMenu();
        projectCaret?.remove();
        projectCaret = null;
        projectTime = -1;
        projectAction = 0;
        projectShot = -1;
        projectMotion = null;
        projectRect = null;
        projectPackage = null;
        projectPackageStarted = false;
        projectGeneration += 1;
        projectReset();
        window.scrollTo(0, 0);
    }

    function ensureProjectStyles() {
        if (document.querySelector('[data-project-guide-style]')) return;
        const style = document.createElement('style');
        style.dataset.projectGuideStyle = 'true';
        style.textContent = `
            html[data-tool-guide-embed="project"] .tool-guide-cursor,
            html[data-tool-guide-embed="project"] .tool-guide-spotlight,
            html[data-tool-guide-embed="project"] .tool-guide-ripple,
            html[data-tool-guide-embed="project"] .tool-guide-toast { transition:none !important; animation:none !important; }
            html[data-tool-guide-embed="project"] #prjName { caret-color:transparent; }
            html[data-tool-guide-embed="project"] #prismContainer { max-height:410px !important; min-height:0 !important; overflow:auto !important; }
            .project-guide-menu { position:fixed; z-index:2147483639; overflow:auto; max-height:252px; padding:6px; border:1px solid #64748b; border-radius:10px; background:#111e32; color:#f1f5f9; box-shadow:0 16px 40px #0009; pointer-events:none; font:500 16px/1.4 system-ui,sans-serif; }
            .project-guide-menu [role="option"] { padding:9px 12px; min-height:40px; border-radius:5px; white-space:nowrap; }
            .project-guide-menu [aria-selected="true"] { background:#334155; }
            .project-guide-menu .is-hovered { background:#0369a1; box-shadow:inset 3px 0 #7dd3fc; }
            .project-guide-group { padding:7px 12px; color:#94a3b8; font-size:12px; }
            .project-guide-caret { position:fixed; z-index:2147483641; width:2px; background:#7dd3fc; pointer-events:none; }
        `;
        document.head.appendChild(style);
    }

    function projectMenuAt(time) {
        if (app === 'tool') return time >= 1900 && time < 5200 ? { key:'tool-model', select:document.getElementById('robot'), matches:option => TOOL_DEMO_MODEL.test(option.textContent), hover:2700 } : null;
        if (app === 'simulation') return time >= 1500 && time < 3800 ? { key:'simulation-model', select:document.getElementById('model-select'), matches:option => /IR-S4/i.test(option.textContent), hover:2300 } : null;
        if (time >= 5220 && time < 7400) return { key:'model', select:document.getElementById('cmbRobotModel'), matches: option => PROJECT_DEMO_MODEL.test(option.textContent), hover:6000 };
        if (time >= 11920 && time < 14000) return { key:'type', select:projectRowSelect(0), matches:option => option.value === 'Stage', hover:12600 };
        if (time >= 15520 && time < 17700) return { key:'method', select:projectRowSelect(1), matches:option => option.value === 'Put', hover:16300 };
        return null;
    }

    function updateProjectMenu(time) {
        // Process vocabulary is the same English vocabulary as the generator.
        document.querySelectorAll('#stepsList select').forEach(select => {
            if (select.hasAttribute('data-i18n-skip')) return;
            select.setAttribute('data-i18n-skip', '');
            select.classList.add('notranslate');
            select.setAttribute('translate', 'no');
            Array.from(select.options).forEach(option => {
                if (option.textContent !== option.value) option.textContent = option.value;
            });
        });
        const menu = projectMenuAt(time);
        if (!menu?.select) { closeProjectMenu(); return; }
        if (projectMenuKey !== menu.key) {
            closeProjectMenu();
            projectMenuKey = menu.key;
            projectMenu = document.createElement('div');
            projectMenu.className = 'project-guide-menu notranslate';
            projectMenu.setAttribute('translate', 'no');
            projectMenu.setAttribute('data-i18n-skip', '');
            projectMenu.setAttribute('role', 'listbox');
            projectMenu.setAttribute('aria-label', menu.select.id || menu.key);
            let group = null;
            Array.from(menu.select.options).forEach(option => {
                if (option.parentElement.tagName === 'OPTGROUP' && group !== option.parentElement) {
                    group = option.parentElement;
                    const label = document.createElement('div');
                    label.className = 'project-guide-group';
                    label.textContent = group.label;
                    projectMenu.appendChild(label);
                }
                const row = document.createElement('div');
                row.setAttribute('role', 'option');
                row.setAttribute('aria-selected', String(option.selected));
                row.textContent = option.textContent;
                row.dataset.value = option.value;
                if (menu.matches(option) && !projectMenu.querySelector('[data-demo-option]')) row.dataset.demoOption = 'true';
                projectMenu.appendChild(row);
            });
            document.body.appendChild(projectMenu);
            const option = projectMenu.querySelector('[data-demo-option]');
            projectMenu.scrollTop = Math.max(0, (option?.offsetTop || 0) - 100);
        }
        const rect = menu.select.getBoundingClientRect();
        const width = Math.min(window.innerWidth - 32, Math.max(260, rect.width));
        const height = projectMenu.offsetHeight;
        Object.assign(projectMenu.style, {
            width:`${width}px`, left:`${Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))}px`,
            top:`${rect.bottom + height + 12 <= window.innerHeight ? rect.bottom + 6 : Math.max(12, rect.top - height - 6)}px`
        });
        const option = projectMenu.querySelector('[data-demo-option]');
        option?.classList.toggle('is-hovered', time >= menu.hover + 650);
        for (const row of projectMenu.querySelectorAll('[role="option"]')) row.setAttribute('aria-selected', String(row.dataset.value === menu.select.value));
    }

    function projectTarget(shot, shots = PROJECT_SHOTS) {
        const target = shots[shot][1];
        if (target === 'option') return projectMenu?.querySelector('[data-demo-option]');
        return resolveTarget(typeof target === 'function' ? target() : target);
    }

    function projectBounds(target) {
        const rect = target.getBoundingClientRect();
        if (app === 'simulation' && target.matches('input[type="range"]')) {
            const fraction = Math.max(0, Math.min(1, (Number(target.value) - Number(target.min || 0)) / (Number(target.max || 100) - Number(target.min || 0) || 1)));
            return { left:rect.left + 8 + (rect.width - 16) * fraction - 12, top:rect.top + rect.height / 2 - 12, width:24, height:24 };
        }
        const width = target.id === 'prismContainer' ? Math.min(rect.width, 600) : rect.width;
        return { left:rect.left - 4, top:rect.top - 4, width:width + 8, height:rect.height + 8 };
    }

    const projectEase = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

    function drawProjectPointer(time, shot, snap, shots = PROJECT_SHOTS, clicks = PROJECT_CLICKS) {
        let target = projectTarget(shot, shots);
        if (!target) return;
        if (shot !== projectShot || snap) {
            const from = projectRect || projectBounds(target);
            const nodes = target.closest('header,#optionsModal,.project-guide-menu') ? [] : getScrollableNodes(target);
            const before = getScrollSnapshot(nodes);
            if (nodes.length) target.scrollIntoView({ behavior:'instant', block:'center', inline:'center' });
            const after = getScrollSnapshot(nodes);
            projectMotion = { from, nodes, before, after };
            projectShot = shot;
        }
        const elapsed = time - shots[shot][0];
        const motion = projectMotion;
        const scrollProgress = snap || reducedMotion.matches ? 1 : projectEase(elapsed / 260);
        motion.nodes.forEach((node, index) => {
            const a = motion.before[index], b = motion.after[index];
            node.scrollLeft = a.left + (b.left - a.left) * scrollProgress;
            node.scrollTop = a.top + (b.top - a.top) * scrollProgress;
        });
        updateProjectMenu(time);
        target = projectTarget(shot, shots) || target;
        const to = projectBounds(target);
        // A single interpolated rectangle owns both cursor and selection box.
        const movingScroll = motion.before.some((a, index) => Math.abs(a.top - motion.after[index].top) > 1 || Math.abs(a.left - motion.after[index].left) > 1);
        const progress = snap || reducedMotion.matches ? 1 : projectEase((elapsed - (movingScroll ? 260 : 0)) / 480);
        projectRect = Object.fromEntries(Object.keys(to).map(key => [key, motion.from[key] + (to[key] - motion.from[key]) * progress]));
        const rect = projectRect;
        Object.assign(spotlight.style, { left:`${rect.left}px`, top:`${rect.top}px`, width:`${rect.width}px`, height:`${rect.height}px`, borderRadius:'8px' });
        spotlight.classList.add('is-visible');
        const x = rect.left + Math.min(rect.width * .72, rect.width - 8);
        const y = rect.top + Math.min(rect.height * .66, rect.height - 6);
        cursor.style.transform = `translate3d(${x}px,${y}px,0)`;
        cursor.classList.add('is-visible');
        focusPoint = { x:to.left + to.width / 2, y:to.top + to.height / 2 };
        const click = clicks.find(at => time >= at && time < at + 460);
        const clickProgress = click === undefined ? 1 : (time - click) / 460;
        Object.assign(ripple.style, { left:`${x}px`, top:`${y}px`, opacity:String(1 - clickProgress), transform:`scale(${.5 + clickProgress * 3.7})` });
        // Scale the artwork only; scaling the positioned cursor also scales
        // its translation and moves the click away from the target.
        const pointerArt = cursor.querySelector('svg');
        pointerArt.style.transformOrigin = 'top left';
        pointerArt.style.transform = click !== undefined && clickProgress < .3 ? 'scale(.88)' : 'scale(1)';
    }

    function drawProjectTyping(time) {
        const input = document.getElementById('prjName');
        const count = time < 1850 ? 0 : Math.min(PROJECT_DEMO_NAME.length, Math.floor((time - 1850) / 145));
        const value = time < 1740 ? PROJECT_BASE_NAME : PROJECT_DEMO_NAME.slice(0, count);
        if (input.value !== value) setProjectName(value);
        if (time < 1600 || time >= 4300) {
            projectCaret?.remove(); projectCaret = null;
            if (document.activeElement === input) input.blur();
            return;
        }
        input.focus({ preventScroll:true });
        input.setSelectionRange(value.length, value.length);
        if (!projectCaret) {
            projectCaret = document.createElement('div');
            projectCaret.className = 'project-guide-caret';
            projectCaret.setAttribute('aria-hidden', 'true');
            document.body.appendChild(projectCaret);
        }
        const rect = input.getBoundingClientRect();
        const style = getComputedStyle(input);
        const context = document.createElement('canvas').getContext('2d');
        context.font = style.font;
        Object.assign(projectCaret.style, { left:`${rect.left + parseFloat(style.paddingLeft) + context.measureText(value).width + 1}px`, top:`${rect.top + 13}px`, height:`${rect.height - 26}px`, opacity:time < 3800 || Math.floor(time / 450) % 2 === 0 ? '1' : '0' });
    }

    function generateProjectGuidePackage() {
        if (projectPackageStarted) return;
        projectPackageStarted = true;
        const generation = projectGeneration;
        projectExportJob = projectExportJob.then(async () => {
            if (generation !== projectGeneration) return;
            const originalSaveAs = window.saveAs;
            // Exercise the real generator, but keep the tutorial ZIP in memory.
            window.saveAs = (blob, name) => {
                if (generation === projectGeneration) {
                    projectPackage = { size:blob.size, name };
                    if (projectTime >= 37500 && blob.size && !toast) showToast('Project package is ready', name);
                }
            };
            try { await window.exportProj(); }
            finally { window.saveAs = originalSaveAs; }
        }).catch(error => console.error('Project guide generation failed:', error));
    }

    function renderProjectTime(time) {
        ensureEffects();
        ensureProjectStyles();
        const snap = projectTime < 0 || time < projectTime || Math.abs(time - projectTime) > 250;
        if (snap) resetProjectPlayback();
        while (projectAction < PROJECT_ACTIONS.length && time >= PROJECT_ACTIONS[projectAction][0]) PROJECT_ACTIONS[projectAction++][1]();
        if (snap && time >= 11000) {
            const anchor = time >= 18500 ? document.getElementById('prismContainer') : projectRowSelect(0);
            anchor?.scrollIntoView({ behavior:'instant', block:'center', inline:'center' });
        }
        updateProjectMenu(time);
        let shot = 0;
        PROJECT_SHOTS.forEach(([at], index) => { if (time >= at) shot = index; });
        drawProjectPointer(time, shot, snap);
        drawProjectTyping(time);
        if (time >= 35120) generateProjectGuidePackage();
        if (time >= 37500 && projectPackage?.size && !toast) showToast('Project package is ready', projectPackage.name);
        projectTime = time;
    }

    function documentReset(options = {}) {
        closePreview();
        closeToast();
        document.querySelectorAll('.filter-btn').forEach(button => button.classList.remove('active'));
        ['#typeFilters [data-type="all"]', '#catFilters [data-cat="all"]', '#eduFilters [data-cat="all"]'].forEach(selector => document.querySelector(selector)?.classList.add('active'));
        const search = document.getElementById('manualSearch');
        if (search) search.value = '';
        if (typeof window.renderManuals === 'function') window.renderManuals();
        if (options.scroll !== false) window.scrollTo(0, 0);
    }

    const DOCUMENT_CUES = [
        'document_reset', 'document_type_focus', 'document_type_select', 'document_search_focus',
        'document_search_type', 'document_results', 'document_card_focus', 'document_view_focus',
        'document_view_press', 'document_preview', 'document_preview_close_focus', 'document_preview_close_press',
        'document_download_focus', 'document_download_press', 'document_download_done'
    ];

    function selectDocumentType(useActualClick = false) {
        const button = document.querySelector('#typeFilters [data-type="scara"]');
        if (!button) return false;
        if (useActualClick) {
            button.click();
            cursor?.classList.remove('is-visible');
            spotlight?.classList.remove('is-visible', 'is-pulsing');
            return true;
        }
        document.querySelectorAll('#typeFilters .filter-btn').forEach(candidate => candidate.classList.remove('active'));
        button.classList.add('active');
        if (typeof window.renderManuals === 'function') window.renderManuals();
        return true;
    }

    function typeDocumentSearch(value) {
        const input = document.getElementById('manualSearch');
        if (!input) return;
        const typingToken = effectToken;
        let length = 0;
        const typeNext = () => {
            if (typingToken !== effectToken) return;
            length += 1;
            setValue(input, value.slice(0, length));
            if (length < value.length) window.setTimeout(typeNext, 120);
        };
        typeNext();
    }

    function renderDocument(cue) {
        const rank = Math.max(0, DOCUMENT_CUES.indexOf(cue));
        documentReset({ scroll: false });
        if (rank > 2) selectDocumentType(false);
        if (rank > 4) setValue('#manualSearch', 'IR-S4');
        const item = document.querySelector('#manualList .manual-item');
        const buttons = item ? item.querySelectorAll('button') : [];
        const viewButton = buttons[0];
        const downloadButton = buttons[1];
        if (['document_preview', 'document_preview_close_focus', 'document_preview_close_press'].includes(cue)) {
            showDocumentPreview();
        }
        const previewClose = preview?.querySelector('.tool-guide-document-close');
        const itemTitle = item?.querySelector('h3') || item;
        const targets = {
            document_reset: '#typeFilters', document_type_focus: '#typeFilters [data-type="scara"]', document_type_select: '#typeFilters [data-type="scara"]',
            document_search_focus: '#manualSearch', document_search_type: '#manualSearch', document_results: item || '#manualList',
            document_card_focus: itemTitle || '#manualList', document_view_focus: viewButton, document_view_press: viewButton,
            document_preview: preview, document_preview_close_focus: previewClose, document_preview_close_press: previewClose,
            document_download_focus: downloadButton, document_download_press: downloadButton,
            document_download_done: downloadButton
        };
        if (cue === 'document_preview') {
            clearEffects({ keepPreview: true });
            focusPoint = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            return;
        }
        if (cue === 'document_download_done') {
            clearEffects();
            showToast('Document download is ready', item?.querySelector('h3')?.textContent.trim() || 'IR-S4 User Guide.pdf');
            return;
        }
        const actions = {
            document_type_select: () => selectDocumentType(true),
            document_search_type: () => typeDocumentSearch('IR-S4'),
            document_preview_close_press: () => {
                closePreview();
                clearEffects();
            }
        };
        highlight(targets[cue], {
            press: /select|type|press/.test(cue),
            hover: /focus|press/.test(cue),
            ring: !['document_reset', 'document_results'].includes(cue),
            scroll: !cue.startsWith('document_preview_close_'),
            keepPreview: cue.startsWith('document_preview_close_'),
            delay: cue === 'document_preview_close_press' ? 180 : 120,
            onActivate: actions[cue]
        });
    }

    function simulationPanel(panelId, visible) {
        const panel = document.getElementById(panelId);
        if (!panel) return;
        const hidden = panel.classList.contains('hidden') || panel.classList.contains('panel-user-hidden');
        if (visible === hidden) document.querySelector(`[data-panel-toggle="${panelId}"]`)?.click();
    }

    function getSimulationApi() {
        return window.InoRobotSimulationManual || null;
    }

    function simulationResetPose() {
        getSimulationApi()?.reset?.();
    }

    const SIMULATION_CUES = [
        'simulation_reset', 'simulation_model_focus', 'simulation_model_press', 'simulation_model_loading', 'simulation_model_loaded',
        'simulation_jog_focus', 'simulation_jog_move', 'simulation_jog_done',
        'simulation_test_focus', 'simulation_test_press', 'simulation_test_dialog', 'simulation_test_confirm_focus', 'simulation_test_confirm_press', 'simulation_test_loading', 'simulation_test_ready',
        'simulation_snap_panel', 'simulation_snap_focus', 'simulation_snap_press', 'simulation_snap_active',
        'simulation_snap_face_focus', 'simulation_snap_face_press', 'simulation_snap_face_selected',
        'simulation_snap_target_focus', 'simulation_snap_target_press', 'simulation_snap_target_selected', 'simulation_snap_move', 'simulation_snap_done',
        'simulation_program_focus', 'simulation_program_launcher_press', 'simulation_program_open', 'simulation_program_pose_a',
        'simulation_program_teach_a_focus', 'simulation_program_teach_a_press', 'simulation_program_teach_a_done',
        'simulation_program_pose_b', 'simulation_program_teach_b_focus', 'simulation_program_teach_b_press', 'simulation_program_teach_b_done',
        'simulation_program_repeat_focus', 'simulation_program_repeat_press', 'simulation_program_repeat_done',
        'simulation_program_run_focus', 'simulation_program_run_press', 'simulation_program_run_started', 'simulation_program_running',
        'simulation_program_close_focus', 'simulation_program_close_press', 'simulation_program_close_done',
        'simulation_jog_close_focus', 'simulation_jog_close_press', 'simulation_jog_close_done',
        'simulation_full_view_running'
    ];

    function applySimulationMilestone(api, name) {
        api?.applyMilestone?.(name);
    }

    function renderSimulation(cue) {
        const api = getSimulationApi();
        if (!api) return;
        api.setCue?.(cue);
        clearEffects();
        closeToast();

        let timelineBase = null;
        if (['simulation_reset', 'simulation_model_focus', 'simulation_model_press', 'simulation_model_loading'].includes(cue)) {
            applySimulationMilestone(api, 'blank');
        } else if (['simulation_model_loaded', 'simulation_jog_focus', 'simulation_jog_move'].includes(cue)) {
            timelineBase = 'robot';
            applySimulationMilestone(api, timelineBase);
        } else if (['simulation_jog_done', 'simulation_test_focus', 'simulation_test_press', 'simulation_test_dialog',
            'simulation_test_confirm_focus', 'simulation_test_confirm_press', 'simulation_test_loading'].includes(cue)) {
            applySimulationMilestone(api, 'jog');
        } else if (['simulation_test_ready', 'simulation_snap_panel', 'simulation_snap_focus', 'simulation_snap_press', 'simulation_snap_active',
            'simulation_snap_face_focus', 'simulation_snap_face_press', 'simulation_snap_face_selected',
            'simulation_snap_target_focus', 'simulation_snap_target_press', 'simulation_snap_target_selected', 'simulation_snap_move'].includes(cue)) {
            timelineBase = 'test';
            applySimulationMilestone(api, timelineBase);
        } else if (['simulation_snap_done', 'simulation_program_focus', 'simulation_program_launcher_press', 'simulation_program_open', 'simulation_program_pose_a'].includes(cue)) {
            timelineBase = ['simulation_program_open', 'simulation_program_pose_a'].includes(cue) ? 'programBase' : 'snap';
            applySimulationMilestone(api, timelineBase);
        } else if (['simulation_program_teach_a_focus', 'simulation_program_teach_a_press'].includes(cue)) {
            applySimulationMilestone(api, 'programPoseA');
        } else if (['simulation_program_teach_a_done', 'simulation_program_pose_b'].includes(cue)) {
            timelineBase = 'programP0';
            applySimulationMilestone(api, timelineBase);
        } else if (['simulation_program_teach_b_focus', 'simulation_program_teach_b_press'].includes(cue)) {
            applySimulationMilestone(api, 'programPoseB');
        } else if (['simulation_program_teach_b_done', 'simulation_program_repeat_focus', 'simulation_program_repeat_press'].includes(cue)) {
            applySimulationMilestone(api, 'programP1');
        } else if (['simulation_program_repeat_done', 'simulation_program_run_focus', 'simulation_program_run_press'].includes(cue)) {
            applySimulationMilestone(api, 'programReady');
        } else if (['simulation_program_run_started', 'simulation_program_running',
            'simulation_program_close_focus', 'simulation_program_close_press', 'simulation_program_close_done',
            'simulation_jog_close_focus', 'simulation_jog_close_press', 'simulation_jog_close_done', 'simulation_full_view_running'].includes(cue)) {
            const programState = api.getState?.();
            if (!programState?.robotName || programState.programSteps !== 2 || !programState.repeat) applySimulationMilestone(api, 'programReady');
            if (cue === 'simulation_program_run_started') api.startProgram?.();
            else api.ensureProgramRunning?.();
        }

        if (['simulation_reset', 'simulation_model_focus', 'simulation_model_press'].includes(cue)) api.showModelSelection?.(false);
        else api.showModelSelection?.(true);
        api.showLoading?.(cue === 'simulation_model_loading', '로봇 모델을 생성하는 중...');
        if (['simulation_test_dialog', 'simulation_test_confirm_focus', 'simulation_test_confirm_press'].includes(cue)) api.showTestDialog?.();
        else api.closeTestDialog?.();
        if (cue === 'simulation_test_loading') api.showLoading?.(true, 'Test 설비와 Tool을 배치하는 중...');
        const snapActivated = ['simulation_snap_active', 'simulation_snap_face_focus', 'simulation_snap_face_press', 'simulation_snap_face_selected',
            'simulation_snap_target_focus', 'simulation_snap_target_press', 'simulation_snap_target_selected', 'simulation_snap_move', 'simulation_snap_done'].includes(cue);
        if ((['simulation_jog_focus', 'simulation_jog_move', 'simulation_snap_panel', 'simulation_snap_focus', 'simulation_snap_press'].includes(cue)
            || cue.startsWith('simulation_program_')) && !snapActivated) {
            api.setJogMode?.('joint');
        }
        if (snapActivated) api.setSnapMode?.(true);
        if (['simulation_snap_face_selected', 'simulation_snap_target_focus', 'simulation_snap_target_press',
            'simulation_snap_target_selected', 'simulation_snap_move', 'simulation_snap_done'].includes(cue)) api.showSnapSelection?.();
        if (['simulation_snap_target_selected', 'simulation_snap_move', 'simulation_snap_done'].includes(cue)) api.showSnapTarget?.();
        if (timelineBase) api.setCue?.(cue);

        const jogPanel = document.getElementById('jog-panel');
        const programPanel = document.getElementById('program-panel');
        const showModelPanel = cue === 'simulation_test_ready';
        const showJogPanel = ['simulation_jog_focus', 'simulation_jog_move'].includes(cue)
            || cue.startsWith('simulation_snap_')
            || (cue.startsWith('simulation_program_') && !['simulation_program_focus', 'simulation_program_launcher_press'].includes(cue))
            || ['simulation_jog_close_focus', 'simulation_jog_close_press'].includes(cue);
        const showProgramPanel = cue.startsWith('simulation_program_')
            && !['simulation_program_focus', 'simulation_program_launcher_press', 'simulation_program_close_done'].includes(cue);
        api.setPanelVisible?.('model-browser-panel', showModelPanel);
        api.setPanelVisible?.('jog-panel', showJogPanel);
        api.setPanelVisible?.('program-panel', showProgramPanel);
        if (['simulation_model_loaded', 'simulation_jog_done', 'simulation_program_focus', 'simulation_program_launcher_press',
            'simulation_program_open', 'simulation_full_view_running'].includes(cue)) api.focusRobot?.();

        let jointInput = document.querySelector('#jog-controls .jog-row input[type="range"]');
        const programRows = document.querySelectorAll('#program-step-list [data-program-step-id]');
        const targets = {
            simulation_reset: '.select-wrapper', simulation_model_focus: '.select-wrapper', simulation_model_press: '.select-wrapper',
            simulation_model_loading: '#canvas-container', simulation_model_loaded: '#canvas-container',
            simulation_jog_focus: '#jog-panel', simulation_jog_move: jointInput, simulation_jog_done: '#canvas-container',
            simulation_test_focus: '#btn-test-model', simulation_test_press: '#btn-test-model', simulation_test_dialog: '#test-model-dialog',
            simulation_test_confirm_focus: '#btn-confirm-test-model', simulation_test_confirm_press: '#btn-confirm-test-model',
            simulation_test_loading: '#canvas-container', simulation_test_ready: '#model-browser-panel',
            simulation_snap_panel: '#jog-panel', simulation_snap_focus: '#btn-snap-move', simulation_snap_press: '#btn-snap-move', simulation_snap_active: '#btn-snap-move',
            simulation_snap_face_focus: '#canvas-container', simulation_snap_face_press: '#canvas-container', simulation_snap_face_selected: '#canvas-container',
            simulation_snap_target_focus: '#canvas-container', simulation_snap_target_press: '#canvas-container', simulation_snap_target_selected: '#simulation-snap-marker',
            simulation_snap_move: '#canvas-container', simulation_snap_done: '#canvas-container',
            simulation_program_focus: '[data-panel-toggle="program-panel"]', simulation_program_launcher_press: '[data-panel-toggle="program-panel"]', simulation_program_open: '#program-panel',
            simulation_program_pose_a: jointInput, simulation_program_teach_a_focus: '#program-add-step', simulation_program_teach_a_press: '#program-add-step', simulation_program_teach_a_done: programRows[0] || '#program-step-list',
            simulation_program_pose_b: jointInput, simulation_program_teach_b_focus: '#program-add-step', simulation_program_teach_b_press: '#program-add-step', simulation_program_teach_b_done: programRows[1] || '#program-step-list',
            simulation_program_repeat_focus: '#program-repeat-robot', simulation_program_repeat_press: '#program-repeat-robot', simulation_program_repeat_done: '#program-repeat-robot',
            simulation_program_run_focus: '#program-run-robot', simulation_program_run_press: '#program-run-robot', simulation_program_run_started: '#program-step-list',
            simulation_program_running: programRows[0] || '#program-step-list',
            simulation_program_close_focus: programPanel?.querySelector('[data-panel-action="hide"]'),
            simulation_program_close_press: programPanel?.querySelector('[data-panel-action="hide"]'),
            simulation_program_close_done: '#jog-panel',
            simulation_jog_close_focus: jogPanel?.querySelector('[data-panel-action="hide"]'),
            simulation_jog_close_press: jogPanel?.querySelector('[data-panel-action="hide"]'),
            simulation_jog_close_done: '#canvas-container',
            simulation_full_view_running: '#canvas-container'
        };
        const target = targets[cue];
        const canvasCue = target === '#canvas-container';
        simulationTarget = targets[cue];
        if (cue === 'simulation_test_ready') showToast('Test 모델 배치 완료', 'Test_Equipment_CAD.step · Vacuum_Tool_X200mm.stl');
        if (cue === 'simulation_snap_done') showToast('스냅 이동 완료', '선택한 CAD 스냅 위치');
        if (cue === 'simulation_program_run_started' || cue === 'simulation_program_running') showToast('자동 반복 운전 중', 'P[0] Pick ↔ P[1] Place');
        if (cue === 'simulation_full_view_running') showToast('패널을 닫고 반복 동작 확인', 'P[0] Pick ↔ P[1] Place');
    }

    async function prepareSimulation() {
        const api = await waitFor(() => getSimulationApi(), 20000);
        await api.prepare();
        const preparedState = api.getState?.();
        demoModelLoaded = Boolean(preparedState?.prepared);
    }

    async function prepare() {
        ensureEffects();
        if (prepared) return true;
        if (app === 'simulation') await prepareSimulation();
        if (app === 'tool') await waitFor(() => document.getElementById('robot')?.options.length ? true : false);
        if (app === 'project') await waitFor(() => document.querySelector('#stepsList > div'));
        if (app === 'document') await waitFor(() => document.querySelector('#manualList .manual-item'));
        prepared = true;
        return true;
    }

    function renderTimelineCue(cue, cueStart = 0) {
        if (!prepared || !cue) return false;
        activeCue = cue;
        simulationCueStart = cueStart;
        if (app === 'simulation') renderSimulation(cue);
        // Project playback is driven by the media clock, including seeks and pauses.
        if (app === 'document') renderDocument(cue);
        return true;
    }

    function setTimelineTime(time) {
        if (app === 'tool' && prepared) renderToolTime(Math.max(0, Number(time) || 0));
        if (app === 'project' && prepared) renderProjectTime(Math.max(0, Number(time) || 0));
        if (app === 'simulation') getSimulationApi()?.setTimelineTime?.(Number(time) || 0);
        if (app === 'simulation' && prepared) renderSimulationTime(Math.max(0, Number(time) || 0));
        if (app === 'document' && preview?.isConnected) {
            const pageWrap = preview.querySelector('.tool-guide-document-page-wrap');
            if (pageWrap) {
                const progress = Math.max(0, Math.min(1, ((Number(time) || 0) - 22400) / 3000));
                pageWrap.scrollTop = Math.max(0, pageWrap.scrollHeight - pageWrap.clientHeight) * progress;
            }
        }
    }

    function resetTimeline() {
        activeCue = '';
        clearEffects();
        if (app === 'tool' || app === 'simulation') resetDemoMotion();
        if (app === 'tool') toolReset();
        if (app === 'project') resetProjectPlayback();
        if (app === 'document') documentReset();
        if (app === 'simulation') simulationResetPose();
    }

    function setGuidePaused(paused) {
        const wasPaused = guidePaused;
        guidePaused = Boolean(paused);
        document.documentElement.classList.toggle('tool-guide-paused', guidePaused);
        if (guidePaused && !wasPaused) stopActiveScroll(true);
        else if (!guidePaused && wasPaused) resumePausedScroll();
        if (app === 'simulation') {
            const api = getSimulationApi();
            api?.setPaused?.(guidePaused);
            if (!paused && activeCue === 'simulation_full_view_running') api?.ensureProgramRunning?.();
        }
    }

    window.InoRobotToolManual = Object.freeze({
        app,
        prepare,
        renderTimelineCue,
        setTimelineTime,
        resetTimeline,
        getFocusPoint: () => focusPoint,
        setPaused: setGuidePaused,
        getState: () => ({
            app,
            prepared,
            activeCue,
            demoModelLoaded,
            project: app === 'project' ? { time:projectTime, package:projectPackage } : null,
            simulation: app === 'simulation' ? getSimulationApi()?.getState?.() || null : null
        })
    });
}());
