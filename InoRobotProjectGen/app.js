const WorkTypes = ["Tray", "Stage", "MCR", "Vision", "Trash"]; // Peeling removed from type
const WorkMethods = ["Get", "Put", "Check", "Calibration", "Peeling"];
const ToolTypes = ["Vacuum", "Gripper", "PLC (IO)", "Vision (Socket)"];
const VisionUses = ["No use", "Use - IO", "Use - Socket"];

function uiText(value) {
    return window.InoRobotI18n ? window.InoRobotI18n.translate(String(value)) : String(value);
}

class ProcessStep {
    constructor(no) {
        this.No = no;
        this.WorkType = "Tray";
        this.WorkMethod = "Get";
        this.ToolType = "Vacuum";
        this.VisionUse = "No use";
        this._customName = null;
        this.ExtraWaitCount = 0;
        this.teachMode = false;
        this.waitPos = false;
    }
    get ProcessName() { return this._customName || `sP${String(this.No).padStart(2, '0')}_${this.WorkType}_${this.WorkMethod}`; }
    set ProcessName(val) { this._customName = val; }
}

const state = {
    projectName: (function () {
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return "InoProject_" + mm + dd;
    })(),
    steps: [],
    options: {
        RobotName: "IR-R10-140S5-D1NH-INT_01741041",
        EnableMultiRecipe: false,
        RecipeCount: 2,
        EnableTcpSpeed: false,
        EnableTorque: false,
        EnableToolControl: false,
        ToolControlType: "PLC_IO", // "PLC_IO" or "DIO"
        EnableTeachingMode: true,
        EnableWaitPos: true,
        EnableProcessBusy: true,
        VisionConfigs: {} // idx -> { IsClient, IpAddress, Port }
    },
    userEdits: {}, // { filename: "edited code without ProgramInfo" }
    labelOverrides: {}, // { oldLabel: newLabel } - label renames to propagate
    editMode: false
};

function initApp() {
    // 1. Core Button Binding - Move to top for reliability
    const btnAdd = document.getElementById('btnAdd');
    if (btnAdd) btnAdd.onclick = addStep;

    const btnGenerate = document.getElementById('btnGenerate');
    if (btnGenerate) btnGenerate.onclick = exportProj;

    // Guide modal
    document.getElementById('btnGuide').onclick = () => {
        document.getElementById('guideModal').classList.remove('hidden');
        if (window.lucide) {
            lucide.createIcons();
        } else if (window.InoRobotIconFallback) {
            window.InoRobotIconFallback.apply(document.getElementById('guideModal'));
        }
    };
    document.querySelectorAll('.guide-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.guide-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.guide-tab-content').forEach(c => c.classList.add('hidden'));
            tab.classList.add('active');
            document.getElementById('guideTab-' + tab.dataset.tab).classList.remove('hidden');
        });
    });

    // 2. Data Initialization with try-catch
    try {
        initRobots();
    } catch (e) {
        console.error("Robot data initialization failed:", e);
    }

    try {
        addStep();
    } catch (e) {
        console.error("Initial step creation failed:", e);
    }

    // Name validation
    document.getElementById('prjName').addEventListener('input', function (e) {
        this.value = this.value.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 16);
        state.projectName = this.value || "InoRobot_Pro_New";
        uSelector();
    });

    // Logo Click Behavior
    document.getElementById('appLogo').parentElement.onclick = (e) => {
        // Parent is <a> tag, but we can also add dynamic behavior if needed
        // Since it's an <a> tag with href, it will work naturally, 
        // but we ensure it doesn't conflict with any SPA logic if added later.
    };

    document.getElementById('chkMultiRecipe').onchange = (e) => {
        state.options.EnableMultiRecipe = e.target.checked;
        document.getElementById('numRecipeCount').disabled = !e.target.checked;
        uSelector();
    };

    document.getElementById('chkToolControl').onchange = (e) => {
        state.options.EnableToolControl = e.target.checked;
        document.getElementById('cmbToolControlType').disabled = !e.target.checked;
        uSelector();
    };

    document.getElementById('btnOption').onclick = () => {
        document.getElementById('chkMultiRecipe').checked = state.options.EnableMultiRecipe;
        document.getElementById('numRecipeCount').value = state.options.RecipeCount;
        document.getElementById('numRecipeCount').disabled = !state.options.EnableMultiRecipe;
        document.getElementById('chkTcpSpeed').checked = state.options.EnableTcpSpeed;
        document.getElementById('chkTorque').checked = state.options.EnableTorque;
        document.getElementById('chkToolControl').checked = state.options.EnableToolControl;
        document.getElementById('cmbToolControlType').value = state.options.ToolControlType || "PLC_IO";
        document.getElementById('cmbToolControlType').disabled = !state.options.EnableToolControl;

        document.getElementById('chkTeachingMode').checked = state.options.EnableTeachingMode;
        document.getElementById('chkWaitPos').checked = state.options.EnableWaitPos;
        document.getElementById('chkProcessBusy').checked = state.options.EnableProcessBusy;

        document.getElementById('optionsModal').classList.remove('hidden');

        // Reset description panel
        document.getElementById('optDescTitle').innerText = uiText('Option Info');
        document.getElementById('optDescText').innerText = uiText('항목 위에 마우스를 올리면 상세 설명이 표시됩니다.');
        const iconBox = document.getElementById('optIconBox');
        iconBox.innerHTML = '<i data-lucide="info" class="w-10 h-10 text-slate-400"></i>';
        if (window.lucide) lucide.createIcons();
    };

    // Option Description logic
    const optDescs = {
        multiRecipe: { title: "Multi Recipe", icon: "layers", text: `여러 로봇 포인트 파일(레시피)을 생성하여 프로그램에서 동적으로 로드할 수 있도록 합니다.<ul class="mt-3 space-y-1 text-left text-xs text-slate-400 list-none"><li>📄 <b>포인트 파일</b> : P.pts 외에 P01.pts ~ P0N.pts 추가 생성</li><li>📄 <b>매핑 파일</b> : RobPointMapping.dat에 레시피 파일 목록 추가</li><li>📄 <b>프로젝트 파일</b> : RobPointFiles 배열에 pts 파일 등록</li><li>⚙️ <b>s01_initial.pro</b> : Manual_set_recipe() 함수 추가 (LoadPoints 분기)</li><li>⚙️ <b>main.pro</b> : 루프 내 Manual_set_recipe() 호출 추가</li><li>🏷️ <b>라벨</b> : INW[40] xwP_file_switch, OUTW[46] ywCur_P_file 추가</li></ul>` },
        tcpSpeed: { title: "TCP Speed Monitoring", icon: "gauge", text: `로봇의 TCP(툴 중심점) 이동 속도를 0.1초 간격으로 계산하여 모니터링합니다.<ul class="mt-3 space-y-1 text-left text-xs text-slate-400 list-none"><li>📄 <b>신규 파일</b> : PLC_TCP_Speed.pro 생성 (별도 Task 실행)</li><li>📄 <b>프로젝트 파일</b> : MultiTaskInfos / ProgramFiles에 등록</li><li>🏷️ <b>라벨</b> : OUTW[63] ywCur_TCP_speed, D[0] D_TCP_speed 추가</li></ul>` },
        torque: { title: "Torque Monitoring", icon: "activity", text: `각 축 모터의 현재/최대 토크를 PLC_internal.pro 정적 태스크 안에서 실시간 모니터링합니다. SCARA 로봇 선택 시 J5/J6 항목은 제외됩니다.<ul class="mt-3 space-y-1 text-left text-xs text-slate-400 list-none"><li>⚙️ <b>정적 파일</b> : PLC_internal.pro의 Current_torque()에 통합</li><li>📄 <b>프로젝트 파일</b> : 별도 PLC_Current_Torque.pro는 생성하지 않음</li><li>🏷️ <b>라벨</b> : OUTW[64~69] ywCur_J1~J6_torque 추가</li><li>🏷️ <b>라벨</b> : D[1~6] D_J1~J6_cur_torque, D[7~12] D_J1~J6_max_torque 추가</li></ul>` },
        toolControl: { title: "Tool Control", icon: "wrench", text: `진공/그리퍼 툴 제어 함수를 생성하고, 각 공정 프로그램에 툴 동작 호출을 추가합니다.<ul class="mt-3 space-y-1 text-left text-xs text-slate-400 list-none"><li>📄 <b>신규 파일</b> : s04_Tool_Control.pro 생성 (Vac/Grip/Trash/Stage 함수 포함)</li><li>⚙️ <b>각 공정 .pro</b> : 툴 상태 사전 체크(Alarm[15]) 및 툴 동작 호출 추가</li><li>⚙️ <b>main.pro</b> : Include "s04_Tool_Control.pro" 추가</li><li>🏷️ <b>라벨</b> : Communication IO — IN/OUT[608~] xTool_*/yTool_*_REQ 추가</li><li>🏷️ <b>라벨</b> : DIO — IN[0~]/OUT[0~] + IN/OUT[608~] 양쪽 모두 추가</li><li>⚠️ <b>경고 파일</b> : Alarm[15] "Tool position Error!" 등록</li></ul>` },
        teachingMode: { title: "Teaching Mode", icon: "pencil", text: 'PLC 신호로 로봇 작업 위치를 현장에서 직접 수정할 수 있는 통합 티칭 기능을 추가합니다.<ul class="mt-3 space-y-1 text-left text-xs text-slate-400 list-none"><li>📄 <b>신규 파일</b> : s03_teach_mode.pro 생성</li><li>⚙️ <b>각 공정 .pro</b> : B_Cur_process 설정 후 통합 Teaching_mode() 호출</li><li>🏷️ <b>라벨 IN</b> : IN[520] xTeach_mode, IN[521] xTeach_move_next, IN[522] xTeach_move_prev, IN[523] xTeach_move_offset, IN[524] xTeach_save</li><li>🏷️ <b>라벨 OUT</b> : OUT[520] yTeach_mode_sts, OUT[521] yTeach_move_comp, OUT[524] yTeach_save_comp</li></ul>' },
        waitPos: { title: "Wait Position", icon: "map-pin", text: '공정 시작 전 대기 위치(Safe→Wait) 이동 기능을 추가합니다.<ul class="mt-3 space-y-1 text-left text-xs text-slate-400 list-none"><li>⚙️ <b>각 공정 .pro</b> : Pn_pos() 단일 함수에서 Wait/Work 경로 분기</li><li>⚙️ <b>main.pro</b> : xwProcess_wait_pos / xwProcess_work_pos 기준으로 공정 시작</li><li>🏷️ <b>라벨 IN</b> : IN[528~] xP1_wait_pos_start, xP2_... (프로세스 수만큼)</li><li>🏷️ <b>라벨 OUT</b> : OUT[528~] yP1_wait_pos_comp, yP2_... (프로세스 수만큼)</li></ul>' },
        processBusy: { title: "Process Busy Signal", icon: "zap", text: `공정 함수 실행 중임을 알리는 Busy 신호를 wait/work 양쪽에 추가합니다.<ul class="mt-3 space-y-1 text-left text-xs text-slate-400 list-none"><li>⚙️ <b>main.pro</b> : ywProcess_wait_busy / ywProcess_work_busy word 신호 관리</li><li>🏷️ <b>라벨 OUT</b> : OUTW[35] ywProcess_wait_busy, OUTW[36] ywProcess_work_busy</li><li>🏷️ <b>라벨 OUT</b> : OUT[560~] yP1_wait_pos_busy, OUT[576~] yP1_work_pos_busy (프로세스 수만큼)</li></ul>` }
    };

    const updateOptDesc = (id) => {
        const info = optDescs[id];
        if (info) {
            document.getElementById('optDescTitle').innerText = uiText(info.title);
            const description = document.getElementById('optDescText');
            description.innerHTML = info.text;
            if (window.InoRobotI18n) window.InoRobotI18n.apply(description);
            const iconBox = document.getElementById('optIconBox');
            iconBox.innerHTML = `<i data-lucide="${info.icon}" class="w-10 h-10 text-white"></i>`;
            if (window.lucide) lucide.createIcons();
        }
    };

    document.querySelectorAll('[data-opt-id]').forEach(el => {
        el.addEventListener('mouseenter', () => updateOptDesc(el.dataset.optId));
        el.addEventListener('click', (e) => {
            // Prevent double-toggle if click was on the input itself
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

            // For non-label parents (like div), toggle the child checkbox
            if (el.tagName !== 'LABEL') {
                const chk = el.querySelector('input[type="checkbox"]');
                if (chk) {
                    chk.checked = !chk.checked;
                    chk.dispatchEvent(new Event('change'));
                }
            }
            updateOptDesc(el.dataset.optId);
        });
    });

    document.getElementById('btnApplyOptions').onclick = () => {
        state.options.EnableTcpSpeed = document.getElementById('chkTcpSpeed').checked;
        state.options.EnableTorque = document.getElementById('chkTorque').checked;
        state.options.EnableToolControl = document.getElementById('chkToolControl').checked;
        state.options.ToolControlType = document.getElementById('cmbToolControlType').value;
        state.options.EnableTeachingMode = document.getElementById('chkTeachingMode').checked;
        state.options.EnableWaitPos = document.getElementById('chkWaitPos').checked;
        state.options.EnableProcessBusy = document.getElementById('chkProcessBusy').checked;

        let pCount = parseInt(document.getElementById('numRecipeCount').value) || 2;
        state.options.RecipeCount = Math.min(127, Math.max(2, pCount));
        state.options.RobotName = document.getElementById('cmbRobotModel').value;
        document.getElementById('optionsModal').classList.add('hidden');
        renderSteps();
        updatePreview();
    };

    // Edit mode toggle
    document.getElementById('btnToggleEdit').onclick = toggleEditMode;
    document.getElementById('codeEditor').oninput = (e) => {
        const file = document.getElementById('fileSelector').value;
        state.userEdits[file] = e.target.value;
    };

    document.getElementById('fileSelector').onchange = updatePreview;

    // Vision modal binding
    document.getElementById('visionIsClient').onchange = (e) => {
        document.getElementById('visionIpContainer').style.display = e.target.value === "true" ? "block" : "none";
    };
    document.getElementById('btnApplyVision').onclick = () => {
        let idx = parseInt(document.getElementById('visionStepIdx').value);
        state.options.VisionConfigs[idx] = {
            IsClient: document.getElementById('visionIsClient').value === "true",
            IpAddress: document.getElementById('visionIp').value,
            Port: document.getElementById('visionPort').value
        };
        document.getElementById('visionModal').classList.add('hidden');
        updatePreview();
    };

    try {
        updatePreview();
    } catch (e) {
        console.error("Initial preview update failed:", e);
    }

    if (window.lucide) {
        try {
            lucide.createIcons();
        } catch (e) {
            console.warn("Lucide icons could not be initialized:", e);
        }
    }
}

function initRobots() {
    let cmb = document.getElementById('cmbRobotModel');
    if (!cmb) return;
    cmb.innerHTML = ''; // Clear existing

    const scaraGrp = document.createElement('optgroup');
    scaraGrp.label = "SCARA Robots";
    const axis6Grp = document.createElement('optgroup');
    axis6Grp.label = "6-Axis Robots";

    // Handle SCARA data (Mapped from Robots_6_axis assets)
    if (typeof Assets !== 'undefined' && Assets.Robots_6_axis) {
        let linesS = Assets.Robots_6_axis.split(/\r?\n/);
        linesS.forEach(line => {
            let cols = line.split(',');
            if (cols.length >= 4) {
                let name = cols[0].trim() + cols[1].trim() + cols[2].trim() + cols[3].trim();
                let opt = document.createElement('option');
                opt.value = name;
                opt.text = cols[1].trim();
                scaraGrp.appendChild(opt);
            }
        });
    }

    // Handle 6-Axis data (Mapped from Robots_SCARA assets)
    if (typeof Assets !== 'undefined' && Assets.Robots_SCARA) {
        let lines6 = Assets.Robots_SCARA.split(/\r?\n/);
        lines6.forEach(line => {
            let cols = line.split(',');
            if (cols.length >= 4) {
                let name = cols[0].trim() + cols[1].trim() + cols[2].trim() + cols[3].trim();
                let opt = document.createElement('option');
                opt.value = name;
                opt.text = cols[1].trim();
                axis6Grp.appendChild(opt);
            }
        });
    }

    cmb.appendChild(scaraGrp);
    cmb.appendChild(axis6Grp);

    if (state.options.RobotName) {
        cmb.value = state.options.RobotName;
    }

    cmb.onchange = (e) => {
        state.options.RobotName = e.target.value;
        updatePreview();
    };
}

function addStep() {
    if (state.steps.length >= 15) { alert(uiText("Max 15 processes.")); return; }
    state.steps.push(new ProcessStep(state.steps.length + 1));
    renderSteps();
}

function rStep(idx) {
    state.steps.splice(idx, 1);
    state.steps.forEach((s, i) => s.No = i + 1);
    // clean vision configs if needed, but not strictly necessary
    renderSteps();
}

function updateRowRules(s) {
    let t = s.WorkType, m = s.WorkMethod, tool = s.ToolType, v = s.VisionUse;

    if (t === "Trash") {
        s.WorkMethod = "Put"; s.ToolType = "Gripper"; s.VisionUse = "No use";
    } else {
        if ((t === "Tray" || t === "Stage" || t === "MCR") && m === "Calibration") s.WorkMethod = "Get";
        else if ((t === "Tray" || t === "Stage") && m === "Check") s.WorkMethod = "Get";
        else if (t !== "Stage" && m === "Peeling") s.WorkMethod = "Get";
    }

    t = s.WorkType; m = s.WorkMethod;

    if (t === "Peeling" || m === "Peeling" || t === "Trash") {
        s.ToolType = "Gripper";
    }

    if (m === "Calibration") {
        if (s.ToolType !== "PLC (IO)" && s.ToolType !== "Vision (Socket)") {
            s.ToolType = "PLC (IO)";
        }
        s.VisionUse = "No use";
    } else if (s.ToolType === "PLC (IO)" || s.ToolType === "Vision (Socket)") {
        if (s.ToolType === "Vision (Socket)" && m !== "Calibration") s.ToolType = "Vacuum";
    }
}

function openVisionModal(idx) {
    let conf = state.options.VisionConfigs[idx] || { IsClient: true, IpAddress: "192.168.1.10", Port: "5000" };
    document.getElementById('visionStepIdx').value = idx;
    document.getElementById('visionIsClient').value = conf.IsClient ? "true" : "false";
    document.getElementById('visionIpContainer').style.display = conf.IsClient ? "block" : "none";
    document.getElementById('visionIp').value = conf.IpAddress;
    document.getElementById('visionPort').value = conf.Port;
    document.getElementById('visionModal').classList.remove('hidden');
}

window.uStep = function (idx, field, val) {
    state.steps[idx][field] = val;
    updateRowRules(state.steps[idx]);
    let s = state.steps[idx];
    if ((s.WorkMethod === "Check" && s.VisionUse === "Use - Socket") || (s.WorkMethod === "Calibration" && s.ToolType === "Vision (Socket)")) {
        openVisionModal(idx);
    }
    renderSteps();
}

window.addExtraWait = function (stepIdx) {
    if (!state.steps[stepIdx]) return;
    state.steps[stepIdx].ExtraWaitCount = (state.steps[stepIdx].ExtraWaitCount || 0) + 1;
    updatePreview();
};

window.removeExtraWait = function (stepIdx) {
    if (!state.steps[stepIdx]) return;
    state.steps[stepIdx].ExtraWaitCount = Math.max(0, (state.steps[stepIdx].ExtraWaitCount || 0) - 1);
    let removedId = (state.steps[stepIdx].No * 100) + state.steps[stepIdx].ExtraWaitCount + 2;
    if (state.ptsOverrides) {
        for (let key in state.ptsOverrides) {
            if (state.ptsOverrides[key][removedId.toString()]) {
                delete state.ptsOverrides[key][removedId.toString()];
            }
        }
    }
    updatePreview();
};

// Modal hook for editing Name
window.openNameModal = function (idx) {
    document.getElementById('editNameIdx').value = idx;
    document.getElementById('editNameInput').value = state.steps[idx].ProcessName;
    document.getElementById('nameModal').classList.remove('hidden');
};

document.getElementById('btnApplyName').onclick = () => {
    let idx = parseInt(document.getElementById('editNameIdx').value);
    let val = document.getElementById('editNameInput').value.trim();
    if (val) state.steps[idx].ProcessName = val;
    else state.steps[idx].ProcessName = null; // Revert to automation
    document.getElementById('nameModal').classList.add('hidden');
    renderSteps();
    updatePreview();
};
window.rStep = rStep;

// Hides ProgramInfo completely from strings before showing it or storing it
function stripHeader(codeStr) {
    if (!codeStr) return "";
    return codeStr.replace(/ProgramInfo[\s\S]*?EndProgramInfo\r?\n?/g, '');
}

function prependHeader(codeStr, robotName) {
    let header = `ProgramInfo\n    Version = "26.04.02.08"\n    VRC = "V4R24"\n    Time = "${TemplateHelper.getNowAmPm()}"\n    RobotName = "${robotName}"\nEndProgramInfo\n`;
    // Data files use getNow() format, but getNowAmPm() is mostly ok. Wait, we don't prepend header blindly to Javascript data files.
    // The generator should continue to produce full strings, we just strip them for Editor.
    return header + codeStr;
}

function handleGeneratedContent(file) {
    // Generate the raw code using Generator
    let code = "";
    if (file === "main.pro") code = Generator.MainProgram(state.steps, state.options);
    else if (file === "PLC_internal.pro") code = Generator.PLCInternalProgram(state.options);
    else if (file === "s01_initial.pro") code = Generator.InitialProgram(state.steps, state.options);
    else if (file === "s02_offset.pro") code = Generator.OffsetProgram(state.steps, state.options);
    else if (file === "s03_teach_mode.pro") code = Generator.TeachModeProgram(state.steps, state.options);
    else if (file === "s04_Tool_Control.pro") code = Generator.ToolControlProgram(state.options, state.steps);
    else if (file === "PLC_TCP_Speed.pro") code = Generator.TcpSpeedProgram(state.options.RobotName);
    else if (file === "Remote_IO_mapping.dat") code = Generator.RemoteIOInfo(state.options);
    else if (file === "Labels.jsn") code = Generator.LabelsJson(state.steps, state.options);
    else if (file === "UserDefineWarning.jsn") code = Generator.DataWarning(state.steps, state.options);
    else if (file === "BreakPoints.jsn") code = '{\n  "ProgramsCount": 0,\n  "ProgramsBreaks": []\n}';
    else if (file === "MonitorGlobalVars.jsn") {
        let vars = ["xReIO_run_all_static", "xwProcess_wait_pos", "xwProcess_work_pos", "ywProcess_wait_comp", "ywProcess_work_comp", "ywProcess_wait_busy", "ywProcess_work_busy", "xwSet_speed", "ywReIO_cur_control", "yRemote_mode_sts", "B_Tool", "B_Wobj", "B_PR", "B_path", "B_Cur_process", "yRobot_homing", "R_Cur_pos", "xwP_file_switch"];
        if (state.options.EnableTcpSpeed) vars.push("D_TCP_speed");
        if (state.options.EnableTorque) {
            for (let i = 1; i <= 6; i++) { vars.push(`D_J${i}_cur_torque`); vars.push(`D_J${i}_max_torque`); }
        }
        code = JSON.stringify(vars);
    }
    else if (file === "MonitorVars.jsn") code = "[]";
    else if (file === "JP.pts") code = `ProgramInfo\n    Version = "26.04.02.08"\n    VRC = "V4R24"\n    Time = "${TemplateHelper.getNow()}"\n    RobotName = "${state.options.RobotName}"\nEndProgramInfo\n`;
    else if (file.endsWith(".pts")) { // DataPoints
        code = Generator.DataPoints(state.steps, state.options, file);
    }
    else if (file.endsWith(".prj")) code = Generator.DataPrj(state.steps, state.options, file.replace(/\.prj$/, ''));
    else if (file && file.startsWith("sP")) {
        const stepName = file.replace(".pro", "");
        let stageIdx = 0;
        state.steps.forEach(s => { if (s.WorkType === "Stage") stageIdx++; if (s.ProcessName === stepName) code = Generator.ProcessProgram(s, state.options, stageIdx); });
    }

    return code;
}

function applyDynamicOverrides(file, code) {
    if (file === 'UserDefineWarning.jsn' && state.warningOverrides) {
        try {
            const obj = JSON.parse(code);
            const arr = obj.Warings || obj.Warnings || [];
            for (let i = 0; i < 16; i++) {
                if (state.warningOverrides[i] !== undefined) arr[i] = state.warningOverrides[i];
            }
            return JSON.stringify({ Warings: arr }, null, 2);
        } catch (e) { }
    }
    if (file.endsWith('.pts') && state.ptsOverrides && state.ptsOverrides[file]) {
        let lines = code.split(/\r?\n/);
        return lines.map(line => {
            const idMatch = line.match(/^P\[(\d+)\]/);
            if (idMatch && state.ptsOverrides[file][idMatch[1]]) {
                return state.ptsOverrides[file][idMatch[1]];
            }
            return line;
        }).join('\n');
    }
    return code;
}

function getFinalFileContent(file) {
    let generated = applyDynamicOverrides(file, handleGeneratedContent(file));
    let edited = state.userEdits[file];

    if (file === 'UserDefineWarning.jsn' || file.endsWith('.pts') || file === 'Labels.jsn') {
        edited = undefined;
    }

    let result;
    if (edited !== undefined) {
        if (generated.includes("ProgramInfo")) {
            let header = `ProgramInfo\n    Version = "26.04.02.08"\n    VRC = "V4R24"\n    Time = "${TemplateHelper.getNowAmPm()}"\n    RobotName = "${state.options.RobotName}"\nEndProgramInfo\n`;
            if (file.endsWith(".pts")) {
                header = `ProgramInfo\n    Version = "26.04.02.08"\n    VRC = "V4R24"\n    Time = "${TemplateHelper.getNow()}"\n    RobotName = "${state.options.RobotName}"\nEndProgramInfo\n`;
            }
            result = header + edited;
        } else {
            result = edited;
        }
    } else {
        result = generated;
    }

    // Apply label overrides to program files (.pro)
    if (file.endsWith('.pro') && Object.keys(state.labelOverrides).length > 0) {
        for (const [oldLabel, newLabel] of Object.entries(state.labelOverrides)) {
            if (oldLabel && newLabel && oldLabel !== newLabel) {
                result = result.replaceAll(oldLabel, newLabel);
            }
        }
    }

    return result;
}

function toggleEditMode() {
    const file = document.getElementById('fileSelector').value;
    // RemoteIO는 편집 불가
    if (file === 'Remote_IO_mapping.dat') return;

    state.editMode = !state.editMode;
    const btn = document.getElementById('btnToggleEdit');

    if (state.editMode) {
        btn.classList.replace('bg-slate-700', 'bg-blue-600');
        btn.classList.add('shadow-lg', 'shadow-blue-600/20');
    } else {
        btn.classList.replace('bg-blue-600', 'bg-slate-700');
        btn.classList.remove('shadow-lg', 'shadow-blue-600/20');
    }
    updatePreview();
}

function renderSteps() {
    const list = document.getElementById('stepsList');

    list.innerHTML = '';
    document.getElementById('processCount').innerText = `${state.steps.length} / 15`;
    state.steps.forEach((s, idx) => {
        const el = document.createElement('div');
        el.className = 'flex items-center gap-2 p-3 bg-slate-900/40 border border-slate-700/50 rounded-xl max-w-full overflow-hidden';

        let mOpts = [];
        if (s.WorkType === "Trash") mOpts.push("Put");
        else {
            mOpts.push("Get", "Put");
            if (s.WorkType === "Stage") mOpts.push("Peeling");
            if (s.WorkType === "MCR" || s.WorkType === "Vision") mOpts.push("Check");
            if (s.WorkType === "Vision") mOpts.push("Calibration");
        }

        let tOpts = [];
        if (s.WorkType === "Trash") tOpts.push("Gripper");
        else if (s.WorkMethod === "Calibration") tOpts.push("PLC (IO)", "Vision (Socket)");
        else tOpts.push("Vacuum", "Gripper");

        let vOpts = [];
        if (s.WorkType === "Trash" || s.WorkMethod === "Calibration") vOpts.push("No use");
        else if (s.WorkType === "Vision" && s.WorkMethod === "Check") vOpts.push("Use - IO", "Use - Socket");
        else vOpts.push("No use", "Use - IO", "Use - Socket");

        let disM = s.WorkType === "Trash" ? "disabled" : "";
        let disT = (s.WorkType === "Peeling" || s.WorkMethod === "Peeling" || s.WorkType === "Trash") ? "disabled" : "";
        let disV = (s.WorkType === "Trash" || s.WorkMethod === "Calibration") ? "disabled" : "";

        el.innerHTML = `
            <div class="w-6 h-6 rounded bg-blue-600 flex-shrink-0 flex items-center justify-center font-bold text-xs">${s.No}</div>
            <button onclick="window.openNameModal(${idx})" class="w-10 h-8 rounded bg-slate-800 border border-slate-600 flex items-center justify-center hover:bg-slate-700 flex-shrink-0"><i data-lucide="more-horizontal" class="w-4 h-4 text-slate-400"></i></button>
            <select onchange="window.uStep(${idx}, 'WorkType', this.value)" class="flex-1 min-w-0 bg-slate-800 border-slate-600 rounded text-sm px-1 py-1 text-slate-300 text-left">${WorkTypes.map(t => `<option ${s.WorkType === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
            <select onchange="window.uStep(${idx}, 'WorkMethod', this.value)" ${disM} class="flex-1 min-w-0 bg-slate-800 border-slate-600 rounded text-sm px-1 py-1 text-slate-300 text-left">${mOpts.map(m => `<option ${s.WorkMethod === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
            <select onchange="window.uStep(${idx}, 'ToolType', this.value)" ${disT} class="flex-1 min-w-0 bg-slate-800 border-slate-600 rounded text-sm px-1 py-1 text-slate-300 text-left">${tOpts.map(t => `<option ${s.ToolType === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
            <select onchange="window.uStep(${idx}, 'VisionUse', this.value)" ${disV} class="flex-1 min-w-0 bg-slate-800 border-slate-600 rounded text-sm px-1 py-1 text-slate-300 text-left">${vOpts.map(v => `<option ${s.VisionUse === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
            <button onclick="window.rStep(${idx})" class="text-slate-500 hover:text-red-400 font-bold ml-1 w-6 h-6 flex items-center justify-center flex-shrink-0">X</button>
        `;
        list.appendChild(el);
    });
    uSelector();
    updatePreview();
    if (window.lucide) lucide.createIcons();
}

function uSelector() {
    const sel = document.getElementById('fileSelector');
    const cur = sel.value;

    // [1] Main Task: main.pro 하나만
    const mainOpts = `<option>main.pro</option>`;

    // [2] Static Task: PLC_ 프로그램들 (옵션 활성화 시에만)
    let staticOpts = '<option>PLC_internal.pro</option>';
    if (state.options.EnableTcpSpeed) staticOpts += `<option>PLC_TCP_Speed.pro</option>`;

    // [3] Basic Sub: s01, s02_Tool 등
    let subOpts = `<option>s01_initial.pro</option><option>s02_offset.pro</option>`;
    if (state.options.EnableTeachingMode) subOpts += `<option>s03_teach_mode.pro</option>`;
    if (state.options.EnableToolControl) subOpts += `<option>s04_Tool_Control.pro</option>`;

    // [4] Process Programs
    const pOpts = state.steps.map(s => `<option>${s.ProcessName}.pro</option>`).join('');

    // [5] Data Files (Project, MonitorVars, JP.pts, MonitorGlobalVars, BreakPoints 제외)
    let dOpts = `<option>Labels.jsn</option><option>Remote_IO_mapping.dat</option><option>UserDefineWarning.jsn</option><option>P.pts</option>`;
    if (state.options.EnableMultiRecipe) {
        for (let i = 1; i < state.options.RecipeCount; i++) {
            dOpts += `<option>P${i.toString().padStart(2, '0')}.pts</option>`;
        }
    }

    let html = `<optgroup label="Main Task">${mainOpts}</optgroup>`;
    if (staticOpts) html += `<optgroup label="Static Task">${staticOpts}</optgroup>`;
    html += `<optgroup label="Basic Sub">${subOpts}</optgroup>`;
    if (pOpts) html += `<optgroup label="Process">${pOpts}</optgroup>`;
    html += `<optgroup label="Data">${dOpts}</optgroup>`;

    sel.innerHTML = html;
    if (Array.from(sel.options).some(o => o.value === cur)) sel.value = cur;

    // Edit 버튼 제어: RemoteIO는 편집 불가
    const editBtn = document.getElementById('btnToggleEdit');
    const isReadOnly = sel.value === 'Remote_IO_mapping.dat';
    editBtn.disabled = isReadOnly;
    editBtn.style.opacity = isReadOnly ? '0.3' : '1';
    editBtn.style.cursor = isReadOnly ? 'not-allowed' : 'pointer';
    editBtn.title = isReadOnly ? 'This file is read-only' : 'Toggle Edit Mode';
}

// ── 표 렌더링 헬퍼 ──────────────────────────────────
function buildTable(headers, rows) {
    const th = headers.map(h => `<th style="padding:8px 12px;text-align:left;color:#94a3b8;font-size:11px;border-bottom:1px solid rgba(255,255,255,0.08);white-space:nowrap">${h}</th>`).join('');
    const tr = rows.map(row =>
        `<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">${row.map(cell => `<td style="padding:7px 12px;font-size:12px;color:#e2e8f0;font-family:'Inter',monospace">${cell ?? '-'}</td>`).join('')}</tr>`
    ).join('');
    return `<div style="overflow:auto;max-height:100%"><table style="width:100%;border-collapse:collapse"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

function updatePreview() {
    const file = document.getElementById('fileSelector').value;
    const editor = document.getElementById('codeEditor');
    const prismCon = document.getElementById('prismContainer');
    const codeOut = document.getElementById('codeOutput');
    const tableCon = document.getElementById('tableContainer');

    const isReadOnly = file === 'Remote_IO_mapping.dat';
    const editBtn = document.getElementById('btnToggleEdit');
    editBtn.disabled = isReadOnly;
    editBtn.style.opacity = isReadOnly ? '0.3' : '1';
    editBtn.style.cursor = isReadOnly ? 'not-allowed' : 'pointer';
    if (isReadOnly && state.editMode) { state.editMode = false; }

    // 기본 상태 초기화
    tableCon.classList.add('opacity-0', 'pointer-events-none');
    tableCon.innerHTML = '';
    prismCon.classList.remove('opacity-0', 'pointer-events-none');
    editor.classList.add('opacity-0', 'pointer-events-none');

    let rawCode = '';
    let tableHtml = null;

    try {
        let rawGen = handleGeneratedContent(file);
        const gen = applyDynamicOverrides(file, rawGen);

        let existingEdit = state.userEdits[file];
        if (file === 'UserDefineWarning.jsn' || file.endsWith('.pts') || file === 'Labels.jsn') {
            existingEdit = undefined;
        }

        rawCode = (existingEdit !== undefined) ? existingEdit : stripHeader(gen);

        // .pro 파일 프리뷰에도 labelOverrides 실시간 반영
        if (file.endsWith('.pro') && Object.keys(state.labelOverrides).length > 0) {
            for (const [oldLabel, newLabel] of Object.entries(state.labelOverrides)) {
                if (oldLabel && newLabel && oldLabel !== newLabel) {
                    rawCode = rawCode.replaceAll(oldLabel, newLabel);
                }
            }
        }

        // ── Labels.jsn (편집 모드: 인라인 input) ──────────
        if (file === 'Labels.jsn') {
            try {
                const obj = JSON.parse(gen);
                const allItems = [];
                Object.values(obj).forEach(section => {
                    if (section && Array.isArray(section.LabelsArray)) {
                        section.LabelsArray.forEach(item => allItems.push(item));
                    }
                });
                const rows = allItems.map((item, ri) => {
                    const orig = item.sOriginalName || '';
                    const label = state.labelOverrides[item.sLabel] || item.sLabel || '';
                    const desc = item.sDescription || '';
                    if (state.editMode) {
                        return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
                            <td style="padding:5px 8px;font-size:12px;color:#94a3b8;font-family:monospace">${orig}</td>
                            <td style="padding:5px 8px"><input type="text" data-orig-label="${item.sLabel || ''}" value="${label}" style="background:transparent;border:1px solid rgba(56,189,248,0.3);color:#38bdf8;font-family:monospace;font-size:12px;width:100%;box-sizing:border-box;outline:none;padding:3px 6px;border-radius:4px" onfocus="this.style.borderColor='#38bdf8'" onblur="this.style.borderColor='rgba(56,189,248,0.3)';updateLabelCell(this)" onkeydown="if(event.key==='Enter'){this.blur();}" /></td>
                            <td style="padding:5px 8px;font-size:12px;color:#e2e8f0;font-family:monospace">${desc}</td>
                        </tr>`;
                    }
                    return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
                        <td style="padding:7px 12px;font-size:12px;color:#e2e8f0;font-family:monospace">${orig}</td>
                        <td style="padding:7px 12px;font-size:12px;color:#38bdf8;font-family:monospace">${label}</td>
                        <td style="padding:7px 12px;font-size:12px;color:#e2e8f0;font-family:monospace">${desc}</td>
                    </tr>`;
                }).join('');
                const th = ['ID', 'Label', 'Description'].map(h => `<th style="padding:8px 12px;text-align:left;color:#94a3b8;font-size:11px;border-bottom:1px solid rgba(255,255,255,0.08)">${h}</th>`).join('');
                tableHtml = `<div style="overflow:auto;max-height:100%"><table style="width:100%;border-collapse:collapse"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;

                window.updateLabelCell = function (input) {
                    const origLabel = input.dataset.origLabel;
                    const newLabel = input.value.trim();
                    if (origLabel && newLabel && origLabel !== newLabel) {
                        state.labelOverrides[origLabel] = newLabel;
                    } else if (origLabel && newLabel === origLabel) {
                        delete state.labelOverrides[origLabel];
                    }
                    try {
                        const obj = JSON.parse(stripHeader(handleGeneratedContent('Labels.jsn')));
                        Object.values(obj).forEach(section => {
                            if (section && Array.isArray(section.LabelsArray)) {
                                section.LabelsArray.forEach(item => {
                                    if (item.sOriginalName && item.sLabel && state.labelOverrides[item.sLabel]) {
                                        item.sLabel = state.labelOverrides[item.sLabel];
                                    }
                                });
                            }
                        });
                        state.userEdits['Labels.jsn'] = JSON.stringify(obj, null, 2);
                    } catch (e) { }
                };
            } catch (e) { /* fallback */ }
        }

        // ── Remote_IO_mapping.dat (읽기 전용) ─────────────
        else if (file === 'Remote_IO_mapping.dat') {
            try {
                // FileInfo 헤더를 잘라내고 JSON 부분만 추출
                const jsonStart = gen.indexOf('{');
                const jsonStr = gen.substring(jsonStart);
                const obj = JSON.parse(jsonStr);
                const arr = obj.BusIoFuncMap || [];
                const rows = arr
                    .filter(item => item.MemAddr !== -1 && item.MemAddr !== "-1")
                    .map(item => {
                        const dir = item.IoType === 0 ? 'Input' : 'Output';
                        const bitWord = item.Length === 1 ? 'Bit' : item.Length === 16 ? 'Word' : String(item.Length);
                        return [dir, bitWord, item.MemAddr, item.Name];
                    });
                tableHtml = buildTable(['In / Out', 'Bit / Word', 'MemAddr', 'Name'], rows);
            } catch (e) {
                tableHtml = `<div style="padding:20px;color:#ef4444">RemoteIO 파싱 오류: ${e.message}</div>`;
            }
        }

        // ── P.pts / Pxx.pts (상태에 따라 편집 가능) ──────────────
        else if (file === 'P.pts' || (file && file.match(/^P\d+\.pts$/))) {
            const isScara = /^IR-(S|TS)/i.test(state.options.RobotName);
            const canEditName = (file === 'P.pts');
            const lines = rawCode.split(/\r?\n/).filter(l => l.trim().startsWith('P['));
            const rows = lines.map((l, rowIdx) => {
                const idMatch = l.match(/^P\[(\d+)\]/);
                const id = idMatch ? idMatch[1] : '-';

                let idCell = `<span style="color:#94a3b8;font-family:monospace;font-size:12px">${id}</span>`;
                if (state.editMode && id !== '-') {
                    const numericId = parseInt(id, 10);
                    const stepNo = Math.floor(numericId / 100);
                    const posType = numericId % 100;

                    const stepIdx = state.steps.findIndex(s => s.No === stepNo);
                    if (stepIdx !== -1) {
                        const step = state.steps[stepIdx];
                        const exCount = step.ExtraWaitCount || 0;
                        if (posType === 1) {
                            if (exCount < 8) {
                                idCell = `<div style="display:flex;align-items:center;gap:4px"><button onclick="window.addExtraWait(${stepIdx})" style="background:#1e293b;border:1px solid rgba(34,197,94,0.3);color:#4ade80;cursor:pointer;padding:0 4px;border-radius:3px;font-size:11px;font-weight:bold">+</button>${idCell}</div>`;
                            }
                        } else if (posType >= 2 && posType <= 9) {
                            if (posType === 1 + exCount) {
                                idCell = `<div style="display:flex;align-items:center;gap:4px"><button onclick="window.removeExtraWait(${stepIdx})" style="background:#1e293b;border:1px solid rgba(239,68,68,0.3);color:#f87171;cursor:pointer;padding:0 4px;border-radius:3px;font-size:11px;font-weight:bold">-</button>${idCell}</div>`;
                            }
                        }
                    }
                }

                const nameMatch = l.match(/Name\s*=\s*([^;]+)/);
                const name = nameMatch ? nameMatch[1].trim() : '-';
                const coordPart = l.replace(/^P\[\d+\]\s*=\s*/, '').split(';')[0];
                const coords = coordPart.split(',').map(v => { const n = parseFloat(v); return isNaN(n) ? v.trim() : n.toFixed(3); });
                const [x = '', y = '', z = '', a = '', b = '', c = ''] = coords;

                function ec(ri, ci, val) {
                    if (state.editMode) {
                        return `<td style="padding:4px 6px"><input type="text" data-row="${ri}" data-col="${ci}" value="${val}" style="background:transparent;border:1px solid rgba(255,255,255,0.1);color:#e2e8f0;font-family:monospace;font-size:12px;width:100%;box-sizing:border-box;outline:none;padding:2px 4px;border-radius:4px" onfocus="this.style.borderColor='#38bdf8'" onblur="this.style.borderColor='rgba(255,255,255,0.1)';updatePtsCell(this)" onkeydown="if(event.key==='Enter'){this.blur();}" /></td>`;
                    } else {
                        return `<td style="padding:4px 6px;color:#e2e8f0;font-family:monospace;font-size:12px">${val}</td>`;
                    }
                }

                let nameCell = '';
                if (state.editMode && canEditName) {
                    nameCell = `<td style="padding:4px 6px"><input type="text" data-row="${rowIdx}" data-col="name" value="${name}" data-orig="${name}" style="background:transparent;border:1px solid rgba(56,189,248,0.3);color:#38bdf8;font-family:monospace;font-size:12px;width:100%;box-sizing:border-box;outline:none;padding:2px 4px;border-radius:4px" onfocus="this.style.borderColor='#38bdf8'" onblur="this.style.borderColor='rgba(56,189,248,0.3)';updatePtsCell(this)" onkeydown="if(event.key==='Enter'){this.blur();}" /></td>`;
                } else {
                    nameCell = `<td style="padding:4px 6px;color:#38bdf8;font-family:monospace;font-size:12px">${name}</td>`;
                }

                let rowCode = `<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
                    <td style="padding:4px 6px">${idCell}</td>
                    ${nameCell}
                    ${ec(rowIdx, 'x', x)}${ec(rowIdx, 'y', y)}${ec(rowIdx, 'z', z)}${ec(rowIdx, 'a', a)}`;

                if (!isScara) {
                    rowCode += `${ec(rowIdx, 'b', b)}${ec(rowIdx, 'c', c)}`;
                }
                rowCode += `</tr>`;
                return rowCode;
            }).join('');

            let thArr = ['ID', 'Name', 'X', 'Y', 'Z', 'A'];
            if (!isScara) thArr.push('B', 'C');
            const th = thArr.map(h => `<th style="padding:6px;text-align:left;color:#94a3b8;font-size:11px;border-bottom:1px solid rgba(255,255,255,0.08)">${h}</th>`).join('');

            let colgroup = `<colgroup><col style="width:50px"><col style="width:90px"><col style="width:70px"><col style="width:70px"><col style="width:70px">${isScara ? '<col style="width:70px">' : '<col style="width:70px"><col style="width:70px"><col style="width:70px">'}</colgroup>`;

            tableHtml = `<div style="overflow:auto;max-height:100%"><table style="width:100%;border-collapse:collapse">${colgroup}<thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;

            window._ptsLines = lines.slice();
            window._ptsFile = file;
            window._ptsRawCode = rawCode;
            window.updatePtsCell = function (input) {
                const ri = parseInt(input.dataset.row);
                const ck = input.dataset.col;
                let line = window._ptsLines[ri];
                const val = input.value.trim();
                if (ck === 'name') {
                    const origVal = input.dataset.orig;
                    if (origVal && val && origVal !== val) {
                        state.labelOverrides[origVal] = val; // Apply to global rename!
                        input.dataset.orig = val;
                    }
                    line = line.replace(/(Name\s*=\s*)([^;]+)/, `$1${val}`);
                } else {
                    const cm = { x: 0, y: 1, z: 2, a: 3, b: 4, c: 5 };
                    const ci = cm[ck];
                    const cp = line.replace(/^P\[\d+\]\s*=\s*/, '').split(';')[0];
                    const parts = cp.split(',');
                    parts[ci] = ` ${parseFloat(val).toFixed(6)}`;
                    line = line.replace(/(P\[\d+\]\s*=\s*)([^;]+)/, `$1${parts.join(',')}`);
                }
                window._ptsLines[ri] = line;

                if (!state.ptsOverrides) state.ptsOverrides = {};
                if (!state.ptsOverrides[window._ptsFile]) state.ptsOverrides[window._ptsFile] = {};
                const idMatch = line.match(/^P\[(\d+)\]/);
                if (idMatch) {
                    state.ptsOverrides[window._ptsFile][idMatch[1]] = line;
                }
                delete state.userEdits[window._ptsFile];
            };
        }

        // ── UserDefineWarning.jsn (편집 모드: 인라인 input) ──
        else if (file === 'UserDefineWarning.jsn') {
            try {
                const obj = JSON.parse(gen);
                const arr = obj.Warings || obj.Warnings || [];
                const items = [];
                for (let i = 0; i < 16; i++) {
                    items.push({ id: i, text: arr[i] || '', idx: i });
                }

                if (state.editMode) {
                    const rows = items.map(item => {
                        return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
                            <td style="padding:5px 8px;font-size:12px;color:#94a3b8;font-family:monospace">${item.id}</td>
                            <td style="padding:5px 8px"><input type="text" data-idx="${item.idx}" value="${item.text}" style="background:transparent;border:1px solid rgba(255,255,255,0.1);color:#e2e8f0;font-family:monospace;font-size:12px;width:100%;box-sizing:border-box;outline:none;padding:3px 6px;border-radius:4px" onfocus="this.style.borderColor='#38bdf8'" onblur="this.style.borderColor='rgba(255,255,255,0.1)';updateWarningCell(this)" onkeydown="if(event.key==='Enter'){this.blur();}" /></td>
                        </tr>`;
                    }).join('');
                    const th = ['ID', 'Description'].map(h => `<th style="padding:8px 12px;text-align:left;color:#94a3b8;font-size:11px;border-bottom:1px solid rgba(255,255,255,0.08)">${h}</th>`).join('');
                    tableHtml = `<div style="overflow:auto;max-height:100%"><table style="width:100%;border-collapse:collapse"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;

                    window._warningArr = [];
                    for (let i = 0; i < 16; i++) window._warningArr.push(arr[i] || "");

                    window.updateWarningCell = function (input) {
                        const idx = parseInt(input.dataset.idx);
                        window._warningArr[idx] = input.value.trim();
                        if (!state.warningOverrides) state.warningOverrides = {};
                        state.warningOverrides[idx] = window._warningArr[idx];
                        delete state.userEdits['UserDefineWarning.jsn'];
                    };
                } else {
                    const rows = items.map(item => [item.id, item.text]);
                    tableHtml = buildTable(['ID', 'Description'], rows);
                }
            } catch (e) { /* fallback */ }
        }

    } catch (e) { rawCode = 'Error rendering preview: ' + e; }

    // 표가 있으면 표로 표시 (tableContainer 사용)
    if (tableHtml) {
        tableCon.innerHTML = tableHtml;
        tableCon.classList.remove('opacity-0', 'pointer-events-none');
        prismCon.classList.add('opacity-0', 'pointer-events-none');
        editor.classList.add('opacity-0', 'pointer-events-none');
        return;
    }

    // 일반 코드 파일: editMode 따라 전환
    if (state.editMode) {
        editor.value = rawCode;
        tableCon.classList.add('opacity-0', 'pointer-events-none');
        prismCon.classList.add('opacity-0', 'pointer-events-none');
        editor.classList.remove('opacity-0', 'pointer-events-none');
    } else {
        tableCon.classList.add('opacity-0', 'pointer-events-none');
        prismCon.classList.remove('opacity-0', 'pointer-events-none');
        editor.classList.add('opacity-0', 'pointer-events-none');
        codeOut.className = 'language-robot text-sm leading-relaxed';
        codeOut.textContent = rawCode;
        Prism.highlightElement(codeOut);
        editor.value = rawCode;
    }
}


async function exportProj() {
    const zip = new JSZip();
    const name = document.getElementById('prjName').value || state.projectName;
    const root = zip.folder(name);

    function addZFile(f, n) {
        let content = getFinalFileContent(n);
        content = content.replace(/\r?\n/g, '\r\n'); // Force CRLF
        f.file(n, content);
    }

    function addCustomZFile(f, n, n2) {
        let content = getFinalFileContent(n);
        content = content.replace(/\r?\n/g, '\r\n'); // Force CRLF
        f.file(n2, content);
    }

    try {
        addZFile(root, "main.pro");
        addZFile(root, "PLC_internal.pro");
        if (state.options.EnableTcpSpeed) addZFile(root, "PLC_TCP_Speed.pro");
        addZFile(root, "s01_initial.pro");
        addZFile(root, "s02_offset.pro");
        if (state.options.EnableTeachingMode) addZFile(root, "s03_teach_mode.pro");
        if (state.options.EnableToolControl) addZFile(root, "s04_Tool_Control.pro");

        state.steps.forEach(s => {
            addZFile(root, `${s.ProcessName}.pro`);
        });

        const data = root.folder("Data");
        addZFile(data, "BreakPoints.jsn");
        addZFile(data, "JP.pts");
        addZFile(data, "MonitorGlobalVars.jsn");
        addZFile(data, "MonitorVars.jsn");
        addZFile(data, "Labels.jsn");
        addZFile(data, "UserDefineWarning.jsn");
        addZFile(data, "P.pts");

        if (state.options.EnableMultiRecipe) {
            for (let i = 1; i < state.options.RecipeCount; i++) {
                addZFile(data, `P${i.toString().padStart(2, '0')}.pts`);
            }
        }

        addZFile(root, "Remote_IO_mapping.dat");
        // Name changes dynamically based on input
        addCustomZFile(root, `${name}.prj`, `${name}.prj`);

        root.file("InoRobot_IO_Map_0614.xlsx", Assets.IO_Map_Excel, { base64: true });

        const blob = await zip.generateAsync({ type: "blob" });
        saveAs(blob, `${name}.zip`);
        alert(uiText("Project Generation Completed!"));
    } catch (e) {
        console.error(e);
        alert(uiText("Error generating zip."));
    }
}

document.addEventListener("DOMContentLoaded", initApp);
