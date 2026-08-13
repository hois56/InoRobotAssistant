(function () {
    'use strict';

    const TOTAL_DURATION = 36000;
    const FRAME_WIDTH = 1200;
    const FRAME_HEIGHT = 720;
    const FRAME_TIMEOUT = 15000;
    const CAMERA_TRANSITION_DURATION = 680;
    const CHAPTERS = [
        { start: 0, title: '필터 선택' },
        { start: 8000, title: '모델 선택 및 옵션 구성' },
        { start: 22000, title: '파일 다운로드 및 구성 내역 확인' }
    ];
    const CUES = [
        { at: 0, id: 'reset' },
        { at: 900, id: 'filter_type_focus' },
        { at: 1500, id: 'filter_type_press' },
        { at: 2400, id: 'filter_payload_focus' },
        { at: 3000, id: 'filter_payload_press' },
        { at: 3900, id: 'filter_reach_focus' },
        { at: 4500, id: 'filter_reach_press' },
        { at: 5900, id: 'results' },
        { at: 8000, id: 'model_focus' },
        { at: 9400, id: 'model_press' },
        { at: 10100, id: 'modal_open' },
        { at: 11600, id: 'option_length_focus' },
        { at: 12600, id: 'option_length_press' },
        { at: 13900, id: 'option_flex_focus' },
        { at: 14900, id: 'option_flex_press' },
        { at: 16200, id: 'option_pendant_focus' },
        { at: 17200, id: 'option_pendant_press' },
        { at: 18600, id: 'option_comm_focus' },
        { at: 19600, id: 'option_comm_press' },
        { at: 20700, id: 'configured' },
        { at: 22000, id: 'cad_focus' },
        { at: 24000, id: 'cad_press' },
        { at: 24900, id: 'cad_done' },
        { at: 26700, id: 'pdf_focus' },
        { at: 27600, id: 'pdf_press' },
        { at: 28600, id: 'pdf_done' },
        { at: 30400, id: 'preview' }
    ];
    const CUE_COPY = {
        reset: ['필요한 사양을 선택하세요', '로봇 유형, 가반하중, 리치 등 필요한 조건을 필터에서 선택합니다.'],
        filter_type: ['필요한 사양을 선택하세요', '로봇 유형, 가반하중, 리치 등 필요한 조건을 필터에서 선택합니다.'],
        filter_payload: ['필요한 사양을 선택하세요', '로봇 유형, 가반하중, 리치 등 필요한 조건을 필터에서 선택합니다.'],
        filter_reach: ['필요한 사양을 선택하세요', '로봇 유형, 가반하중, 리치 등 필요한 조건을 필터에서 선택합니다.'],
        results: ['필요한 사양을 선택하세요', '로봇 유형, 가반하중, 리치 등 필요한 조건을 필터에서 선택합니다.'],
        model_focus: ['모델을 선택하고 옵션을 구성하세요', '모델 카드를 선택해 상세 구성 화면을 열고 케이블, 티치펜던트와 통신 옵션을 구성합니다.'],
        model_press: ['모델을 선택하고 옵션을 구성하세요', '모델 카드를 선택해 상세 구성 화면을 열고 케이블, 티치펜던트와 통신 옵션을 구성합니다.'],
        modal_open: ['모델을 선택하고 옵션을 구성하세요', '모델 카드를 선택해 상세 구성 화면을 열고 케이블, 티치펜던트와 통신 옵션을 구성합니다.'],
        option_length: ['모델을 선택하고 옵션을 구성하세요', '모델 카드를 선택해 상세 구성 화면을 열고 케이블, 티치펜던트와 통신 옵션을 구성합니다.'],
        option_flex: ['모델을 선택하고 옵션을 구성하세요', '모델 카드를 선택해 상세 구성 화면을 열고 케이블, 티치펜던트와 통신 옵션을 구성합니다.'],
        option_pendant: ['모델을 선택하고 옵션을 구성하세요', '모델 카드를 선택해 상세 구성 화면을 열고 케이블, 티치펜던트와 통신 옵션을 구성합니다.'],
        option_comm: ['모델을 선택하고 옵션을 구성하세요', '모델 카드를 선택해 상세 구성 화면을 열고 케이블, 티치펜던트와 통신 옵션을 구성합니다.'],
        configured: ['모델을 선택하고 옵션을 구성하세요', '모델 카드를 선택해 상세 구성 화면을 열고 케이블, 티치펜던트와 통신 옵션을 구성합니다.'],
        cad_focus: ['CAD 파일을 내려받습니다', 'CAD 다운로드 버튼에서 2D·3D 파일 묶음을 내려받습니다.'],
        cad_press: ['CAD 파일을 내려받습니다', 'CAD 다운로드 버튼에서 2D·3D 파일 묶음을 내려받습니다.'],
        cad_done: ['CAD 파일을 내려받습니다', 'CAD 다운로드 버튼에서 2D·3D 파일 묶음을 내려받습니다.'],
        pdf_focus: ['구성 내역을 내려받습니다', '선택한 모델과 옵션이 반영된 PDF 구성서를 내려받습니다.'],
        pdf_press: ['구성 내역을 내려받습니다', '선택한 모델과 옵션이 반영된 PDF 구성서를 내려받습니다.'],
        pdf_done: ['구성 내역을 내려받습니다', '선택한 모델과 옵션이 반영된 PDF 구성서를 내려받습니다.'],
        preview: ['다운로드한 구성 내역을 열어 확인합니다', '제품 기본 정보와 선택한 옵션이 구성서에 정확히 반영되었는지 확인합니다.']
    };

    const modal = document.getElementById('robot-select-guide-modal');
    const dialog = modal?.querySelector('.manual-guide-dialog');
    const openButtons = Array.from(document.querySelectorAll('[data-manual-open]'));
    const closeButton = modal?.querySelector('[data-manual-close]');
    const stepButtons = Array.from(modal?.querySelectorAll('[data-manual-step]') || []);
    const markerButtons = Array.from(modal?.querySelectorAll('[data-manual-marker]') || []);
    const previousButton = modal?.querySelector('[data-manual-previous]');
    const nextButton = modal?.querySelector('[data-manual-next]');
    const playButton = modal?.querySelector('[data-manual-play]');
    const pauseIcon = modal?.querySelector('[data-manual-pause-icon]');
    const playIcon = modal?.querySelector('[data-manual-play-icon]');
    const pauseLabel = modal?.querySelector('[data-manual-pause-label]');
    const playLabel = modal?.querySelector('[data-manual-play-label]');
    const replayLabel = modal?.querySelector('[data-manual-replay-label]');
    const seekInput = modal?.querySelector('[data-manual-seek]');
    const timeOutput = modal?.querySelector('[data-manual-time]');
    const captionTitle = modal?.querySelector('[data-manual-caption-title]');
    const captionCopy = modal?.querySelector('[data-manual-caption-copy]');
    const status = modal?.querySelector('[data-manual-status]');
    const frame = modal?.querySelector('#robot-select-guide-frame');
    const frameStage = modal?.querySelector('[data-manual-stage]');
    const frameCanvas = modal?.querySelector('[data-manual-canvas]');
    const frameLoading = modal?.querySelector('[data-manual-loading]');
    const frameError = modal?.querySelector('[data-manual-error]');
    const languageSwitcher = document.getElementById('inorobot-language-switcher');

    if (!modal || !dialog || !openButtons.length || !closeButton || stepButtons.length !== CHAPTERS.length
        || markerButtons.length !== CHAPTERS.length || !previousButton || !nextButton || !playButton
        || !pauseIcon || !playIcon || !pauseLabel || !playLabel || !replayLabel || !seekInput
        || !timeOutput || !captionTitle || !captionCopy || !status || !frame || !frameStage
        || !frameCanvas || !frameLoading || !frameError) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let currentTime = 0;
    let activeChapter = 0;
    let activeCue = '';
    let isPlaying = false;
    let animationFrame = null;
    let lastTick = 0;
    let lastFocusedElement = null;
    let previousBodyOverflow = '';
    let previousLanguageSwitcherVisibility = '';
    let inertState = [];
    let frameStarted = false;
    let frameReady = false;
    let frameFailed = false;
    let frameTimeout = null;
    let framePoll = null;
    let isScrubbing = false;
    let resumeAfterScrub = false;
    let cameraTransitionTimer = null;
    let lastFrameTransform = '';

    function translate(source) {
        return window.InoRobotI18n?.translate(source) || source;
    }

    function isOpen() {
        return modal.classList.contains('is-open');
    }

    function getFrameApi() {
        try {
            return frame.contentWindow?.InoRobotModelManual || null;
        } catch {
            return null;
        }
    }

    function formatTime(milliseconds) {
        const seconds = Math.max(0, Math.min(TOTAL_DURATION, milliseconds)) / 1000;
        const wholeSeconds = Math.floor(seconds);
        const minutes = Math.floor(wholeSeconds / 60);
        const remainder = wholeSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    }

    function getChapterAt(time) {
        if (time >= CHAPTERS[2].start) return 2;
        if (time >= CHAPTERS[1].start) return 1;
        return 0;
    }

    function getCueAt(time) {
        let cue = CUES[0];
        for (const candidate of CUES) {
            if (candidate.at > time) break;
            cue = candidate;
        }
        return cue.id;
    }

    function getCueCopy(cue) {
        const baseCue = String(cue || '').replace(/_(focus|press)$/, '');
        const copy = CUE_COPY[cue] || CUE_COPY[baseCue] || CUE_COPY.reset;
        return { title: translate(copy[0]), description: translate(copy[1]) };
    }

    function cancelCameraTransition() {
        if (cameraTransitionTimer !== null) window.clearTimeout(cameraTransitionTimer);
        cameraTransitionTimer = null;
        frameCanvas.classList.remove('is-camera-animating');
        frameCanvas.getAnimations?.().forEach(animation => {
            if (animation.transitionProperty === 'transform') animation.cancel();
        });
    }

    function beginCameraTransition() {
        if (!isPlaying || isScrubbing || reducedMotion.matches) return false;
        if (cameraTransitionTimer !== null) window.clearTimeout(cameraTransitionTimer);
        frameCanvas.classList.add('is-camera-animating');
        cameraTransitionTimer = window.setTimeout(() => {
            cameraTransitionTimer = null;
            frameCanvas.classList.remove('is-camera-animating');
        }, CAMERA_TRANSITION_DURATION + 80);
        return true;
    }

    function fitFrame(options = {}) {
        if (!frameStage.clientWidth || !frameStage.clientHeight) return;
        if (options.snap) cancelCameraTransition();
        const fittedScale = Math.min(frameStage.clientWidth / FRAME_WIDTH, frameStage.clientHeight / FRAME_HEIGHT);
        const compact = frameStage.clientWidth <= 520;
        const preferredScale = compact ? 0.48 : 0.68;
        const scale = Math.max(fittedScale, Math.min(preferredScale, frameStage.clientWidth / FRAME_WIDTH));
        const fallbackFocusX = [520, 760, 700][activeChapter] || FRAME_WIDTH / 2;
        const focus = getFrameApi()?.getFocusPoint?.();
        const focusX = Number.isFinite(focus?.x) ? focus.x : fallbackFocusX;
        const scaledWidth = FRAME_WIDTH * scale;
        const scaledHeight = FRAME_HEIGHT * scale;
        const minLeft = Math.min(0, frameStage.clientWidth - scaledWidth);
        const minTop = Math.min(0, frameStage.clientHeight - scaledHeight);
        const rawLeft = compact
            ? Math.max(minLeft, Math.min(0, frameStage.clientWidth / 2 - focusX * scale))
            : Math.max(0, (frameStage.clientWidth - scaledWidth) / 2);
        // Vertical movement belongs to the embedded page's smooth scroll. If
        // the outer crop follows the same target, both motions interfere and
        // create a small rebound at the end of each scene transition.
        const rawTop = scaledHeight > frameStage.clientHeight
            ? minTop / 2
            : Math.max(0, (frameStage.clientHeight - scaledHeight) / 2);
        const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
        const left = Math.round(rawLeft * pixelRatio) / pixelRatio;
        const top = Math.round(rawTop * pixelRatio) / pixelRatio;
        const transform = `translate3d(${left}px, ${top}px, 0) scale(${scale})`;
        if (transform === lastFrameTransform) return;
        if (options.animate) beginCameraTransition();
        lastFrameTransform = transform;
        frameCanvas.style.transform = transform;
    }

    function syncFrameLocale() {
        if (!frameReady) return;
        try {
            const locale = window.InoRobotI18n?.locale;
            const childI18n = frame.contentWindow?.InoRobotI18n;
            if (locale && childI18n && childI18n.locale !== locale) {
                childI18n.setLocale(locale, { persist: false, broadcast: false });
            }
        } catch {
            // The loading fallback remains usable if the child document is unavailable.
        }
    }

    function clearFrameWaiters() {
        if (frameTimeout !== null) window.clearTimeout(frameTimeout);
        if (framePoll !== null) window.clearInterval(framePoll);
        frameTimeout = null;
        framePoll = null;
    }

    function stopAnimationFrame() {
        if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
        lastTick = 0;
    }

    function markFrameFailed() {
        if (frameReady) return;
        frameFailed = true;
        clearFrameWaiters();
        frameLoading.hidden = true;
        frameError.hidden = false;
        frameStage.classList.remove('is-ready');
        setPlaying(false);
    }

    function retryFrame() {
        if (!frameFailed) return;
        clearFrameWaiters();
        frameStarted = false;
        frameFailed = false;
        frame.removeAttribute('src');
        ensureFrame();
    }

    function finishFrameReady() {
        if (frameReady || !getFrameApi()) return false;
        frameReady = true;
        frameFailed = false;
        clearFrameWaiters();
        frameLoading.hidden = true;
        frameError.hidden = true;
        frameStage.classList.add('is-ready');
        syncFrameLocale();
        activeCue = '';
        renderAt(currentTime, true);
        requestAnimationFrame(() => requestAnimationFrame(() => fitFrame({ snap: true })));
        if (isPlaying) startAnimationFrame();
        return true;
    }

    function ensureFrame() {
        if (frameReady) {
            syncFrameLocale();
            renderAt(currentTime, true);
            return;
        }
        if (frameStarted) return;
        frameStarted = true;
        frameFailed = false;
        frameLoading.hidden = false;
        frameError.hidden = true;
        frame.src = frame.dataset.src;
        framePoll = window.setInterval(finishFrameReady, 100);
        frameTimeout = window.setTimeout(markFrameFailed, FRAME_TIMEOUT);
    }

    function updateChapterUi(chapter, announce) {
        const changed = chapter !== activeChapter;
        activeChapter = chapter;
        stepButtons.forEach((button, index) => {
            const selected = index === activeChapter;
            button.classList.toggle('is-active', selected);
            if (selected) button.setAttribute('aria-current', 'step');
            else button.removeAttribute('aria-current');
        });
        markerButtons.forEach((button, index) => {
            button.classList.toggle('is-active', index === activeChapter);
        });
        if (changed && frameStage.clientWidth <= 820) {
            const activeStep = stepButtons[activeChapter];
            const stepsNav = activeStep?.parentElement;
            if (activeStep && stepsNav) {
                const left = activeStep.offsetLeft - Math.max(0, (stepsNav.clientWidth - activeStep.offsetWidth) / 2);
                stepsNav.scrollTo({ left: Math.max(0, left), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
            }
        }
        previousButton.disabled = activeChapter === 0;
        nextButton.disabled = activeChapter === CHAPTERS.length - 1;
        if (announce && changed) {
            const chapterTitle = stepButtons[activeChapter]?.querySelector('strong')?.textContent.trim() || '';
            status.textContent = `${activeChapter + 1} / ${CHAPTERS.length}. ${chapterTitle}`;
        }
    }

    function updateTimelineUi(cue) {
        const progress = currentTime / TOTAL_DURATION;
        seekInput.value = String(Math.round(currentTime));
        seekInput.style.setProperty('--manual-progress', `${progress * 100}%`);
        const currentLabel = formatTime(currentTime);
        const totalLabel = formatTime(TOTAL_DURATION);
        const copy = getCueCopy(cue);
        timeOutput.value = `${currentLabel} / ${totalLabel}`;
        timeOutput.textContent = `${currentLabel} / ${totalLabel}`;
        seekInput.setAttribute('aria-valuetext', `${currentLabel} / ${totalLabel}, ${copy.title}`);
        captionTitle.textContent = copy.title;
        captionCopy.textContent = copy.description;
    }

    function updatePlaybackUi() {
        const ended = currentTime >= TOTAL_DURATION;
        pauseIcon.hidden = !isPlaying;
        playIcon.hidden = isPlaying;
        playButton.setAttribute('aria-pressed', String(isPlaying));
        const label = isPlaying ? pauseLabel : ended ? replayLabel : playLabel;
        playButton.setAttribute('aria-label', label.textContent.trim());
        modal.classList.toggle('is-paused', !isPlaying);
        modal.classList.toggle('is-ended', ended);
        getFrameApi()?.setPaused(!isPlaying);
    }

    function renderAt(time, force) {
        currentTime = Math.max(0, Math.min(TOTAL_DURATION, Number(time) || 0));
        const chapter = getChapterAt(currentTime);
        const cue = getCueAt(currentTime);
        updateChapterUi(chapter, !force);
        updateTimelineUi(cue);

        const api = getFrameApi();
        if (frameReady && api && (force || cue !== activeCue)) {
            activeCue = cue;
            api.renderTimelineCue(cue, {
                animateScroll: isPlaying && !isScrubbing && !force && !reducedMotion.matches,
                force: Boolean(force)
            });
            const animateCamera = isPlaying && !isScrubbing && !force && !reducedMotion.matches;
            requestAnimationFrame(() => requestAnimationFrame(() => fitFrame({
                animate: animateCamera,
                snap: !animateCamera
            })));
        }
        if (frameReady && cue === 'preview') {
            const previewProgress = Math.max(0, Math.min(1, (currentTime - 31600) / 3900));
            api?.setPreviewScroll(previewProgress);
        }
        updatePlaybackUi();
    }

    function tick(timestamp) {
        animationFrame = null;
        if (!isPlaying || !isOpen() || !frameReady || document.hidden) return;
        if (!lastTick) lastTick = timestamp;
        const delta = Math.min(100, timestamp - lastTick);
        lastTick = timestamp;
        renderAt(currentTime + delta, false);
        if (currentTime >= TOTAL_DURATION) {
            setPlaying(false);
            status.textContent = translate('가이드 재생이 완료되었습니다.');
            return;
        }
        animationFrame = window.requestAnimationFrame(tick);
    }

    function startAnimationFrame() {
        if (animationFrame !== null || !isPlaying || !frameReady || !isOpen() || document.hidden) return;
        lastTick = 0;
        animationFrame = window.requestAnimationFrame(tick);
    }

    function setPlaying(nextPlaying) {
        const nextState = Boolean(nextPlaying);
        if (nextState && currentTime >= TOTAL_DURATION) {
            activeCue = '';
            getFrameApi()?.resetTimeline?.();
            renderAt(0, true);
        }
        isPlaying = nextState;
        if (isPlaying) startAnimationFrame();
        else {
            stopAnimationFrame();
            cancelCameraTransition();
        }
        updatePlaybackUi();
    }

    function seekTo(time, options) {
        const settings = options || {};
        activeCue = settings.force ? '' : activeCue;
        renderAt(time, Boolean(settings.force));
        lastTick = 0;
    }

    function seekToChapter(index, focusStep) {
        const target = Math.max(0, Math.min(CHAPTERS.length - 1, Number(index) || 0));
        seekTo(CHAPTERS[target].start, { force: true });
        if (focusStep) stepButtons[target].focus({ preventScroll: true });
    }

    function setBackgroundInert(nextInert) {
        if (nextInert) {
            inertState = Array.from(document.body.children)
                .filter(element => element !== modal && !['SCRIPT', 'STYLE'].includes(element.tagName))
                .map(element => ({ element, inert: element.inert }));
            inertState.forEach(({ element }) => { element.inert = true; });
            return;
        }
        inertState.forEach(({ element, inert }) => { element.inert = inert; });
        inertState = [];
    }

    function openGuide(trigger) {
        if (isOpen()) return;
        lastFocusedElement = trigger instanceof HTMLElement ? trigger : document.activeElement;
        previousBodyOverflow = document.body.style.overflow;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        openButtons.forEach(button => button.setAttribute('aria-expanded', 'true'));
        document.body.style.overflow = 'hidden';
        if (languageSwitcher) {
            previousLanguageSwitcherVisibility = languageSwitcher.style.visibility;
            languageSwitcher.style.visibility = 'hidden';
        }
        setBackgroundInert(true);
        isPlaying = !reducedMotion.matches;
        currentTime = 0;
        activeCue = '';
        if (frameFailed) retryFrame();
        else ensureFrame();
        renderAt(0, true);
        updatePlaybackUi();
        requestAnimationFrame(() => fitFrame({ snap: true }));
        closeButton.focus({ preventScroll: true });
    }

    function closeGuide() {
        if (!isOpen()) return;
        setPlaying(false);
        getFrameApi()?.cancel();
        activeCue = '';
        modal.classList.remove('is-open', 'is-paused', 'is-ended');
        modal.setAttribute('aria-hidden', 'true');
        openButtons.forEach(button => button.setAttribute('aria-expanded', 'false'));
        document.body.style.overflow = previousBodyOverflow;
        if (languageSwitcher) languageSwitcher.style.visibility = previousLanguageSwitcherVisibility;
        setBackgroundInert(false);
        if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus({ preventScroll: true });
    }

    function getFocusableElements() {
        return Array.from(dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'))
            .filter(element => !element.hidden && element.getClientRects().length > 0);
    }

    function trapFocus(event) {
        const focusable = getFocusableElements();
        if (!focusable.length) {
            event.preventDefault();
            dialog.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function beginScrub() {
        if (isScrubbing) return;
        isScrubbing = true;
        resumeAfterScrub = isPlaying;
        setPlaying(false);
    }

    function finishScrub() {
        if (!isScrubbing) return;
        isScrubbing = false;
        if (resumeAfterScrub && currentTime < TOTAL_DURATION) setPlaying(true);
        resumeAfterScrub = false;
    }

    openButtons.forEach(button => button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openGuide(button);
    }));
    closeButton.addEventListener('click', closeGuide);
    playButton.addEventListener('click', () => setPlaying(!isPlaying));
    previousButton.addEventListener('click', () => seekToChapter(activeChapter - 1, true));
    nextButton.addEventListener('click', () => seekToChapter(activeChapter + 1, true));
    stepButtons.forEach((button, index) => button.addEventListener('click', () => seekToChapter(index, false)));
    markerButtons.forEach(button => button.addEventListener('click', () => seekTo(Number(button.dataset.manualMarker), { force: true })));
    seekInput.addEventListener('pointerdown', beginScrub);
    seekInput.addEventListener('touchstart', beginScrub, { passive: true });
    seekInput.addEventListener('input', () => {
        if (!isScrubbing) beginScrub();
        seekTo(Number(seekInput.value), { force: true });
    });
    seekInput.addEventListener('change', finishScrub);
    window.addEventListener('pointerup', finishScrub);
    window.addEventListener('pointercancel', finishScrub);

    modal.addEventListener('click', event => {
        if (event.target === modal) closeGuide();
    });

    frame.addEventListener('load', finishFrameReady);
    window.addEventListener('message', event => {
        if (event.origin === window.location.origin && event.source === frame.contentWindow
            && event.data?.type === 'inorobot:model-manual-ready') finishFrameReady();
    });

    document.addEventListener('keydown', event => {
        if (!isOpen()) return;
        const interactive = event.target instanceof Element
            && Boolean(event.target.closest('button, a, input, select, textarea'));
        if (event.key === 'Escape') {
            event.preventDefault();
            closeGuide();
        } else if (event.key === 'Tab') {
            trapFocus(event);
        } else if (!interactive && event.key === 'ArrowLeft') {
            event.preventDefault();
            seekToChapter(activeChapter - 1, true);
        } else if (!interactive && event.key === 'ArrowRight') {
            event.preventDefault();
            seekToChapter(activeChapter + 1, true);
        } else if (!interactive && event.code === 'Space') {
            event.preventDefault();
            setPlaying(!isPlaying);
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (!isOpen() || !isPlaying) return;
        if (document.hidden) {
            stopAnimationFrame();
            cancelCameraTransition();
            getFrameApi()?.setPaused(true);
        } else {
            getFrameApi()?.setPaused(false);
            startAnimationFrame();
        }
    });

    document.addEventListener('inorobot:languagechange', () => {
        if (!frameReady) return;
        syncFrameLocale();
        activeCue = '';
        getFrameApi()?.resetTimeline?.();
        renderAt(currentTime, true);
    });

    reducedMotion.addEventListener?.('change', event => {
        if (event.matches) cancelCameraTransition();
        if (event.matches && isOpen()) setPlaying(false);
    });

    if ('ResizeObserver' in window) new ResizeObserver(() => fitFrame({ snap: true })).observe(frameStage);
    else window.addEventListener('resize', () => fitFrame({ snap: true }));

    renderAt(0, true);
    updatePlaybackUi();
    window.InoRobotManualGuide = Object.freeze({
        open: () => openGuide(openButtons[0]),
        close: closeGuide,
        play: () => setPlaying(true),
        pause: () => setPlaying(false),
        seekTo,
        goToStep: index => seekToChapter(index, false),
        getState: () => ({
            open: isOpen(),
            activeStep: activeChapter,
            currentTime,
            duration: TOTAL_DURATION,
            playing: isPlaying,
            ended: currentTime >= TOTAL_DURATION,
            frameReady,
            frameFailed
        })
    });
})();
