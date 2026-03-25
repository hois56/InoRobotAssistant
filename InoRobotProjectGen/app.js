const WorkTypes = ["Tray", "Stage", "MCR", "Vision", "Trash"]; // Peeling removed from type
const WorkMethods = ["Get", "Put", "Check", "Calibration", "Peeling"];
const ToolTypes = ["Vacuum", "Gripper", "PLC (IO)", "Vision (Socket)"];
const VisionUses = ["No use", "Use - IO", "Use - Socket"];

class ProcessStep {
    constructor(no) {
        this.No = no;
        this.WorkType = "Tray";
        this.WorkMethod = "Get";
        this.ToolType = "Vacuum";
        this.VisionUse = "No use";
        this._customName = null;
    }
    get ProcessName() { return this._customName || `sP${String(this.No).padStart(2, '0')}_${this.WorkType}_${this.WorkMethod}`; }
    set ProcessName(val) { this._customName = val; }
}

const state = {
    projectName: "InoRobot_Pro_New",
    steps: [],
    options: {
        RobotName: "IR-R10-140S5-D1NH-INT_01741041",
        EnableMultiRecipe: false,
        RecipeCount: 2,
        EnableTcpSpeed: false,
        EnableTorque: false,
        EnableToolControl: false,
        VisionConfigs: {} // idx -> { IsClient, IpAddress, Port }
    },
    userEdits: {}, // { filename: "edited code without ProgramInfo" }
    editMode: false
};

function initApp() {
    initRobots();
    addStep();
    document.getElementById('btnAdd').onclick = addStep;
    document.getElementById('btnGenerate').onclick = exportProj;
    
    // Name validation
    document.getElementById('prjName').addEventListener('input', function(e) {
        this.value = this.value.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 16);
        state.projectName = this.value || "InoRobot_Pro_New";
        uSelector();
    });

    document.getElementById('chkMultiRecipe').onchange = (e) => {
        state.options.EnableMultiRecipe = e.target.checked;
        document.getElementById('numRecipeCount').disabled = !e.target.checked;
        uSelector();
    };

    document.getElementById('btnApplyOptions').onclick = () => {
        state.options.EnableTcpSpeed = document.getElementById('chkTcpSpeed').checked;
        state.options.EnableTorque = document.getElementById('chkTorque').checked;
        state.options.EnableToolControl = document.getElementById('chkToolControl').checked;
        let pCount = parseInt(document.getElementById('numRecipeCount').value) || 2;
        state.options.RecipeCount = Math.min(127, Math.max(2, pCount));
        state.options.RobotName = document.getElementById('cmbRobotModel').value;
        document.getElementById('optionsModal').classList.add('hidden');
        renderSteps(); 
    };

    document.getElementById('btnOption').onclick = () => document.getElementById('optionsModal').classList.remove('hidden');
    
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

    updatePreview();
    if(window.lucide) lucide.createIcons();
}

function initRobots() {
    let cmb = document.getElementById('cmbRobotModel');
    let csvs = [Assets.Robots_SCARA, Assets.Robots_6_axis];
    csvs.forEach(csv => {
        let lines = csv.split(/\r?\n/);
        for(let i=0; i<lines.length; i++) {
            let cols = lines[i].split(',');
            if(cols.length >= 4) {
                let name = cols[0].trim()+cols[1].trim()+cols[2].trim()+cols[3].trim();
                let opt = document.createElement('option');
                opt.value = name;
                opt.text = cols[1].trim();
                cmb.appendChild(opt);
            }
        }
    });
    cmb.value = state.options.RobotName;
}

function addStep() {
    if (state.steps.length >= 15) { alert("Max 15 processes."); return; }
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

window.uStep = function(idx, field, val) {
    state.steps[idx][field] = val;
    updateRowRules(state.steps[idx]);
    let s = state.steps[idx];
    if ((s.WorkMethod === "Check" && s.VisionUse === "Use - Socket") || (s.WorkMethod === "Calibration" && s.ToolType === "Vision (Socket)")) {
        openVisionModal(idx);
    }
    renderSteps();
}

// Modal hook for editing Name
window.openNameModal = function(idx) {
    document.getElementById('editNameIdx').value = idx;
    document.getElementById('editNameInput').value = state.steps[idx].ProcessName;
    document.getElementById('nameModal').classList.remove('hidden');
};

document.getElementById('btnApplyName').onclick = () => {
    let idx = parseInt(document.getElementById('editNameIdx').value);
    let val = document.getElementById('editNameInput').value.trim();
    if(val) state.steps[idx].ProcessName = val;
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
    let header = `ProgramInfo\n    Version = "S4.24"\n    VRC = "V4R24"\n    Time = "${TemplateHelper.getNowAmPm()}"\n    RobotName = "${robotName}"\nEndProgramInfo\n`;
    // Data files use getNow() format, but getNowAmPm() is mostly ok. Wait, we don't prepend header blindly to Javascript data files.
    // The generator should continue to produce full strings, we just strip them for Editor.
    return header + codeStr;
}

function handleGeneratedContent(file) {
    // Generate the raw code using Generator
    let code = "";
    if (file === "main.pro") code = Generator.MainProgram(state.steps, state.options);
    else if (file === "s01_initial.pro") code = Generator.InitialProgram(state.steps, state.options);
    else if (file === "s02_Tool_Control.pro") code = Generator.ToolControlProgram(state.options, state.steps);
    else if (file === "PLC_TCP_Speed.pro") code = Generator.TcpSpeedProgram(state.options.RobotName);
    else if (file === "PLC_Current_Torque.pro") code = Generator.TorqueProgram(state.options.RobotName);
    else if (file === "RemoteIO_mapping.dat") code = Generator.RemoteIOInfo(state.options);
    else if (file === "Labels.jsn") code = Generator.LabelsJson(state.steps, state.options);
    else if (file === "UserDefineWarning.jsn") code = Generator.DataWarning(state.steps, state.options);
    else if (file === "BreakPoints.jsn") code = '{\n  "ProgramsCount": 0,\n  "ProgramsBreaks": []\n}';
    else if (file === "MonitorGlobalVars.jsn") code = '["ywCur_process_sel","xwSet_speed","B_T_num","B_W_num","yRobot_homing","R_Cur_pos","xProcess_start","xProcess_exit","xProcess_restart","xwSet_offset_X.Int","xwSet_offset_Y.Int","xwSet_offset_Z.Int","xwP_file_switch"]';
    else if (file === "MonitorVars.jsn") code = "";
    else if (file === "JP.pts") code = `ProgramInfo\n    Version = "S4.24"\n    VRC = "V4R24"\n    Time = "${TemplateHelper.getNow()}"\n    RobotName = "${state.options.RobotName}"\nEndProgramInfo\n`;
    else if (file.endsWith(".pts")) { // DataPoints
        code = Generator.DataPoints(state.steps, state.options);
    }
    else if (file.endsWith(".prj")) code = Generator.DataPrj(state.steps, state.options, file.replace(/\.prj$/, ''));
    else if (file && file.startsWith("sP")) {
        const stepName = file.replace(".pro", "");
        let stageIdx = 0;
        state.steps.forEach(s => { if(s.WorkType==="Stage") stageIdx++; if(s.ProcessName===stepName) code = Generator.ProcessProgram(s, state.options, stageIdx); });
    }
    
    return code;
}

function getFinalFileContent(file) {
    let generated = handleGeneratedContent(file);
    let edited = state.userEdits[file];
    
    if (edited !== undefined) {
        // If it was edited, it doesn't have a header. Append it back if it's a program file that originally had a header.
        if (generated.includes("ProgramInfo")) {
            // Restore header using current options
            let header = `ProgramInfo\n    Version = "S4.24"\n    VRC = "V4R24"\n    Time = "${TemplateHelper.getNowAmPm()}"\n    RobotName = "${state.options.RobotName}"\nEndProgramInfo\n`;
            if (file.endsWith(".pts")) {
                header = `ProgramInfo\n    Version = "S4.24"\n    VRC = "V4R24"\n    Time = "${TemplateHelper.getNow()}"\n    RobotName = "${state.options.RobotName}"\nEndProgramInfo\n`;
            }
            return header + edited;
        }
        return edited;
    }
    return generated;
}

function toggleEditMode() {
    state.editMode = !state.editMode;
    const btn = document.getElementById('btnToggleEdit');
    const prismCon = document.getElementById('prismContainer');
    const editor = document.getElementById('codeEditor');
    
    if (state.editMode) {
        btn.classList.replace('bg-slate-700', 'bg-blue-600');
        btn.classList.add('shadow-lg', 'shadow-blue-600/20');
        prismCon.classList.add('opacity-0', 'pointer-events-none');
        editor.classList.remove('opacity-0', 'pointer-events-none');
    } else {
        btn.classList.replace('bg-blue-600', 'bg-slate-700');
        btn.classList.remove('shadow-lg', 'shadow-blue-600/20');
        prismCon.classList.remove('opacity-0', 'pointer-events-none');
        editor.classList.add('opacity-0', 'pointer-events-none');
        updatePreview();
    }
}

function renderSteps() {
    const list = document.getElementById('stepsList');
    list.innerHTML = '';
    document.getElementById('processCount').innerText = `${state.steps.length} / 15`;
    state.steps.forEach((s, idx) => {
        const el = document.createElement('div');
        el.className = 'flex items-center gap-2 p-3 bg-slate-900/40 border border-slate-700/50 rounded-xl max-w-full overflow-hidden';
        
        let mOpts = [];
        if(s.WorkType === "Trash") mOpts.push("Put");
        else {
            mOpts.push("Get", "Put");
            if(s.WorkType === "Stage") mOpts.push("Peeling");
            if(s.WorkType === "MCR" || s.WorkType === "Vision") mOpts.push("Check");
            if(s.WorkType === "Vision") mOpts.push("Calibration");
        }

        let tOpts = [];
        if(s.WorkType === "Trash") tOpts.push("Gripper");
        else if(s.WorkMethod === "Calibration") tOpts.push("PLC (IO)", "Vision (Socket)");
        else tOpts.push("Vacuum", "Gripper");

        let vOpts = [];
        if(s.WorkType === "Trash" || s.WorkMethod === "Calibration") vOpts.push("No use");
        else if(s.WorkType === "Vision" && s.WorkMethod === "Check") vOpts.push("Use - IO", "Use - Socket");
        else vOpts.push("No use", "Use - IO", "Use - Socket");

        let disM = s.WorkType === "Trash" ? "disabled" : "";
        let disT = (s.WorkType === "Peeling" || s.WorkMethod === "Peeling" || s.WorkType === "Trash") ? "disabled" : "";
        let disV = (s.WorkType === "Trash" || s.WorkMethod === "Calibration") ? "disabled" : "";

        el.innerHTML = `
            <div class="w-6 h-6 rounded bg-blue-600 flex-shrink-0 flex items-center justify-center font-bold text-xs">${s.No}</div>
            <button onclick="window.openNameModal(${idx})" class="w-10 h-8 rounded bg-slate-800 border border-slate-600 flex items-center justify-center hover:bg-slate-700"><i data-lucide="more-horizontal" class="w-4 h-4 text-slate-400"></i></button>
            <select onchange="window.uStep(${idx}, 'WorkType', this.value)" class="flex-1 min-w-0 bg-slate-800 border-slate-600 rounded text-sm px-1 py-1 text-slate-300">${WorkTypes.map(t=>`<option ${s.WorkType===t?'selected':''}>${t}</option>`).join('')}</select>
            <select onchange="window.uStep(${idx}, 'WorkMethod', this.value)" ${disM} class="flex-1 min-w-0 bg-slate-800 border-slate-600 rounded text-sm px-1 py-1 text-slate-300">${mOpts.map(m=>`<option ${s.WorkMethod===m?'selected':''}>${m}</option>`).join('')}</select>
            <select onchange="window.uStep(${idx}, 'ToolType', this.value)" ${disT} class="flex-1 min-w-0 bg-slate-800 border-slate-600 rounded text-sm px-1 py-1 text-slate-300">${tOpts.map(t=>`<option ${s.ToolType===t?'selected':''}>${t}</option>`).join('')}</select>
            <select onchange="window.uStep(${idx}, 'VisionUse', this.value)" ${disV} class="flex-1 min-w-0 bg-slate-800 border-slate-600 rounded text-sm px-1 py-1 text-slate-300">${vOpts.map(v=>`<option ${s.VisionUse===v?'selected':''}>${v}</option>`).join('')}</select>
            <button onclick="window.rStep(${idx})" class="text-slate-500 hover:text-red-400 font-bold ml-1 w-6 h-6 flex items-center justify-center">X</button>
        `;
        list.appendChild(el);
    });
    uSelector();
    updatePreview();
    if(window.lucide) lucide.createIcons();
}

function uSelector() {
    const sel = document.getElementById('fileSelector');
    const cur = sel.value;
    
    let mainOpts = `<option>main.pro</option><option>s01_initial.pro</option>`;
    if (state.options.EnableToolControl) mainOpts += `<option>s02_Tool_Control.pro</option>`;
    if (state.options.EnableTcpSpeed) mainOpts += `<option>PLC_TCP_Speed.pro</option>`;
    if (state.options.EnableTorque) mainOpts += `<option>PLC_Current_Torque.pro</option>`;
    
    let pOpts = state.steps.map(s => `<option>${s.ProcessName}.pro</option>`).join('');
    
    let dOpts = `<option>Labels.jsn</option><option>RemoteIO_mapping.dat</option><option>UserDefineWarning.jsn</option><option>BreakPoints.jsn</option><option>MonitorGlobalVars.jsn</option><option>MonitorVars.jsn</option><option>JP.pts</option><option>P.pts</option>`;
    if (state.options.EnableMultiRecipe) {
        for(let i=1; i<state.options.RecipeCount; i++) {
            dOpts += `<option>P${i.toString().padStart(2, '0')}.pts</option>`;
        }
    }
    
    let rootOpts = `<option>${state.projectName}.prj</option>`;

    sel.innerHTML = `<optgroup label="Main">${mainOpts}</optgroup>
                     <optgroup label="Process">${pOpts}</optgroup>
                     <optgroup label="Data">${dOpts}</optgroup>
                     <optgroup label="Project">${rootOpts}</optgroup>`;
                     
    if (Array.from(sel.options).some(o => o.value === cur)) sel.value = cur;
}

function updatePreview() {
    const file = document.getElementById('fileSelector').value;
    const editor = document.getElementById('codeEditor');
    
    // We get either user edited version or newly generated version
    let rawCode = "";
    try {
         // Get the string representing the code (strip header if it exists and hasn't been edited, or return the user edited stripped version)
         let gen = handleGeneratedContent(file);
         let existingEdit = state.userEdits[file];
         
         if (existingEdit !== undefined) rawCode = existingEdit;
         else rawCode = stripHeader(gen); // Auto-hide header for preview
    } catch(e) { rawCode = "Error rendering preview: " + e; }

    editor.value = rawCode;
    document.getElementById('codeOutput').textContent = rawCode;
    Prism.highlightElement(document.getElementById('codeOutput'));
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
        addZFile(root, "s01_initial.pro");
        if(state.options.EnableToolControl) addZFile(root, "s02_Tool_Control.pro");
        if(state.options.EnableTcpSpeed) addZFile(root, "PLC_TCP_Speed.pro");
        if(state.options.EnableTorque) addZFile(root, "PLC_Current_Torque.pro");
        
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
        
        if(state.options.EnableMultiRecipe) {
            for(let i=1; i<state.options.RecipeCount; i++) {
                addZFile(data, `P${i.toString().padStart(2, '0')}.pts`);
            }
        }
        
        addZFile(root, "RemoteIO_mapping.dat");
        // Name changes dynamically based on input
        addCustomZFile(root, `${name}.prj`, `${name}.prj`);
        
        root.file("InoRobot_IO_Map_V24.C4.01.xlsx", Assets.IO_Map_Excel, {base64: true});

        const blob = await zip.generateAsync({type:"blob"});
        saveAs(blob, `${name}.zip`);
        alert("Project Generation Completed!");
    } catch(e) {
        console.error(e);
        alert("Error generating zip: " + e.message);
    }
}

document.addEventListener("DOMContentLoaded", initApp);
