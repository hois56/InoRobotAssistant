(function () {
    'use strict';

    const FRAME_WIDTH = 1200;
    const FRAME_HEIGHT = 720;
    const FRAME_TIMEOUT = 35000;
    const CAMERA_TRANSITION_DURATION = 680;
    const CONFIGS = {
        simulation: {
            title: '3D Simulation 사용 가이드',
            description: '실제 3D Simulation 화면에서 로봇 생성, JOG, Test 모델 배치, 스냅 이동과 반복 운전을 확인하세요.',
            path: '/2_3DSimulation/', duration: 75000,
            chapters: [
                [0, '로봇 모델을 생성하세요', '모델 선택 메뉴에서 IR-S4 로봇을 선택하고 실제 3D 모델이 생성되는 과정을 확인합니다.'],
                [10000, 'JOG로 로봇을 움직이세요', '관절 JOG 값을 움직이면 실제 로봇 자세와 좌표가 함께 변경됩니다.'],
                [20000, 'Test 모델을 배치하세요', 'Test 버튼과 확인 버튼을 눌러 설비 CAD와 진공 Tool을 실제 장면에 배치합니다.'],
                [34000, '스냅 위치로 이동하세요', 'JOG Panel을 열고 스냅 이동 버튼을 누른 뒤 CAD 면의 스냅점을 선택해 로봇을 해당 위치로 이동합니다.'],
                [47000, '두 위치를 티칭하고 반복하세요', 'P[0]과 P[1]을 티칭하고 Repeat와 Run을 누른 뒤 패널을 닫아 로봇의 자동 반복 동작을 확인합니다.']
            ],
            cues: [
                [0, 'simulation_reset'], [800, 'simulation_model_focus'], [2200, 'simulation_model_press'], [3800, 'simulation_model_loading'], [7200, 'simulation_model_loaded'],
                [10000, 'simulation_jog_focus'], [13000, 'simulation_jog_move'], [16000, 'simulation_jog_done'],
                [20000, 'simulation_test_focus'], [21500, 'simulation_test_press'], [22600, 'simulation_test_dialog'],
                [23400, 'simulation_test_confirm_focus'], [24200, 'simulation_test_confirm_press'], [25200, 'simulation_test_loading'], [30500, 'simulation_test_ready'],
                [34000, 'simulation_snap_panel'], [34700, 'simulation_snap_focus'], [35500, 'simulation_snap_press'], [36300, 'simulation_snap_active'],
                [37000, 'simulation_snap_face_focus'], [37700, 'simulation_snap_face_press'], [38400, 'simulation_snap_face_selected'],
                [39100, 'simulation_snap_target_focus'], [39800, 'simulation_snap_target_press'], [40500, 'simulation_snap_target_selected'],
                [41500, 'simulation_snap_move'], [44500, 'simulation_snap_done'],
                [47000, 'simulation_program_focus'], [47700, 'simulation_program_launcher_press'], [48500, 'simulation_program_open'],
                [49500, 'simulation_program_pose_a'], [51000, 'simulation_program_teach_a_focus'], [51600, 'simulation_program_teach_a_press'], [52300, 'simulation_program_teach_a_done'],
                [53100, 'simulation_program_pose_b'], [54500, 'simulation_program_teach_b_focus'], [55100, 'simulation_program_teach_b_press'], [55800, 'simulation_program_teach_b_done'],
                [56600, 'simulation_program_repeat_focus'], [57300, 'simulation_program_repeat_press'], [58000, 'simulation_program_repeat_done'],
                [58800, 'simulation_program_run_focus'], [59500, 'simulation_program_run_press'], [60200, 'simulation_program_run_started'], [61500, 'simulation_program_running'],
                [63800, 'simulation_program_close_focus'], [64500, 'simulation_program_close_press'], [65200, 'simulation_program_close_done'],
                [66000, 'simulation_jog_close_focus'], [66700, 'simulation_jog_close_press'], [67400, 'simulation_jog_close_done'],
                [68500, 'simulation_full_view_running']
            ]
        },
        tool: {
            title: 'Tool Selector 사용 가이드',
            description: '실제 Tool Selector 화면에서 모델 선택, 부하 입력과 적합성 계산 흐름을 확인하세요.',
            path: '/3_ToolSelector/', duration: 40000,
            chapters: [
                [0, '로봇 모델을 선택하세요', '모델과 J5 끝단 플랜지 거리를 설정합니다.'],
                [7000, '부하 조건을 입력하세요', '질량, 무게중심 거리와 관성값을 입력합니다.'],
                [23000, '계산 결과를 확인하세요', '계산하기를 눌러 적합성 및 여유율을 확인합니다.']
            ],
            cues: [
                [0, 'tool_reset'], [900, 'tool_model_focus'], [2400, 'tool_model_select'],
                [7000, 'tool_mass_focus'], [8500, 'tool_mass_value'], [11000, 'tool_distance_focus'], [13000, 'tool_distance_value'],
                [16000, 'tool_inertia_focus'], [19000, 'tool_inertia_value'], [23000, 'tool_calculate_focus'], [24800, 'tool_calculate_press'],
                [27500, 'tool_result'], [32000, 'tool_overall']
            ]
        },
        project: {
            title: 'Project Generator 사용 가이드',
            description: '실제 Project Generator 화면에서 로봇, 공정, 옵션을 선택하고 프로젝트를 생성하세요.',
            path: '/4_ProjectGenerator/', duration: 42000,
            chapters: [
                [0, '로봇 모델을 선택하세요', '프로젝트 이름과 사용할 로봇 모델을 먼저 선택합니다.'],
                [9000, '공정 단계를 구성하세요', 'Processes에서 필요한 작업 단계를 추가하고 순서를 정리합니다.'],
                [22000, '프로그램 옵션을 적용하세요', '옵션 버튼에서 생성할 프로그램 기능을 선택합니다.'],
                [33000, '프로젝트를 생성하세요', 'Generate를 눌러 컨트롤러용 프로젝트 구조를 만듭니다.']
            ],
            cues: [
                [0, 'project_reset'], [800, 'project_name_focus'], [1900, 'project_name_value'], [3800, 'project_model_focus'], [5500, 'project_model_select'],
                [9000, 'project_process_focus'], [10800, 'project_process_add'], [14000, 'project_process_configure'], [18000, 'project_preview'],
                [22000, 'project_options_focus'], [23800, 'project_options_open'], [26500, 'project_option_speed'], [30000, 'project_options_apply'],
                [33000, 'project_generate_focus'], [35000, 'project_generate_press'], [37500, 'project_generate_done']
            ]
        },
        document: {
            title: 'Document 사용 가이드',
            description: '실제 Document 화면에서 검색·필터로 필요한 매뉴얼을 찾고 내려받는 흐름을 확인하세요.',
            path: '/6_Document/', duration: 38000,
            chapters: [
                [0, '문서 종류를 선택하세요', '모델, 컨트롤러와 문서 유형 필터를 선택합니다.'],
                [8000, '키워드로 검색하세요', 'SCARA, 설치, 통신 같은 키워드로 목록을 줄입니다.'],
                [18000, '문서를 열거나 내려받으세요', '필요한 문서 카드의 보기 또는 다운로드 버튼을 사용합니다.']
            ],
            cues: [
                [0, 'document_reset'], [900, 'document_type_focus'], [2600, 'document_type_select'],
                [8000, 'document_search_focus'], [9800, 'document_search_type'], [13000, 'document_results'], [15500, 'document_card_focus'],
                [18000, 'document_view_focus'], [19800, 'document_view_press'], [22000, 'document_preview'],
                [26000, 'document_preview_close_focus'], [27500, 'document_preview_close_press'],
                [29000, 'document_download_focus'], [31000, 'document_download_press'], [33500, 'document_download_done']
            ]
        }
    };

    const modal = document.getElementById('tool-guide-modal');
    const dialog = modal?.querySelector(':scope > .manual-guide-dialog');
    const openButtons = Array.from(document.querySelectorAll('[data-tool-guide]'));
    const closeButton = modal?.querySelector('[data-tool-guide-close]');
    const stepsNav = modal?.querySelector('[data-tool-guide-steps]');
    const markers = modal?.querySelector('[data-tool-guide-markers]');
    const previousButton = modal?.querySelector('[data-tool-guide-previous]');
    const nextButton = modal?.querySelector('[data-tool-guide-next]');
    const playButton = modal?.querySelector('[data-tool-guide-play]');
    const seekInput = modal?.querySelector('[data-tool-guide-seek]');
    const timeOutput = modal?.querySelector('[data-tool-guide-time]');
    const captionTitle = modal?.querySelector('[data-tool-guide-caption-title]');
    const captionCopy = modal?.querySelector('[data-tool-guide-caption-copy]');
    const status = modal?.querySelector('[data-tool-guide-status]');
    const frame = modal?.querySelector('#tool-guide-frame');
    const frameStage = modal?.querySelector('[data-tool-guide-stage]');
    const frameCanvas = modal?.querySelector('[data-tool-guide-canvas]');
    const frameLoading = modal?.querySelector('[data-tool-guide-loading]');
    const frameError = modal?.querySelector('[data-tool-guide-error]');
    const retryButton = modal?.querySelector('[data-tool-guide-retry]');
    const launch = modal?.querySelector('[data-tool-guide-launch]');
    const title = modal?.querySelector('[data-tool-guide-title]');
    const kicker = modal?.querySelector('[data-tool-guide-kicker]');
    const pauseIcon = modal?.querySelector('[data-tool-guide-pause-icon]');
    const playIcon = modal?.querySelector('[data-tool-guide-play-icon]');
    const replayIcon = modal?.querySelector('[data-tool-guide-replay-icon]');
    const pauseLabel = modal?.querySelector('[data-tool-guide-pause-label]');
    const playLabel = modal?.querySelector('[data-tool-guide-play-label]');
    const replayLabel = modal?.querySelector('[data-tool-guide-replay-label]');
    const languageSwitcher = document.getElementById('inorobot-language-switcher');
    if (!modal || !dialog || !openButtons.length || !closeButton || !stepsNav || !markers || !previousButton
        || !nextButton || !playButton || !seekInput || !timeOutput || !captionTitle || !captionCopy || !status
        || !frame || !frameStage || !frameCanvas || !frameLoading || !frameError || !retryButton || !launch
        || !title || !kicker || !pauseIcon || !playIcon || !replayIcon
        || !pauseLabel || !playLabel || !replayLabel) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let config = null;
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
    let framePreparing = false;
    let loadedPath = '';
    let frameTimeout = null;
    let framePoll = null;
    let isScrubbing = false;
    let resumeAfterScrub = false;
    let cameraTransitionTimer = null;

    const translate = source => window.InoRobotI18n?.translate(source) || source;
    const isOpen = () => modal.classList.contains('is-open');
    const getFrameApi = () => { try { return frame.contentWindow?.InoRobotToolManual || null; } catch { return null; } };
    const formatTime = milliseconds => {
        const seconds = Math.floor(Math.max(0, Math.min(config?.duration || 0, milliseconds)) / 1000);
        return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    };

    function getChapterAt(time) {
        let chapter = 0;
        config.chapters.forEach((item, index) => { if (time >= item[0]) chapter = index; });
        return chapter;
    }

    function getCueAt(time) {
        let cue = config.cues[0][1];
        for (const candidate of config.cues) {
            if (candidate[0] > time) break;
            cue = candidate[1];
        }
        return cue;
    }

    function renderSteps() {
        stepsNav.replaceChildren();
        markers.replaceChildren();
        config.chapters.forEach((chapter, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'manual-step-button';
            button.dataset.toolStep = String(index);
            button.innerHTML = `<span class="manual-step-number">${String(index + 1).padStart(2, '0')}</span><span class="manual-step-copy"><strong></strong><small></small></span>`;
            button.querySelector('strong').textContent = translate(chapter[1]);
            button.querySelector('small').textContent = translate(chapter[2]);
            button.addEventListener('click', () => seekToChapter(index, true));
            stepsNav.appendChild(button);

            const marker = document.createElement('button');
            marker.type = 'button';
            marker.dataset.toolMarker = String(chapter[0]);
            marker.style.setProperty('--manual-marker-position', `${chapter[0] / config.duration * 100}%`);
            marker.setAttribute('aria-label', `${translate(chapter[1])} ${translate('단계로 이동')}`);
            marker.innerHTML = `<span aria-hidden="true">${translate(chapter[1]).split(' ')[0]}</span>`;
            marker.addEventListener('click', () => seekTo(chapter[0], { force: true }));
            markers.appendChild(marker);
        });
    }

    function updateChapterUi(chapter, announce) {
        const changed = chapter !== activeChapter;
        activeChapter = chapter;
        Array.from(stepsNav.children).forEach((button, index) => {
            button.classList.toggle('is-active', index === chapter);
            if (index === chapter) button.setAttribute('aria-current', 'step');
            else button.removeAttribute('aria-current');
        });
        Array.from(markers.children).forEach((button, index) => button.classList.toggle('is-active', index === chapter));
        if (changed && frameStage.clientWidth <= 820) {
            const activeStep = stepsNav.children[chapter];
            if (activeStep) {
                const left = activeStep.offsetLeft - Math.max(0, (stepsNav.clientWidth - activeStep.offsetWidth) / 2);
                stepsNav.scrollTo({ left: Math.max(0, left), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
            }
        }
        previousButton.disabled = chapter === 0;
        nextButton.disabled = chapter === config.chapters.length - 1;
        if (announce && changed) status.textContent = `${chapter + 1} / ${config.chapters.length}. ${translate(config.chapters[chapter][1])}`;
    }

    function updateTimelineUi() {
        const progress = currentTime / config.duration;
        seekInput.value = String(Math.round(currentTime));
        seekInput.style.setProperty('--manual-progress', `${progress * 100}%`);
        const value = `${formatTime(currentTime)} / ${formatTime(config.duration)}`;
        timeOutput.value = value;
        timeOutput.textContent = value;
        const chapter = config.chapters[getChapterAt(currentTime)];
        seekInput.setAttribute('aria-valuetext', `${value}, ${translate(chapter[1])}`);
        captionTitle.textContent = translate(chapter[1]);
        captionCopy.textContent = translate(chapter[2]);
    }

    function updatePlaybackUi() {
        const ended = currentTime >= config.duration;
        pauseIcon.hidden = !isPlaying;
        playIcon.hidden = isPlaying || ended;
        replayIcon.hidden = isPlaying || !ended;
        playButton.setAttribute('aria-pressed', String(isPlaying));
        const label = isPlaying ? pauseLabel : ended ? replayLabel : playLabel;
        playButton.setAttribute('aria-label', translate(label.textContent.trim()));
        modal.classList.toggle('is-paused', !isPlaying);
        modal.classList.toggle('is-ended', ended);
        getFrameApi()?.setPaused(!isPlaying);
    }

    function cancelCameraTransition() {
        if (cameraTransitionTimer !== null) clearTimeout(cameraTransitionTimer);
        cameraTransitionTimer = null;
        frameCanvas.classList.remove('is-camera-animating');
        frameCanvas.getAnimations?.().forEach(animation => {
            if (animation.transitionProperty === 'transform') animation.cancel();
        });
    }

    function beginCameraTransition() {
        if (!isPlaying || isScrubbing || reducedMotion.matches || config?.key === 'simulation') return false;
        if (cameraTransitionTimer !== null) clearTimeout(cameraTransitionTimer);
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
        if (options.animate) beginCameraTransition();
        const fittedScale = Math.min(frameStage.clientWidth / FRAME_WIDTH, frameStage.clientHeight / FRAME_HEIGHT);
        const simulation = config?.key === 'simulation';
        const compact = frameStage.clientWidth <= 520;
        const preferredScale = compact ? .52 : .68;
        const scale = simulation
            ? fittedScale
            : Math.max(fittedScale, Math.min(preferredScale, frameStage.clientWidth / FRAME_WIDTH));
        const focus = getFrameApi()?.getFocusPoint?.();
        const focusX = Number.isFinite(focus?.x) ? focus.x : FRAME_WIDTH / 2;
        const scaledWidth = FRAME_WIDTH * scale;
        const scaledHeight = FRAME_HEIGHT * scale;
        const minLeft = Math.min(0, frameStage.clientWidth - scaledWidth);
        const minTop = Math.min(0, frameStage.clientHeight - scaledHeight);
        const left = simulation
            ? Math.max(0, (frameStage.clientWidth - scaledWidth) / 2)
            : compact ? Math.max(minLeft, Math.min(0, frameStage.clientWidth / 2 - focusX * scale)) : Math.max(0, (frameStage.clientWidth - scaledWidth) / 2);
        // The embedded page owns vertical smooth scrolling. Keeping the
        // outer crop centered prevents a second, lagging Y movement.
        const top = scaledHeight > frameStage.clientHeight
            ? minTop / 2
            : Math.max(0, (frameStage.clientHeight - scaledHeight) / 2);
        const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
        const stableLeft = Math.round(left * pixelRatio) / pixelRatio;
        const stableTop = Math.round(top * pixelRatio) / pixelRatio;
        const transform = `translate3d(${stableLeft}px, ${stableTop}px, 0) scale(${scale})`;
        if (frameCanvas.style.transform !== transform) frameCanvas.style.transform = transform;
    }

    function stopAnimationFrame() {
        if (animationFrame !== null) cancelAnimationFrame(animationFrame);
        animationFrame = null;
        lastTick = 0;
    }

    function clearFrameWaiters() {
        if (frameTimeout !== null) clearTimeout(frameTimeout);
        if (framePoll !== null) clearInterval(framePoll);
        frameTimeout = null;
        framePoll = null;
    }

    function markFrameFailed() {
        if (!isOpen() || frameReady) return;
        clearFrameWaiters();
        frameFailed = true;
        frameLoading.hidden = true;
        frameError.hidden = false;
        setPlaying(false);
    }

    async function finishFrameReady() {
        const api = getFrameApi();
        if (!api || api.app !== config?.key || framePreparing || frameReady) return false;
        framePreparing = true;
        clearFrameWaiters();
        try {
            await api.prepare();
        } catch {
            framePreparing = false;
            markFrameFailed();
            return false;
        }
        framePreparing = false;
        frameReady = true;
        frameFailed = false;
        frameLoading.hidden = true;
        frameError.hidden = true;
        frameStage.classList.add('is-ready');
        activeCue = '';
        renderAt(currentTime, true);
        requestAnimationFrame(() => requestAnimationFrame(() => fitFrame({ snap: true })));
        if (!reducedMotion.matches && isOpen()) setPlaying(true);
        return true;
    }

    function ensureFrame() {
        if (frameStarted && loadedPath === config.path && !frameFailed) {
            if (frameReady) { renderAt(currentTime, true); if (!reducedMotion.matches) setPlaying(true); }
            return;
        }
        clearFrameWaiters();
        frameStarted = true;
        frameReady = false;
        frameFailed = false;
        framePreparing = false;
        loadedPath = config.path;
        frameStage.classList.remove('is-ready');
        frameLoading.hidden = false;
        frameError.hidden = true;
        frame.src = `${config.path}?embed=manual-guide`;
        frame.addEventListener('load', () => { void finishFrameReady(); }, { once: true });
        framePoll = window.setInterval(() => { void finishFrameReady(); }, 150);
        frameTimeout = window.setTimeout(markFrameFailed, FRAME_TIMEOUT);
    }

    function renderAt(time, force) {
        currentTime = Math.max(0, Math.min(config.duration, Number(time) || 0));
        const chapter = getChapterAt(currentTime);
        const cue = getCueAt(currentTime);
        updateChapterUi(chapter, !force);
        updateTimelineUi();
        const api = getFrameApi();
        if (frameReady && api && (force || cue !== activeCue)) {
            activeCue = cue;
            api.renderTimelineCue(cue);
            const animateCamera = isPlaying && !isScrubbing && !force
                && !reducedMotion.matches && config.key !== 'simulation';
            requestAnimationFrame(() => requestAnimationFrame(() => fitFrame({
                animate: animateCamera,
                snap: !animateCamera
            })));
        }
        if (frameReady && api) api.setTimelineTime?.(currentTime);
        updatePlaybackUi();
    }

    function tick(timestamp) {
        animationFrame = null;
        if (!isPlaying || !isOpen() || !frameReady || document.hidden) return;
        if (!lastTick) lastTick = timestamp;
        const delta = Math.min(100, timestamp - lastTick);
        lastTick = timestamp;
        renderAt(currentTime + delta, false);
        if (currentTime >= config.duration) {
            setPlaying(false);
            status.textContent = translate('가이드 재생이 완료되었습니다.');
            return;
        }
        animationFrame = requestAnimationFrame(tick);
    }

    function startAnimationFrame() {
        if (animationFrame !== null || !isPlaying || !frameReady || !isOpen() || document.hidden) return;
        lastTick = 0;
        animationFrame = requestAnimationFrame(tick);
    }

    function setPlaying(nextPlaying, replay = false) {
        if (nextPlaying && currentTime >= config.duration) {
            if (!replay) return;
            activeCue = '';
            getFrameApi()?.resetTimeline?.();
            renderAt(0, true);
        }
        isPlaying = Boolean(nextPlaying);
        if (isPlaying) startAnimationFrame();
        else {
            stopAnimationFrame();
            cancelCameraTransition();
        }
        updatePlaybackUi();
    }

    function seekTo(time, options = {}) {
        if (options.force) activeCue = '';
        renderAt(time, Boolean(options.force));
        lastTick = 0;
    }

    function seekToChapter(index, focusStep) {
        const target = Math.max(0, Math.min(config.chapters.length - 1, Number(index) || 0));
        seekTo(config.chapters[target][0], { force: true });
        if (focusStep) stepsNav.children[target]?.focus({ preventScroll: true });
    }

    function setBackgroundInert(nextInert) {
        if (nextInert) {
            inertState = Array.from(document.body.children)
                .filter(element => element !== modal && element.tagName !== 'SCRIPT' && element.tagName !== 'STYLE')
                .map(element => ({ element, inert: element.inert }));
            inertState.forEach(({ element }) => { element.inert = true; });
            return;
        }
        inertState.forEach(({ element, inert }) => { element.inert = inert; });
        inertState = [];
    }

    function openGuide(trigger) {
        config = { ...CONFIGS[trigger.dataset.toolGuide], key: trigger.dataset.toolGuide };
        if (!config.path) return;
        modal.dataset.activeToolGuide = config.key;
        lastFocusedElement = trigger;
        previousBodyOverflow = document.body.style.overflow;
        previousLanguageSwitcherVisibility = languageSwitcher?.style.visibility || '';
        if (languageSwitcher) languageSwitcher.style.visibility = 'hidden';
        title.textContent = translate(config.title);
        kicker.textContent = translate(`빠른 사용 가이드 · 약 ${Math.round(config.duration / 1000)}초`);
        launch.href = config.path;
        seekInput.max = String(config.duration);
        modal.classList.add('is-open', 'is-paused');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        setBackgroundInert(true);
        openButtons.forEach(button => button.setAttribute('aria-expanded', String(button === trigger)));
        renderSteps();
        currentTime = 0;
        activeChapter = 0;
        activeCue = '';
        isPlaying = false;
        renderAt(0, true);
        ensureFrame();
        closeButton.focus({ preventScroll: true });
    }

    function closeGuide() {
        setPlaying(false);
        clearFrameWaiters();
        getFrameApi()?.resetTimeline?.();
        modal.classList.remove('is-open', 'is-paused', 'is-ended');
        delete modal.dataset.activeToolGuide;
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = previousBodyOverflow;
        if (languageSwitcher) languageSwitcher.style.visibility = previousLanguageSwitcherVisibility;
        setBackgroundInert(false);
        openButtons.forEach(button => button.setAttribute('aria-expanded', 'false'));
        if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus({ preventScroll: true });
    }

    function getFocusableElements() {
        return Array.from(dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled])')).filter(element => element.offsetParent !== null);
    }

    function trapFocus(event) {
        const focusable = getFocusableElements();
        if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
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
        const shouldResume = resumeAfterScrub && currentTime < config.duration;
        resumeAfterScrub = false;
        if (shouldResume) setPlaying(true);
    }

    openButtons.forEach(button => button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); openGuide(button); }));
    closeButton.addEventListener('click', closeGuide);
    playButton.addEventListener('click', () => setPlaying(!isPlaying, true));
    previousButton.addEventListener('click', () => seekToChapter(activeChapter - 1, true));
    nextButton.addEventListener('click', () => seekToChapter(activeChapter + 1, true));
    Array.from(['pointerdown', 'touchstart', 'mousedown']).forEach(type => seekInput.addEventListener(type, beginScrub, { passive: true }));
    seekInput.addEventListener('input', () => { if (!isScrubbing) beginScrub(); seekTo(Number(seekInput.value), { force: true }); });
    Array.from(['pointerup', 'touchend', 'mouseup', 'change']).forEach(type => seekInput.addEventListener(type, finishScrub));
    retryButton.addEventListener('click', () => { frameStarted = false; ensureFrame(); });
    modal.addEventListener('click', event => { if (event.target === modal) closeGuide(); });
    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); closeGuide(); return; }
        if (event.key === 'Tab') { trapFocus(event); return; }
        if (event.target === seekInput) return;
        if (event.key === 'ArrowLeft') { event.preventDefault(); seekToChapter(activeChapter - 1, false); }
        if (event.key === 'ArrowRight') { event.preventDefault(); seekToChapter(activeChapter + 1, false); }
        if (event.key === ' ') { event.preventDefault(); setPlaying(!isPlaying, true); }
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopAnimationFrame();
            cancelCameraTransition();
            getFrameApi()?.setPaused(true);
            return;
        }
        getFrameApi()?.setPaused(!isPlaying);
        startAnimationFrame();
    });
    document.addEventListener('inorobot:languagechange', () => {
        if (!config || !isOpen()) return;
        title.textContent = translate(config.title);
        renderSteps();
        renderAt(currentTime, true);
    });
    reducedMotion.addEventListener?.('change', () => {
        if (reducedMotion.matches) {
            cancelCameraTransition();
            setPlaying(false);
        }
    });
    if ('ResizeObserver' in window) new ResizeObserver(() => fitFrame({ snap: true })).observe(frameStage);
    else window.addEventListener('resize', () => fitFrame({ snap: true }));

    window.ToolGuide = Object.freeze({
        open: key => { const trigger = openButtons.find(button => button.dataset.toolGuide === key); if (trigger) openGuide(trigger); },
        close: closeGuide,
        play: () => setPlaying(true, true),
        pause: () => setPlaying(false),
        seekTo: time => seekTo(time, { force: true }),
        goToStep: index => seekToChapter(index, false),
        getState: () => ({ key: config?.key || '', currentTime, activeChapter, activeCue, isPlaying, frameReady, frameFailed, child: getFrameApi()?.getState?.() || null })
    });
    window.dispatchEvent(new CustomEvent('inorobot:toolguideready'));
}());
