(function () {
    'use strict';

    // Home "사용 방법" player. It plays the real tool page in an iframe and narrates it step by step:
    // the caption says what to do and why, the stage zooms to the part being used, everything
    // else is dimmed, and a numbered label points at it. 0_Home/tool-guide-embed.js runs inside
    // the iframe and performs each step; step ids here must match the ids there.
    const FRAME_WIDTH = 1200;
    const FRAME_HEIGHT = 720;
    // On a wide but short stage the page gets a shorter window (it scrolls, like a smaller browser)
    // instead of a smaller picture, down to this height.
    const MIN_FRAME_HEIGHT = 520;
    const FRAME_TIMEOUT = 35000;
    const CAMERA_TRANSITION_DURATION = 680;
    // The page is shown at least this large when the stage allows it.
    const READABLE_SCALE = 0.8;
    // Below this size the page is too small to follow (phones), so the stage zooms to each step instead.
    const MIN_STILL_SCALE = 0.55;
    // The lit area slides to a new target, and the label to a new side, over this time.
    const FOCUS_MORPH_MS = 320;
    // A lit target that disappears for less than this (one window closing as the next opens) keeps
    // its highlight instead of blinking.
    const LIT_GRACE_MS = 300;
    // Each step is [id, length in ms, title, detail]; each chapter starts at the step it names.
    // Step lengths end shortly after the step's action finishes (see 0_Home/tool-guide-embed.js).
    const SOURCES = {
        model: {
            title: 'Robot Model Select 사용 가이드',
            path: '/1_RobotModelSelect/', query: '?embed=manual',
            chapters: [
                ['model_type', '필요한 사양을 선택하세요', '로봇 유형, 가반하중, 리치 등 필요한 조건을 필터에서 선택합니다.'],
                ['model_open', '모델을 선택하고 옵션을 구성하세요', '모델 카드를 선택해 상세 구성 화면을 열고 케이블, 티치펜던트와 통신 옵션을 구성합니다.'],
                ['model_cad', '파일을 내려받고 구성 내역을 확인하세요', 'CAD를 내려받고 구성을 담은 다음, 구성 목록에서 엑셀을 내려받아 모델과 옵션을 확인합니다.']
            ],
            steps: [
                ['model_type', 2200, '로봇 타입 선택', '6-Axis 또는 SCARA를 누르면 해당 타입의 모델만 남습니다.'],
                ['model_payload', 2200, '가반 하중 선택', 'Tool과 공작물을 합친 무게보다 큰 가반 하중을 고릅니다.'],
                ['model_reach', 2200, '리치 선택', '작업 범위에 맞는 팔 길이(리치)를 고릅니다.'],
                ['model_result', 2600, '조건에 맞는 모델', '선택한 조건을 모두 만족하는 모델만 카드로 표시됩니다.'],
                ['model_open', 2400, '모델 상세 열기', '카드를 누르면 사양과 구성 선택 화면이 열립니다.'],
                ['model_cable', 2200, '케이블 종류', '로봇이 움직일 때 케이블도 함께 휘는 설치라면 가동형을 고릅니다.'],
                ['model_pendant', 2200, '티치 펜던트', '필요하면 티치 펜던트와 비상 정지 보호 커버 여부를 고릅니다.'],
                ['model_comm', 2800, '통신 카드', 'PLC 등과 PROFINET으로 연결하려면 통신 카드를 추가합니다.'],
                ['model_code', 3400, '구매 코드 확인', '선택한 구성에 맞춰 구매 코드가 자동으로 바뀝니다. 주문할 때 이 코드를 사용합니다.'],
                ['model_cad', 2400, 'CAD 다운로드', '설비 설계에 쓸 로봇 2D·3D CAD 파일을 내려받습니다.'],
                ['model_add_cart', 2200, '구성 담기', '선택한 모델과 옵션을 구성 목록에 담습니다.'],
                ['model_excel', 2400, '구성 목록에서 엑셀 다운로드', '구성 목록의 품목과 코드를 엑셀 파일로 내려받습니다.'],
                ['model_preview', 3400, '구성 내역 확인', '엑셀에서 제품 정보와 선택한 옵션이 정리된 것을 확인합니다.']
            ]
        },
        simulation: {
            title: '3D Simulation 사용 가이드',
            path: '/2_3DSimulation/',
            chapters: [
                ['sim_model', '로봇 모델을 생성하세요', '모델 선택 메뉴에서 IR-S4 로봇을 선택하고 실제 3D 모델이 생성되는 과정을 확인합니다.'],
                ['sim_jog_open', 'JOG로 로봇을 움직이세요', '관절 JOG 값을 움직이면 실제 로봇 자세와 좌표가 함께 변경됩니다.'],
                ['sim_test_open', 'Test 모델을 배치하세요', 'Test 버튼과 확인 버튼을 눌러 설비 CAD와 진공 Tool을 실제 장면에 배치합니다.'],
                ['sim_snap_button', '스냅 위치로 이동하세요', 'JOG Panel을 열고 스냅 이동 버튼을 누른 뒤 CAD 면의 스냅점을 선택해 로봇을 해당 위치로 이동합니다.'],
                ['sim_program_open', '두 위치를 티칭하고 반복하세요', 'P[0]과 P[1]을 티칭하고 Repeat와 Run을 누른 뒤 패널을 닫아 로봇의 자동 반복 동작을 확인합니다.']
            ],
            steps: [
                ['sim_model', 4800, '사용할 로봇 선택', '상단 목록에서 로봇을 고르면 3D 화면에 해당 로봇이 만들어집니다.'],
                ['sim_view', 3000, '3D 화면 보기', '마우스로 화면을 돌리고 확대·축소해 원하는 방향에서 로봇을 봅니다.'],
                ['sim_jog_open', 2400, 'JOG 패널 열기', 'JOG 버튼을 누르면 로봇 축을 움직이는 패널이 열립니다.'],
                ['sim_jog_move', 3600, '관절 움직이기', '슬라이더를 끌면 해당 관절이 회전하고 끝점 좌표도 함께 바뀝니다.'],
                ['sim_test_open', 2400, 'Test 모델 불러오기', 'Test 버튼을 누르면 연습용 설비와 Tool을 고르는 창이 열립니다.'],
                ['sim_test_import', 4400, '일괄 가져오기', '모델과 수량을 정한 뒤 일괄 가져오기를 누르면 설비와 Tool이 배치됩니다.'],
                ['sim_test_tree', 3000, '모델 트리', '불러온 설비와 Tool이 목록에 표시되며, 선택해 위치를 바꿀 수 있습니다.'],
                ['sim_snap_button', 2400, '스냅 이동', 'CAD의 꼭짓점·중심 같은 정확한 위치로 로봇 끝점을 보내는 기능입니다.'],
                ['sim_snap_face', 2600, '면 선택', '이동할 위치가 있는 CAD 면을 클릭하면 선택할 수 있는 점이 표시됩니다.'],
                ['sim_snap_point', 2400, '점 선택', '원하는 점을 클릭해 이동할 목표로 정합니다.'],
                ['sim_snap_move', 3400, '스냅 위치로 이동', '로봇 끝점(TCP)이 선택한 점으로 이동합니다.'],
                ['sim_program_open', 2400, '프로그램 패널 열기', '현재 자세를 위치(P)로 저장하고 순서대로 실행하는 패널입니다.'],
                ['sim_teach_a', 3200, '첫 위치 저장', '로봇을 원하는 자세로 옮긴 뒤 + 버튼을 누르면 P[0]으로 저장됩니다.'],
                ['sim_teach_b', 3200, '두 번째 위치 저장', '다른 자세로 옮겨 한 번 더 누르면 P[1]이 저장됩니다.'],
                ['sim_repeat', 2200, '반복 실행 켜기', '반복을 켜면 저장한 위치를 끝없이 오가며 운전합니다.'],
                ['sim_run', 3000, '실행', '실행 버튼을 누르면 P[0]과 P[1]을 순서대로 움직입니다.'],
                ['sim_watch', 4600, '동작 확인', '패널을 닫으면 반복 동작을 넓은 화면으로 볼 수 있습니다.']
            ]
        },
        tool: {
            title: 'Tool Selector 사용 가이드',
            path: '/3_ToolSelector/',
            // Demonstrates mode D: the load is calculated from the Tool's STEP CAD file.
            chapters: [
                ['tool_mode', 'CAD 파일을 불러오세요', '모드 D에서 Tool의 STEP 파일을 불러옵니다.'],
                ['tool_cad_material', '재질과 좌표를 정하고 계산하세요', '부품 재질과 Tool 원점·TCP를 정한 뒤 질량 특성을 계산합니다.'],
                ['tool_cad_robot', '로봇 적합성을 확인하세요', '비교할 로봇을 골라 허용값 대비 여유율과 최종 판정을 확인합니다.']
            ],
            steps: [
                ['tool_mode', 2400, '모드 D 선택', 'Tool의 STEP CAD 파일이 있으면 모드 D를 고릅니다. 질량·무게중심·관성값을 CAD에서 계산합니다.'],
                ['tool_cad_load', 3600, 'CAD 파일 불러오기', '불러오기를 눌러 Tool의 STEP 파일을 고르면 부품 목록과 3D 모델이 표시됩니다.'],
                ['tool_cad_material', 3000, '부품별 재질 지정', '부품마다 재질을 고르면 밀도가 바뀌어 질량에 반영됩니다. 예시는 공압 피팅을 황동으로 바꿉니다.'],
                ['tool_cad_tcp', 3000, 'Tool 원점과 TCP 설정', 'Tool 원점은 플랜지에 닿는 면, TCP는 흡착 패드 끝처럼 작업하는 점입니다. 값을 입력하거나 점 찍기로 CAD에서 고릅니다.'],
                ['tool_cad_calc', 3200, '질량 특성 계산', '질량 특성 계산을 누르면 Tool 원점 기준 질량·무게중심·관성모멘트가 계산됩니다.'],
                ['tool_cad_robot', 3000, '비교할 로봇 선택', '계산 결과를 비교할 로봇을 고릅니다. 예시는 SCARA S4입니다.'],
                ['tool_cad_judge', 2800, '적합성 판정', '로봇 적합성 판정을 누르면 항목별 계산값과 허용값, 여유율이 표시됩니다.'],
                ['tool_overall', 3000, '최종 판정', '모든 항목이 OK면 적합으로 표시되어 해당 Tool을 설치할 수 있습니다.']
            ]
        },
        project: {
            title: 'Project Generator 사용 가이드',
            path: '/4_ProjectGenerator/',
            chapters: [
                ['project_name', '로봇 모델을 선택하세요', '프로젝트 이름과 사용할 로봇 모델을 먼저 선택합니다.'],
                ['project_row', '공정 단계를 구성하세요', 'Processes에서 필요한 작업 단계를 추가하고 순서를 정리합니다.'],
                ['project_options', '프로그램 옵션을 적용하세요', '옵션 버튼에서 생성할 프로그램 기능을 선택합니다.'],
                ['project_generate', '프로젝트를 생성하세요', 'Generate를 눌러 컨트롤러용 프로젝트 구조를 만듭니다.']
            ],
            steps: [
                ['project_name', 3000, '프로젝트 이름 입력', '입력한 이름이 생성되는 프로젝트와 ZIP 파일 이름이 됩니다.'],
                ['project_model', 3000, '사용할 로봇 선택', '사용할 로봇을 고르면 해당 모델에 맞는 프로그램이 만들어집니다.'],
                ['project_row', 3000, '공정 한 줄 = 작업 하나', '각 줄에서 유형·동작·Tool·비전 보정을 고르며, 위에서부터 순서대로 실행됩니다.'],
                ['project_add', 2400, '공정 추가', '+ 버튼을 누르면 다음 작업 줄이 추가됩니다.'],
                ['project_type', 2800, '유형 선택', 'Stage는 바닥에 진공 패드가 있는 자재 적재·취출 공정입니다.'],
                ['project_method', 2800, '동작 선택', 'Get은 집기, Put은 놓기입니다. 예시는 Tray에서 집어 Stage에 놓는 흐름입니다.'],
                ['project_preview', 3000, '코드 미리보기', '선택을 바꿀 때마다 실제로 생성될 로봇 프로그램이 바로 갱신됩니다.'],
                ['project_options', 2400, '옵션 열기', '옵션 버튼에서 모니터링·티칭 모드 같은 추가 기능을 고릅니다.'],
                ['project_option_pick', 2200, '옵션 선택', '예: TCP 속도 모니터링을 켜면 속도 감시 코드가 함께 생성됩니다.'],
                ['project_apply', 2600, '옵션 적용', '적용을 누르면 옵션이 코드 미리보기에 반영됩니다.'],
                ['project_generate', 3200, '프로젝트 생성', '프로젝트 생성을 누르면 컨트롤러용 프로젝트가 ZIP 파일로 저장됩니다.']
            ]
        },
        document: {
            title: 'Document 사용 가이드',
            path: '/6_Document/',
            chapters: [
                ['doc_section', '문서 종류를 선택하세요', '모델, 컨트롤러와 문서 유형 필터를 선택합니다.'],
                ['doc_search', '키워드로 검색하세요', 'SCARA, 설치, 통신 같은 키워드로 목록을 줄입니다.'],
                ['doc_view', '문서를 열거나 내려받으세요', '필요한 문서 카드의 보기 또는 다운로드 버튼을 사용합니다.']
            ],
            steps: [
                ['doc_section', 2400, '문서 분류 펼치기', '왼쪽 목록에서 하드웨어·소프트웨어 매뉴얼 같은 분류를 펼칩니다.'],
                ['doc_type', 2200, '제품군 선택', '제품군을 누르면 해당 문서만 남습니다. 오른쪽 숫자는 문서 개수입니다.'],
                ['doc_count', 2600, '결과 확인', '조건에 맞는 문서 수와 목록이 바로 바뀝니다.'],
                ['doc_search', 2600, '키워드 검색', '모델명이나 설치·통신 같은 단어를 입력하면 목록을 더 좁힙니다.'],
                ['doc_result', 2800, '찾은 문서', '각 줄에 문서 이름과 언어·제품군·날짜가 표시됩니다.'],
                ['doc_view', 2400, '미리보기', '미리보기를 누르면 PDF가 새 탭에서 열립니다.'],
                ['doc_preview', 3600, '내용 확인', '표지와 목차를 보고 필요한 문서인지 확인합니다.'],
                ['doc_close', 2000, '탭 닫기', '탭을 닫으면 문서 목록으로 돌아옵니다.'],
                ['doc_download', 3000, '다운로드', '다운로드를 누르면 PDF 파일이 바로 저장됩니다.']
            ]
        }
    };

    // Turn step lengths into start times: steps become [at, id, title, detail], chapters [at, title, detail].
    function timeline(source) {
        let at = 0;
        const steps = source.steps.map(([id, length, ...text]) => {
            const step = [at, id, ...text];
            at += length;
            return step;
        });
        const chapters = source.chapters.map(([id, ...text]) => [steps.find(step => step[1] === id)[0], ...text]);
        return { ...source, steps, chapters, duration: at };
    }

    const CONFIGS = Object.fromEntries(Object.entries(SOURCES).map(([key, source]) => [key, timeline(source)]));
    // "About N seconds", rounded to 5 seconds so the label has a fixed translation.
    const roundedSeconds = duration => Math.max(5, Math.round(duration / 5000) * 5);

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
    const caption = modal?.querySelector('.manual-guide-caption');
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
        || !nextButton || !playButton || !seekInput || !timeOutput || !caption || !captionTitle || !captionCopy || !status
        || !frame || !frameStage || !frameCanvas || !frameLoading || !frameError || !retryButton || !launch
        || !title || !kicker || !pauseIcon || !playIcon || !replayIcon
        || !pauseLabel || !playLabel || !replayLabel) return;

    // Stage overlay: a cut-out that dims everything except the step's target, and a numbered label.
    // The dimming is one stage-sized shape with a hole, so moving the hole only redraws the stage.
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const focusBox = document.createElement('div');
    focusBox.className = 'manual-guide-focus';
    focusBox.setAttribute('aria-hidden', 'true');
    const focusSvg = document.createElementNS(SVG_NS, 'svg');
    const focusPath = document.createElementNS(SVG_NS, 'path');
    focusSvg.setAttribute('preserveAspectRatio', 'none');
    focusSvg.appendChild(focusPath);
    focusBox.appendChild(focusSvg);
    const callout = document.createElement('div');
    callout.className = 'manual-guide-callout';
    callout.setAttribute('aria-hidden', 'true');
    callout.innerHTML = '<span class="manual-guide-callout-number"></span><strong></strong>';
    frameStage.insertBefore(callout, frameLoading);
    frameStage.insertBefore(focusBox, callout);
    const captionStep = document.createElement('b');
    captionStep.className = 'manual-guide-caption-step';
    caption.insertBefore(captionStep, captionTitle);
    caption.classList.add('has-step');

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let config = null;
    let currentTime = 0;
    let activeChapter = 0;
    let activeStep = -1;
    let activeCue = '';
    let isPlaying = false;
    let loopFrame = null;
    let lastTick = 0;
    let lastFocusedElement = null;
    let previousBodyOverflow = '';
    let previousLanguageSwitcherVisibility = '';
    let inertState = [];
    let frameStarted = false;
    let frameReady = false;
    let frameFailed = false;
    let framePreparing = false;
    let loadedSource = '';
    let frameTimeout = null;
    let framePoll = null;
    let isScrubbing = false;
    let resumeAfterScrub = false;
    let cameraTransitionTimer = null;
    let camera = null;
    let frameLayout = { height: FRAME_HEIGHT, scale: null };
    let overlayKey = '';
    // The lit area as drawn, the target it belongs to, and its slide from the previous target.
    let shownBox = null;
    let litKey = '';
    let litMorph = null;
    let litMoving = false;
    let litSeen = 0;
    // The label waits for each new step's target to settle, then keeps its side while it can.
    const label = { waiting: true, side: '', left: 0, top: 0, glide: null };

    const translate = source => window.InoRobotI18n?.translate(source) || source;
    const isOpen = () => modal.classList.contains('is-open');
    const getFrameApi = () => { try { return frame.contentWindow?.InoRobotToolManual || null; } catch { return null; } };
    const frameSource = () => `${config.path}${config.query || '?embed=manual-guide'}`;
    const formatTime = milliseconds => {
        const seconds = Math.floor(Math.max(0, Math.min(config?.duration || 0, milliseconds)) / 1000);
        return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    };

    function indexAt(list, time) {
        let index = 0;
        list.forEach((item, position) => { if (time >= item[0]) index = position; });
        return index;
    }

    function renderChapters() {
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
            const label = document.createElement('span');
            label.setAttribute('aria-hidden', 'true');
            label.textContent = String(index + 1).padStart(2, '0');
            marker.appendChild(label);
            marker.addEventListener('click', () => seekTo(chapter[0], { force: true }));
            markers.appendChild(marker);
        });
    }

    function updateChapterUi(chapter) {
        const changed = chapter !== activeChapter;
        activeChapter = chapter;
        Array.from(stepsNav.children).forEach((button, index) => {
            button.classList.toggle('is-active', index === chapter);
            if (index === chapter) button.setAttribute('aria-current', 'step');
            else button.removeAttribute('aria-current');
        });
        Array.from(markers.children).forEach((button, index) => button.classList.toggle('is-active', index === chapter));
        if (changed && frameStage.clientWidth <= 820) {
            const activeButton = stepsNav.children[chapter];
            if (activeButton) {
                const left = activeButton.offsetLeft - Math.max(0, (stepsNav.clientWidth - activeButton.offsetWidth) / 2);
                stepsNav.scrollTo({ left: Math.max(0, left), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
            }
        }
    }

    function updateStepUi(index, announce) {
        const changed = index !== activeStep;
        activeStep = index;
        const step = config.steps[index];
        const total = config.steps.length;
        captionStep.textContent = `${index + 1} / ${total}`;
        captionTitle.textContent = translate(step[2]);
        captionCopy.textContent = translate(step[3]);
        previousButton.disabled = index === 0;
        nextButton.disabled = index === total - 1;
        if (changed) {
            overlayKey = '';
            // The label appears once this step's target has settled, instead of following the page
            // while it scrolls.
            label.waiting = true;
            label.glide = null;
            callout.classList.remove('is-visible', 'is-entering');
            if (announce) status.textContent = `${index + 1} / ${total}. ${translate(step[2])}. ${translate(step[3])}`;
        }
    }

    function updateTimelineUi() {
        seekInput.value = String(Math.round(currentTime));
        seekInput.style.setProperty('--manual-progress', `${currentTime / config.duration * 100}%`);
        const value = `${formatTime(currentTime)} / ${formatTime(config.duration)}`;
        timeOutput.value = value;
        timeOutput.textContent = value;
        seekInput.setAttribute('aria-valuetext', `${value}, ${translate(config.steps[Math.max(0, activeStep)][2])}`);
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
        getFrameApi()?.setPaused?.(!isPlaying);
    }

    // ---------------------------------------------------------------- camera and overlay

    function cancelCameraTransition() {
        if (cameraTransitionTimer !== null) clearTimeout(cameraTransitionTimer);
        cameraTransitionTimer = null;
        frameCanvas.classList.remove('is-camera-animating');
    }

    function beginCameraTransition() {
        if (cameraTransitionTimer !== null) clearTimeout(cameraTransitionTimer);
        frameCanvas.classList.add('is-camera-animating');
        cameraTransitionTimer = window.setTimeout(() => {
            cameraTransitionTimer = null;
            frameCanvas.classList.remove('is-camera-animating');
        }, CAMERA_TRANSITION_DURATION + 80);
    }

    // The picture never zooms or pans while the guide plays: the page is shown at one readable size
    // and fills the stage, and a short stage gets a shorter page window, which the page scrolls the
    // way it would in a smaller browser. Moving the picture and scrolling the page at the same time
    // made each step change flicker. Only a stage too small to read (a phone) zooms per step.
    function measureFrame() {
        const width = frameStage.clientWidth;
        const height = frameStage.clientHeight;
        if (!width || !height) return { height: FRAME_HEIGHT, scale: null };
        const whole = Math.min(width / FRAME_WIDTH, height / FRAME_HEIGHT);
        const scale = Math.min(width / FRAME_WIDTH, height / MIN_FRAME_HEIGHT, Math.max(whole, READABLE_SCALE));
        if (scale < MIN_STILL_SCALE) return { height: FRAME_HEIGHT, scale: null };
        return { height: Math.round(Math.min(FRAME_HEIGHT, height / scale)), scale };
    }

    function applyFrameSize() {
        frameLayout = measureFrame();
        const value = `${frameLayout.height}px`;
        if (frame.style.height === value) return;
        frame.style.height = value;
        frameCanvas.style.height = value;
    }

    function desiredCamera() {
        const width = frameStage.clientWidth;
        const height = frameStage.clientHeight;
        if (!width || !height || !config) return null;
        if (frameLayout.scale) {
            const { scale } = frameLayout;
            return { scale, left: (width - FRAME_WIDTH * scale) / 2, top: (height - frameLayout.height * scale) / 2, rect: null };
        }
        // A phone-sized stage: zoom in just far enough to read the step's target.
        const fit = Math.min(width / FRAME_WIDTH, height / FRAME_HEIGHT);
        const compact = width <= 560;
        const rect = frameReady ? getFrameApi()?.getCameraRect?.() : null;
        let scale = fit;
        let centerX = FRAME_WIDTH / 2;
        let centerY = FRAME_HEIGHT / 2;
        if (rect && rect.width > 0 && rect.height > 0) {
            const wanted = Math.min(READABLE_SCALE, fit * (compact ? 2.4 : 1.6));
            const room = Math.min(width * (compact ? .94 : .9) / Math.max(rect.width, 120), height * (compact ? .66 : .64) / Math.max(rect.height, 80));
            scale = Math.max(fit, Math.min(wanted, room));
            centerX = rect.left + rect.width / 2;
            centerY = rect.top + rect.height / 2;
        }
        const scaledWidth = FRAME_WIDTH * scale;
        const scaledHeight = FRAME_HEIGHT * scale;
        const left = scaledWidth <= width ? (width - scaledWidth) / 2 : Math.min(0, Math.max(width - scaledWidth, width / 2 - centerX * scale));
        const top = scaledHeight <= height ? (height - scaledHeight) / 2 : Math.min(0, Math.max(height - scaledHeight, height / 2 - centerY * scale));
        return { scale, left, top, rect };
    }

    // Keep the current view while the new target is already inside it at a readable zoom; moving the
    // picture for every step makes the guide harder to follow.
    function keepsView(next) {
        if (!camera || !next.rect || camera.scale < next.scale * .97) return false;
        const width = frameStage.clientWidth;
        const height = frameStage.clientHeight;
        const viewLeft = -camera.left / camera.scale;
        const viewTop = -camera.top / camera.scale;
        const viewRight = viewLeft + width / camera.scale;
        const viewBottom = viewTop + height / camera.scale;
        // Leave a margin inside the view, except along an edge of the page that is already in sight.
        const margin = 16 / camera.scale;
        const minX = viewLeft <= 0 ? 0 : viewLeft + margin;
        const minY = viewTop <= 0 ? 0 : viewTop + margin;
        const maxX = viewRight >= FRAME_WIDTH ? FRAME_WIDTH : viewRight - margin;
        const maxY = viewBottom >= FRAME_HEIGHT ? FRAME_HEIGHT : viewBottom - margin;
        const { rect } = next;
        return rect.left >= minX - 1 && rect.top >= minY - 1 && rect.left + rect.width <= maxX + 1 && rect.top + rect.height <= maxY + 1;
    }

    function updateCamera(options = {}) {
        const next = desiredCamera();
        if (!next) return;
        if (!options.force && keepsView(next)) return;
        const changed = !camera
            || Math.abs(next.scale - camera.scale) / camera.scale > .02
            || Math.abs(next.left - camera.left) > 18
            || Math.abs(next.top - camera.top) > 18;
        if (!changed && !options.force) return;
        const animate = !options.snap && camera && isPlaying && !isScrubbing && !reducedMotion.matches;
        if (animate) beginCameraTransition();
        else cancelCameraTransition();
        camera = next;
        const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
        const left = Math.round(next.left * pixelRatio) / pixelRatio;
        const top = Math.round(next.top * pixelRatio) / pixelRatio;
        frameCanvas.style.transform = `translate3d(${left}px, ${top}px, 0) scale(${next.scale})`;
    }

    function hideOverlay() {
        focusBox.classList.remove('is-visible');
        callout.classList.remove('is-visible', 'is-entering');
        overlayKey = '';
        shownBox = null;
        litKey = '';
        litMorph = null;
        litMoving = false;
        label.waiting = true;
        label.glide = null;
    }

    // Starts and ends gently, like the page's own scroll.
    const easeInOut = value => {
        const t = Math.max(0, Math.min(1, value));
        return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    };
    const mix = (from, to, amount) => from + (to - from) * amount;

    // Where the numbered label goes beside the lit box: right, left, below or above it, or inside
    // one of its corners when the box fills the stage. A side that still fits is kept, so the label
    // does not hop around while the page scrolls or the box grows; while the target is still moving
    // the side is kept even if it is squeezed against the stage edge for a moment.
    function calloutPlacement(box, preferred, keep) {
        const stageWidth = frameStage.clientWidth;
        const stageHeight = frameStage.clientHeight;
        const width = callout.offsetWidth;
        const height = callout.offsetHeight;
        const gap = 14;
        const clampX = value => Math.min(stageWidth - width - 8, Math.max(8, value));
        const clampY = value => Math.min(stageHeight - height - 8, Math.max(8, value));
        const { x, y, w, h } = box;
        const spots = {
            right: [x + w + gap, clampY(y + h / 2 - height / 2)],
            left: [x - gap - width, clampY(y + h / 2 - height / 2)],
            below: [clampX(x + w / 2 - width / 2), y + h + gap],
            above: [clampX(x + w / 2 - width / 2), y - gap - height],
            'inside-0': [clampX(x + w - width - 16), clampY(y + h - height - 16)],
            'inside-1': [clampX(x + 16), clampY(y + h - height - 16)],
            'inside-2': [clampX(x + w - width - 16), clampY(y + 16)],
            'inside-3': [clampX(x + 16), clampY(y + 16)]
        };
        const fits = ([left, top]) => left >= 8 && top >= 8 && left + width <= stageWidth - 8 && top + height <= stageHeight - 8;
        if (spots[preferred]) {
            if (keep) return [preferred, clampX(spots[preferred][0]), clampY(spots[preferred][1])];
            if (preferred.startsWith('inside') || fits(spots[preferred])) return [preferred, ...spots[preferred]];
        }
        const side = ['right', 'left', 'below', 'above'].find(name => fits(spots[name]));
        if (side) return [side, ...spots[side]];
        // Inside the box, in the corner farthest from the pointer so it never covers the control in use.
        const pointer = getFrameApi()?.getPointer?.();
        const matrix = cameraMatrix();
        const pointerX = pointer ? matrix.e + pointer.x * matrix.a : x + w / 2;
        const pointerY = pointer ? matrix.f + pointer.y * matrix.d : y + h / 2;
        const distance = name => Math.hypot(spots[name][0] + width / 2 - pointerX, spots[name][1] + height / 2 - pointerY);
        const corner = ['inside-0', 'inside-1', 'inside-2', 'inside-3'].reduce((best, name) => (distance(name) > distance(best) + 1 ? name : best));
        return [corner, ...spots[corner]];
    }

    function cameraMatrix() {
        const transform = getComputedStyle(frameCanvas).transform;
        return new DOMMatrixReadOnly(transform && transform !== 'none' ? transform : undefined);
    }

    function updateOverlay(options = {}) {
        const rect = frameReady && isOpen() ? getFrameApi()?.getFocusRect?.() : null;
        const now = performance.now();
        // Seeking, pausing and reduced motion show the finished picture straight away.
        const instant = options.instant || !isPlaying || reducedMotion.matches;
        if (!rect) {
            // A target that is gone for a moment (a window closing as the next one opens) keeps the
            // last highlight briefly, so the dimming does not blink off and on.
            if (shownBox && !instant && frameReady && isOpen() && now - litSeen < LIT_GRACE_MS) return;
            hideOverlay();
            return;
        }
        litSeen = now;
        const matrix = cameraMatrix();
        const pad = 6;
        const target = {
            x: matrix.e + (rect.left - pad) * matrix.a,
            y: matrix.f + (rect.top - pad) * matrix.d,
            w: (rect.width + pad * 2) * matrix.a,
            h: (rect.height + pad * 2) * matrix.d
        };
        // A new target (the next step, or the window a click opened) is reached by sliding the lit
        // area there. The frame reports where the target will be once the page has scrolled, so the
        // highlight moves once and the page scrolls into it, instead of both moving at once.
        const key = rect.key || '';
        if (key !== litKey || (rect.moving && !litMoving)) {
            litKey = key;
            litMorph = shownBox && !instant ? { from: shownBox, since: now } : null;
            // The label rides along when it keeps its side at the new target; otherwise it fades out
            // and comes back at its new place once the highlight has arrived, instead of crossing over.
            if (litMorph && !label.waiting && calloutPlacement(target, label.side, false)[0] !== label.side) {
                label.waiting = true;
                label.glide = null;
            }
        }
        litMoving = Boolean(rect.moving);
        let box = target;
        if (litMorph) {
            const amount = easeInOut((now - litMorph.since) / FOCUS_MORPH_MS);
            box = {
                x: mix(litMorph.from.x, target.x, amount), y: mix(litMorph.from.y, target.y, amount),
                w: mix(litMorph.from.w, target.w, amount), h: mix(litMorph.from.h, target.h, amount)
            };
            if (amount >= 1) litMorph = null;
        }
        shownBox = box;
        const settled = instant || (!rect.moving && !litMorph);
        if (label.waiting) {
            if (settled) {
                label.waiting = false;
                // The label takes the new step's name only now, so the previous label never fades
                // out showing the next step's name.
                const step = config.steps[Math.max(0, activeStep)];
                callout.querySelector('.manual-guide-callout-number').textContent = String(Math.max(0, activeStep) + 1);
                callout.querySelector('strong').textContent = translate(step[2]);
                const [side, left, top] = calloutPlacement(box, '', false);
                Object.assign(label, { side, left, top, glide: null });
                callout.classList.remove('is-entering');
                void callout.offsetWidth;
                callout.classList.add('is-entering');
            }
        } else {
            const [side, left, top] = calloutPlacement(box, label.side, !settled);
            // Moving to another side slides the label there instead of making it jump.
            if (side !== label.side) label.glide = instant ? null : { left: label.left, top: label.top, since: now };
            label.side = side;
            let shownLeft = left;
            let shownTop = top;
            if (label.glide) {
                const amount = easeInOut((now - label.glide.since) / FOCUS_MORPH_MS);
                shownLeft = mix(label.glide.left, left, amount);
                shownTop = mix(label.glide.top, top, amount);
                if (amount >= 1) label.glide = null;
            }
            label.left = shownLeft;
            label.top = shownTop;
        }
        const stageWidth = frameStage.clientWidth;
        const stageHeight = frameStage.clientHeight;
        const round = value => Math.round(value * 2) / 2;
        const drawKey = [box.x, box.y, box.w, box.h, label.left, label.top, stageWidth, stageHeight].map(round).join(',') + label.side + label.waiting;
        if (drawKey === overlayKey) return;
        overlayKey = drawKey;
        const x = round(box.x);
        const y = round(box.y);
        const w = round(Math.max(0, box.w));
        const h = round(Math.max(0, box.h));
        const r = Math.max(0, Math.min(10, w / 2, h / 2));
        focusSvg.setAttribute('viewBox', `0 0 ${stageWidth} ${stageHeight}`);
        focusPath.setAttribute('d', `M0 0H${stageWidth}V${stageHeight}H0Z`
            + `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`
            + `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`);
        focusBox.classList.add('is-visible');
        if (label.waiting) {
            callout.classList.remove('is-visible', 'is-entering');
            return;
        }
        callout.dataset.side = label.side.startsWith('inside') ? 'inside' : label.side;
        callout.style.transform = `translate3d(${round(label.left)}px, ${round(label.top)}px, 0)`;
        callout.classList.add('is-visible');
    }

    // One loop while the guide is open: advance the clock when playing, then follow the target.
    function loop(timestamp) {
        loopFrame = null;
        if (!isOpen()) return;
        if (isPlaying && frameReady && !document.hidden) {
            if (!lastTick) lastTick = timestamp;
            const delta = Math.min(100, timestamp - lastTick);
            lastTick = timestamp;
            renderAt(currentTime + delta, false);
            if (currentTime >= config.duration) {
                setPlaying(false);
                status.textContent = translate('가이드 재생이 완료되었습니다.');
            }
        } else {
            lastTick = 0;
            // Keep redrawing the paused moment: something the page finishes later (a CAD file still
            // loading after a seek, say) then shows up and gets lit without pressing play.
            if (frameReady) getFrameApi()?.setTimelineTime?.(currentTime);
        }
        if (frameReady) {
            updateCamera();
            updateOverlay();
        }
        if (!document.hidden) loopFrame = requestAnimationFrame(loop);
    }

    function startLoop() {
        if (loopFrame === null && isOpen() && !document.hidden) loopFrame = requestAnimationFrame(loop);
    }

    function stopLoop() {
        if (loopFrame !== null) cancelAnimationFrame(loopFrame);
        loopFrame = null;
        lastTick = 0;
    }

    // ---------------------------------------------------------------- frame

    function clearFrameWaiters() {
        if (frameTimeout !== null) clearTimeout(frameTimeout);
        if (framePoll !== null) clearInterval(framePoll);
        frameTimeout = null;
        framePoll = null;
    }

    function syncFrameLocale() {
        try {
            const locale = window.InoRobotI18n?.locale;
            const childI18n = frame.contentWindow?.InoRobotI18n;
            if (locale && childI18n && childI18n.locale !== locale) childI18n.setLocale(locale, { persist: false, broadcast: false });
        } catch {
            // The guide still plays in the page's own language.
        }
    }

    function markFrameFailed() {
        if (!isOpen() || frameReady) return;
        clearFrameWaiters();
        frameFailed = true;
        frameLoading.hidden = true;
        frameError.hidden = false;
        hideOverlay();
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
        syncFrameLocale();
        activeCue = '';
        renderAt(currentTime, true);
        requestAnimationFrame(() => requestAnimationFrame(() => updateCamera({ snap: true, force: true })));
        if (!reducedMotion.matches && isOpen()) setPlaying(true);
        return true;
    }

    function ensureFrame() {
        if (frameStarted && loadedSource === frameSource() && !frameFailed) {
            if (frameReady) {
                syncFrameLocale();
                renderAt(currentTime, true);
                if (!reducedMotion.matches) setPlaying(true);
            }
            return;
        }
        clearFrameWaiters();
        frameStarted = true;
        frameReady = false;
        frameFailed = false;
        framePreparing = false;
        loadedSource = frameSource();
        frameStage.classList.remove('is-ready');
        frameLoading.hidden = false;
        frameError.hidden = true;
        hideOverlay();
        frame.src = loadedSource;
        frame.addEventListener('load', () => { void finishFrameReady(); }, { once: true });
        framePoll = window.setInterval(() => { void finishFrameReady(); }, 150);
        frameTimeout = window.setTimeout(markFrameFailed, FRAME_TIMEOUT);
    }

    // ---------------------------------------------------------------- timeline

    function renderAt(time, force) {
        currentTime = Math.max(0, Math.min(config.duration, Number(time) || 0));
        const stepIndex = indexAt(config.steps, currentTime);
        updateChapterUi(indexAt(config.chapters, currentTime));
        updateStepUi(stepIndex, !force);
        updateTimelineUi();
        const api = getFrameApi();
        if (frameReady && api) {
            const [start, cue] = config.steps[stepIndex];
            if (force || cue !== activeCue) {
                activeCue = cue;
                api.renderTimelineCue(cue, start, Boolean(force));
            }
            api.setTimelineTime(currentTime);
            if (force) {
                updateCamera({ snap: true });
                updateOverlay({ instant: true });
            }
        }
        updatePlaybackUi();
    }

    function setPlaying(nextPlaying, replay = false) {
        if (nextPlaying && currentTime >= config.duration) {
            if (!replay) return;
            activeCue = '';
            getFrameApi()?.resetTimeline?.();
            renderAt(0, true);
        }
        isPlaying = Boolean(nextPlaying);
        lastTick = 0;
        if (!isPlaying) cancelCameraTransition();
        updatePlaybackUi();
        startLoop();
    }

    function seekTo(time, options = {}) {
        if (options.force) activeCue = '';
        renderAt(time, Boolean(options.force));
        lastTick = 0;
    }

    function seekToChapter(index, focusChapter) {
        const target = Math.max(0, Math.min(config.chapters.length - 1, Number(index) || 0));
        seekTo(config.chapters[target][0], { force: true });
        if (focusChapter) stepsNav.children[target]?.focus({ preventScroll: true });
    }

    function seekToStep(index) {
        const target = Math.max(0, Math.min(config.steps.length - 1, Number(index) || 0));
        seekTo(config.steps[target][0], { force: true });
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
        const key = trigger.dataset.toolGuide;
        if (!CONFIGS[key]) return;
        config = { ...CONFIGS[key], key };
        modal.dataset.activeToolGuide = key;
        lastFocusedElement = trigger;
        previousBodyOverflow = document.body.style.overflow;
        previousLanguageSwitcherVisibility = languageSwitcher?.style.visibility || '';
        if (languageSwitcher) languageSwitcher.style.visibility = 'hidden';
        title.textContent = translate(config.title);
        kicker.textContent = translate(`빠른 사용 가이드 · 약 ${roundedSeconds(config.duration)}초`);
        launch.href = config.path;
        seekInput.max = String(config.duration);
        modal.classList.add('is-open', 'is-paused');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        setBackgroundInert(true);
        openButtons.forEach(button => button.setAttribute('aria-expanded', String(button === trigger)));
        renderChapters();
        currentTime = 0;
        activeChapter = -1;
        activeStep = -1;
        activeCue = '';
        isPlaying = false;
        camera = null;
        applyFrameSize();
        renderAt(0, true);
        ensureFrame();
        startLoop();
        requestAnimationFrame(() => updateCamera({ snap: true, force: true }));
        closeButton.focus({ preventScroll: true });
    }

    function closeGuide() {
        setPlaying(false);
        stopLoop();
        clearFrameWaiters();
        getFrameApi()?.resetTimeline?.();
        hideOverlay();
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
    previousButton.addEventListener('click', () => seekToStep(activeStep - 1));
    nextButton.addEventListener('click', () => seekToStep(activeStep + 1));
    Array.from(['pointerdown', 'touchstart', 'mousedown']).forEach(type => seekInput.addEventListener(type, beginScrub, { passive: true }));
    seekInput.addEventListener('input', () => { if (!isScrubbing) beginScrub(); seekTo(Number(seekInput.value), { force: true }); });
    Array.from(['pointerup', 'touchend', 'mouseup', 'change']).forEach(type => seekInput.addEventListener(type, finishScrub));
    retryButton.addEventListener('click', () => { frameStarted = false; ensureFrame(); });
    modal.addEventListener('click', event => { if (event.target === modal) closeGuide(); });
    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); closeGuide(); return; }
        if (event.key === 'Tab') { trapFocus(event); return; }
        if (event.target === seekInput) return;
        if (event.key === 'ArrowLeft') { event.preventDefault(); seekToStep(activeStep - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); seekToStep(activeStep + 1); }
        if (event.key === ' ') { event.preventDefault(); setPlaying(!isPlaying, true); }
    });
    document.addEventListener('visibilitychange', () => {
        if (!config || !isOpen()) return;
        if (document.hidden) {
            stopLoop();
            cancelCameraTransition();
            getFrameApi()?.setPaused?.(true);
            return;
        }
        getFrameApi()?.setPaused?.(!isPlaying);
        startLoop();
    });
    document.addEventListener('inorobot:languagechange', () => {
        if (!config || !isOpen()) return;
        title.textContent = translate(config.title);
        kicker.textContent = translate(`빠른 사용 가이드 · 약 ${roundedSeconds(config.duration)}초`);
        renderChapters();
        syncFrameLocale();
        activeChapter = -1;
        activeStep = -1;
        activeCue = '';
        renderAt(currentTime, true);
    });
    reducedMotion.addEventListener?.('change', () => {
        if (!reducedMotion.matches) return;
        cancelCameraTransition();
        setPlaying(false);
    });
    const refit = () => {
        if (!isOpen()) return;
        overlayKey = '';
        applyFrameSize();
        updateCamera({ snap: true, force: true });
        updateOverlay({ instant: true });
    };
    if ('ResizeObserver' in window) new ResizeObserver(refit).observe(frameStage);
    else window.addEventListener('resize', refit);

    window.ToolGuide = Object.freeze({
        open: key => { const trigger = openButtons.find(button => button.dataset.toolGuide === key); if (trigger) openGuide(trigger); },
        close: closeGuide,
        play: () => setPlaying(true, true),
        pause: () => setPlaying(false),
        seekTo: time => seekTo(time, { force: true }),
        goToStep: seekToStep,
        goToChapter: index => seekToChapter(index, false),
        getState: () => ({
            key: config?.key || '',
            currentTime,
            duration: config?.duration || 0,
            activeChapter,
            activeStep,
            activeCue,
            steps: config ? config.steps.map(step => ({ at: step[0], id: step[1] })) : [],
            isPlaying,
            frameReady,
            frameFailed,
            camera: camera ? { ...camera } : null,
            frame: { ...frameLayout },
            overlay: {
                focus: focusBox.classList.contains('is-visible'),
                callout: callout.classList.contains('is-visible') ? callout.querySelector('strong').textContent : ''
            },
            child: getFrameApi()?.getState?.() || null
        })
    });
    window.dispatchEvent(new CustomEvent('inorobot:toolguideready'));
}());
