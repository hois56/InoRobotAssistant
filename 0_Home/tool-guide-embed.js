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

    function configureProjectSecondStep() {
        ensureProjectSecondStep();
        setProjectProcessChoice(1, 0, 'Stage');
        setProjectProcessChoice(1, 1, 'Put');
    }

    function animateProjectSecondStepConfiguration() {
        const typeSelect = document.querySelectorAll('#stepsList > div')[1]?.querySelectorAll('select')[0];
        if (!typeSelect) return;
        const sequenceToken = effectToken;
        setProjectProcessChoice(1, 0, 'Stage');
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (sequenceToken !== effectToken) return;
            const methodSelect = document.querySelectorAll('#stepsList > div')[1]?.querySelectorAll('select')[1];
            if (!methodSelect) return;
            highlight(methodSelect, {
                press: true,
                hover: true,
                onActivate: () => setProjectProcessChoice(1, 1, 'Put')
            });
        }));
    }

    const PROJECT_CUES = [
        'project_reset', 'project_name_focus', 'project_name_value', 'project_model_focus', 'project_model_select',
        'project_process_focus', 'project_process_add', 'project_process_configure', 'project_preview',
        'project_options_focus', 'project_options_open', 'project_option_speed', 'project_options_apply',
        'project_generate_focus', 'project_generate_press', 'project_generate_done'
    ];

    function renderProject(cue) {
        const rank = Math.max(0, PROJECT_CUES.indexOf(cue));
        projectReset();
        if (rank > 2) setProjectName(PROJECT_DEMO_NAME);
        if (rank > 4) chooseProjectDemoModel();
        if (rank > 6) ensureProjectSecondStep();
        if (rank > 7) configureProjectSecondStep();
        if (rank === 11) openProjectOptions();
        if (rank === 12) {
            openProjectOptions();
            setProjectCheckbox('chkTcpSpeed', true);
        }
        if (rank > 12) {
            openProjectOptions();
            setProjectCheckbox('chkTcpSpeed', true);
            applyProjectOptions();
        }
        const rows = document.querySelectorAll('#stepsList > div');
        const firstRow = rows[0];
        const secondRow = rows[1];
        const secondType = secondRow?.querySelectorAll('select')[0];
        const speedOption = document.getElementById('chkTcpSpeed')?.closest('label') || document.getElementById('chkTcpSpeed');
        const targets = {
            project_reset: '#prjName', project_name_focus: '#prjName', project_name_value: '#prjName',
            project_model_focus: '#cmbRobotModel', project_model_select: '#cmbRobotModel', project_process_focus: firstRow || '#stepsList',
            project_process_add: '#btnAdd', project_process_configure: secondType || secondRow || '#stepsList', project_options_focus: '#btnOption',
            project_options_open: '#btnOption', project_option_speed: speedOption, project_options_apply: '#btnApplyOptions',
            project_preview: '#prismContainer', project_generate_focus: '#btnGenerate', project_generate_press: '#btnGenerate',
            project_generate_done: '#btnGenerate'
        };
        if (cue === 'project_generate_done') {
            clearEffects();
            showToast('Project package is ready', 'InoRobot_Demo.zip');
            return;
        }
        const actions = {
            project_name_value: () => setProjectName(PROJECT_DEMO_NAME),
            project_model_select: chooseProjectDemoModel,
            project_process_add: ensureProjectSecondStep,
            project_process_configure: animateProjectSecondStepConfiguration,
            project_options_open: openProjectOptions,
            project_option_speed: () => setProjectCheckbox('chkTcpSpeed', true),
            project_options_apply: applyProjectOptions
        };
        highlight(targets[cue], {
            press: /value|select|add|open|speed|apply|press/.test(cue),
            hover: /focus|press|open|speed|apply/.test(cue),
            ring: !['project_process_focus', 'project_preview'].includes(cue),
            onActivate: actions[cue]
        });
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
        highlight(targets[cue], {
            press: cue.endsWith('_press'),
            hover: cue.endsWith('_focus') || cue.endsWith('_press'),
            ring: !canvasCue,
            scroll: false
        });
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

    function renderTimelineCue(cue) {
        if (!prepared || !cue) return false;
        activeCue = cue;
        if (app === 'simulation') renderSimulation(cue);
        if (app === 'tool') renderTool(cue);
        if (app === 'project') renderProject(cue);
        if (app === 'document') renderDocument(cue);
        return true;
    }

    function setTimelineTime(time) {
        if (app === 'simulation') getSimulationApi()?.setTimelineTime?.(Number(time) || 0);
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
        if (app === 'tool') toolReset();
        if (app === 'project') projectReset();
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
            simulation: app === 'simulation' ? getSimulationApi()?.getState?.() || null : null
        })
    });
}());
