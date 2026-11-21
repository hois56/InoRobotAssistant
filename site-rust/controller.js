// Generator functions corresponding to C# ProjectGenerator, EasyMode, Labels.
const TemplateHelper = {
    getNow() { return new Date().toLocaleString('sv-SE').replace('T', ' '); },
    amPmFormatter: new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
    getNowAmPm() { return this.amPmFormatter.format(new Date()).replace(',', ''); },
    // P.pts uses the controller/project-generator convention. Do not use
    // toLocaleString here: its language and ordering depend on the PC locale.
    getPFileTime(date = new Date()) {
        const pad = (value) => String(value).padStart(2, '0');
        const hours = date.getHours();
        const meridiem = hours < 12 ? '오전' : '오후';
        const hour12 = hours % 12 || 12;
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${meridiem} ${hour12}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }
};


// The Rust output is embedded when building generator.js so standalone project
// exports and VM callers can use the same synchronous API as the browser.
const ControllerFiles = (() => {
    let engine;
    const decoder = typeof TextDecoder === 'function' ? new TextDecoder() : null;
    function decodeModule(encoded) {
        if (Uint8Array.fromBase64) return Uint8Array.fromBase64(encoded);
        if (typeof atob === 'function') return Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0));

        // Standalone ECMAScript hosts can expose WebAssembly without any web codecs.
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const characters = encoded.replace(/=+$/, '');
        const bytes = new Uint8Array(Math.floor(characters.length * 6 / 8));
        let bits = 0, word = 0, offset = 0;
        for (const character of characters) {
            word = (word << 6) | alphabet.indexOf(character);
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                bytes[offset++] = word >>> bits;
            }
        }
        return bytes;
    }
    function wasm() {
        if (!engine) {
            const encoded = '__SITE_WASM__';
            const bytes = decodeModule(encoded);
            engine = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
        }
        return engine;
    }
    function fields(values) {
        const strings = values.map(String);
        const length = strings.reduce((sum,s) => sum + s.length + 2, 0);
        const e = wasm();
        const ptr = e.fields(length);
        const buffer = new Uint16Array(e.memory.buffer,ptr,length);
        let at=0;
        for (const s of strings) {
            buffer[at++] = s.length;
            buffer[at++] = s.length >>> 16;
            for (let i=0; i<s.length; i++) buffer[at++] = s.charCodeAt(i);
        }
    }
    // Keep only the last model's lookup, as a single export uses it repeatedly.
    let lastTorqueModel, lastTorqueCsv, lastRatios;
    function torqueRatios(robotName) {
        const csv = Assets.Robots_Torque;
        if (robotName === lastTorqueModel && csv === lastTorqueCsv) return lastRatios;
        let ratios = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
        let csvLines = Assets.Robots_Torque.split(/\r?\n/);
        let foundRobot = null;
        for (let i = 1; i < csvLines.length; i++) {
            let cols = csvLines[i].split(',');
            if (cols.length < 6) continue;
            let mName = cols[0].trim();
            if (!mName) continue;

            if (foundRobot && mName !== foundRobot) {
                if (ratios.some(r => r !== 1.0)) break;
            }
            if (robotName.toLowerCase().includes(mName.toLowerCase()) || mName.toLowerCase().includes(robotName.toLowerCase())) {
                foundRobot = mName;
                let axis = cols[1].trim().toUpperCase();
                let ratio = parseFloat(cols[5]) || 1.0;
                if (axis === 'J1') ratios[0] = ratio;
                else if (axis === 'J2') ratios[1] = ratio;
                else if (axis === 'J3') ratios[2] = ratio;
                else if (axis === 'J4') ratios[3] = ratio;
                else if (axis === 'J5') ratios[4] = ratio;
                else if (axis === 'J6') ratios[5] = ratio;
            }
        }
        lastTorqueModel = robotName;
        lastTorqueCsv = csv;
        return lastRatios = ratios.map(r => r.toFixed(3));
    }
    const trayFiles = new Set(['offset_program','tray_function','labels_file','warning_file']);
    const waitFiles = new Set(['process_program','initial_program','teach_program','points_file']);
    function generate(kind, steps, o = {}, parameters = []) {
        const e = wasm();
        const scara = (kind === 'labels_file' || kind === 'current_torque' || (kind === 'plc_program' && o.EnableTorque))
            && Generator.IsScara(o.RobotName);
        const flags = [o.EnableTeachingMode,o.EnableToolControl,o.EnableMultiRecipe,o.EnableTcpSpeed,o.EnableTorque,
            o.EnableWaitPos !== false,o.EnableProcessBusy !== false,o.ToolControlType === 'DIO',o.PreserveProcessNumbers,scara]
            .reduce((bits,value,i) => bits | (Boolean(value) << i), 0);
        const payload = kind === 'main_program' ? Number(String(o.RobotName).match(/IR-(?:TS|[RS])(\d+)/i)?.[1] ?? 7) : 0;
        e.start_plan(flags, o.RecipeCount || 0, payload);
        for (const s of steps) {
            const values = [s.WorkType,s.WorkMethod,s.ToolType,s.ProcessName,s.VisionUse];
            if (trayFiles.has(kind) && Generator.IsTray(s)) {
                const tray = Generator.TraySettings(s);
                if (tray[0]*tray[1]>1) values.push(...tray);
            }
            fields(values);
            e.add_step(s.No, waitFiles.has(kind) ? Generator.ExtraWaitCount(s) : 0, s.StageSlot || 0);
        }
        fields(parameters);
        const length = e[kind]();
        if (decoder) return decoder.decode(new Uint8Array(e.memory.buffer,e.generated_ptr(),length));
        // A bare ECMAScript VM may supply WebAssembly without Web text codecs.
        const units = e.result_utf16();
        const ptr = e.fields(units);
        const buffer = new Uint16Array(e.memory.buffer,ptr,units);
        let text = '';
        for (let i=0; i<units; i+=8192) text += String.fromCharCode(...buffer.subarray(i,i+8192));
        return text;
    }
    return { generate, torqueRatios };
})();

const Generator = {
    MAX_EXTRA_WAIT_COUNT: 8,

    StageSlots(steps) {
        return steps.filter(s => s.WorkType === 'Stage').map((s, i) => s.StageSlot || i + 1);
    },

    ExtraWaitCount(step) {
        const count = step.ExtraWaitCount ?? 0;
        if (!Number.isInteger(count) || count < 0 || count > Generator.MAX_EXTRA_WAIT_COUNT) {
            throw new Error('Extra wait positions must be an integer from 0 to 8.');
        }
        return count;
    },

    IsTray(step) {
        return step.WorkType === 'Tray' && (step.WorkMethod === 'Get' || step.WorkMethod === 'Put');
    },

    UsesTrayOffset(step) {
        if (!Generator.IsTray(step)) return false;
        const [x, y] = Generator.TraySettings(step);
        return x * y > 1;
    },

    TraySettings(step) {
        const count = (value) => value === undefined ? 3 : Number(value);
        const pitch = (value) => value === undefined ? -58 : Number(value);
        const settings = [count(step.TrayXCount), count(step.TrayYCount), pitch(step.TrayPitchX), pitch(step.TrayPitchY)];
        if (!settings.slice(0, 2).every(value => Number.isInteger(value) && value >= 0) || !settings.slice(2).every(Number.isFinite)) {
            throw new Error('Tray counts must be non-negative integers and pitches must be finite numbers.');
        }
        return settings;
    },

    Header(robotName, timeFunc = "getNowAmPm") {
        return `ProgramInfo\n    Version = "S4.24"\n    VRC = "V4R24"\n    Time = "${TemplateHelper[timeFunc]()}"\n    RobotName = "${robotName}"\nEndProgramInfo\n`;
    },

    IsScara(robotName) {
        return Assets.Robots_6_axis.split(/\r?\n/).some(line => {
            let cols = line.split(',');
            return cols.length >= 4 && (cols[0].trim() + cols[1].trim() + cols[2].trim() + cols[3].trim()) === robotName;
        });
    },

    ToolNo(step) {
        if (Generator.IsPeeling(step)) return 1;
        return (step.ToolType === "Gripper" || step.WorkType === "Trash") ? 2 : 1;
    },

    IsPeeling(step) {
        return step.WorkType === "Peeling" || step.WorkMethod === "Peeling";
    },

    UsesVisionOffset(step) {
        return step.VisionUse === "Use - IO" || (step.WorkType === "Vision" && step.WorkMethod === "Calibration" && step.ToolType !== "Vision (Socket)");
    },

    UsesVisionSocket(step) {
        return step.VisionUse === "Use - Socket" || (step.WorkType === "Vision" && step.WorkMethod === "Calibration" && step.ToolType === "Vision (Socket)");
    },

    LastWaitOffset(step) {
        return 1 + Generator.ExtraWaitCount(step);
    },


    TrayOffsetFunction(steps) { return ControllerFiles.generate('tray_function',steps); },
    OffsetCode(step, indent = "    ") { return ControllerFiles.generate('step_offset',[step],{},[indent]); },
    SocketExchange(step, indent = "    ", message = "Shot") {
        return ControllerFiles.generate('socket_exchange',[],{},[indent,message]);
    },
    CurrentTorqueFunction(robotName) {
        return ControllerFiles.generate('current_torque',[],{RobotName:robotName},ControllerFiles.torqueRatios(robotName));
    },
    TcpSpeedProgram(robotName) {
        return Generator.Header(robotName) + ControllerFiles.generate('tcp_program',[]);
    },
    TorqueProgram(robotName) { return Generator.PLCInternalProgram({RobotName:robotName,EnableTorque:true}); },
    PLCInternalProgram(options) {
        return Generator.Header(options.RobotName) + ControllerFiles.generate('plc_program',[],options,
            options.EnableTorque ? ControllerFiles.torqueRatios(options.RobotName) : []);
    },
    ToolControlProgram(options,steps) {
        return options.EnableToolControl ? Generator.Header(options.RobotName,"getNow") +
            ControllerFiles.generate('tool_program',steps,options) : null;
    },
    OffsetProgram(steps,options) { return Generator.Header(options.RobotName) + ControllerFiles.generate('offset_program',steps,options); },
    TeachModeProgram(steps,options) { return Generator.Header(options.RobotName) + ControllerFiles.generate('teach_program',steps,options); },
    MainProgram(steps,options) { return Generator.Header(options.RobotName) + ControllerFiles.generate('main_program',steps,options); },
    InitialProgram(steps,options) { return Generator.Header(options.RobotName) + ControllerFiles.generate('initial_program',steps,options); },
    ProcessProgram(s,options,stageIndex,sim=null) {
        const stage = stageIndex === 1 ? 'Stage' : 'Stage'+stageIndex;
        const vision = options.VisionConfigs?.[s.id] || options.VisionConfigs?.[s.No-1]
            || {IsClient:true,IpAddress:"192.168.1.10",Port:"5000"};
        let simulatedActions = '';
        if (sim && !options.EnableToolControl) {
            const delay = Generator.SimulationDelay(sim.ToolTime);
            const actions = Generator.SimulationToolActions(s,stage);
            if (delay && actions.length) {
                const rule = '    #================================================================================\n';
                simulatedActions = rule + '    #  Tool (PLC) - simulation time\n' + rule
                    + actions.map(action => delay.trimEnd() + ' # ' + action + '\n').join('');
            }
        }
        return Generator.Header(options.RobotName) + ControllerFiles.generate('process_program',[s],options,[
            stage, Number(Boolean(vision.IsClient)), vision.IpAddress, vision.Port, Number(Boolean(sim)),
            sim ? Generator.SimulationDelay(sim.VisionTime,"Simulation vision time") : '', simulatedActions, sim?.PeelSpeed
        ]);
    },
    DataPoints(steps,options,fileName="P.pts") {
        return Generator.Header(options.RobotName,"getPFileTime") + ControllerFiles.generate('points_file',steps,options,[fileName]);
    },
    DataWarning(steps,options) { return ControllerFiles.generate('warning_file',steps,options); },
    DataPrj(steps,options) { return ControllerFiles.generate('project_file',steps,options); },
    LabelsJson(steps,options) { return ControllerFiles.generate('labels_file',steps,options); },
    RobPointMapping(options) { return ControllerFiles.generate('point_mapping',[],options,[options.RobotName,TemplateHelper.getNow()]); },
    RemoteIOInfo(options) {
        let t = Assets.RemoteIO.replace(/Time="[^"]*"/, `Time="${TemplateHelper.getNow()}"`);
        t = t.replace(/RobotName="[^"]*"/, `RobotName="${options.RobotName}"`);
        return t;
    },

    // ================================================================================
    //  Simulation project: same motion statements, no PLC handshake or IO waits.
    //  Tool/vision feedback becomes a configured Delay so cycle time stays realistic.
    // ================================================================================
    SIMULATION_DEFAULTS: Object.freeze({ Sequence: "", Cycles: 3, SpeedRate: 100, ToolTime: 0.2, VisionTime: 0.3, TrayCell: 1, PeelSpeed: 100 }),
    SIMULATION_CYCLE_VARIABLE: "D[20]",

    SimulationSettings(steps, options, input = {}) {
        const value = { ...Generator.SIMULATION_DEFAULTS, ...input };
        const number = (key, min, max, integer, message) => {
            const raw = value[key];
            const parsed = typeof raw === "string" && raw.trim() === "" ? NaN : Number(raw);
            if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) throw new Error(message);
            return parsed;
        };
        if (!steps.length) throw new Error("Add at least one process.");
        const settings = {
            Cycles: number("Cycles", 1, 100, true, "Simulation cycles must be an integer from 1 to 100."),
            SpeedRate: number("SpeedRate", 1, 100, true, "Simulation speed must be an integer from 1 to 100 %."),
            ToolTime: number("ToolTime", 0, 60, false, "Tool and vision times must be from 0 to 60 seconds."),
            VisionTime: number("VisionTime", 0, 60, false, "Tool and vision times must be from 0 to 60 seconds."),
            TrayCell: number("TrayCell", 1, 10000, true, "The tray cell must be a positive integer within every tray process."),
            PeelSpeed: number("PeelSpeed", 1, 5000, false, "Peeling speed must be from 1 to 5000 mm/s.")
        };
        const hasWait = options.EnableWaitPos !== false;
        const text = String(value.Sequence ?? "").trim();
        const tokens = text ? text.split(/[\s,]+/).filter(Boolean) : steps.map(s => String(s.No));
        if (tokens.length > 100) throw new Error("The process order can contain up to 100 calls.");
        settings.Sequence = tokens.map(token => {
            const match = token.match(/^(\d+)([Ww])?$/);
            const step = match && steps.find(s => s.No === Number(match[1]));
            if (!step) throw new Error("Use process numbers from the list in the process order, for example 1, 2W, 2.");
            if (match[2] && !hasWait) throw new Error("Wait calls (W) need the Wait Position option.");
            return { No: step.No, Wait: Boolean(match[2]) };
        });
        steps.filter(Generator.UsesTrayOffset).forEach(s => {
            const [x, y] = Generator.TraySettings(s);
            if (settings.TrayCell > x * y) throw new Error("The tray cell must be a positive integer within every tray process.");
        });
        return settings;
    },

    SimulationDelay(seconds, comment = "") {
        const value = Number(seconds);
        if (!(value > 0)) return "";
        return `    Delay T[${Number(value.toFixed(3))}];${comment ? ` # ${comment}` : ""}\n`;
    },

    // Tool actions the PLC performs for a process when the robot does not control the tool.
    SimulationToolActions(s, stagePrefix) {
        if (s.WorkType === "Trash") return ["Trash_Grip", "Tool_Vac_OFF", "Trash_Ungrip"];
        if (Generator.IsPeeling(s)) return ["Tool_Grip"];
        const stage = s.WorkType === "Stage";
        if (s.WorkMethod === "Get") {
            const pick = s.ToolType === "Vacuum" ? "Tool_Vac_ON" : s.ToolType === "Gripper" ? "Tool_Grip" : null;
            return pick ? [pick, ...(stage ? [`${stagePrefix}_Vac_OFF`] : [])] : [];
        }
        if (s.WorkMethod === "Put") {
            const release = s.ToolType === "Vacuum" ? "Tool_Vac_OFF" : s.ToolType === "Gripper" ? "Tool_Ungrip" : null;
            return release ? [...(stage ? [`${stagePrefix}_Vac_ON`] : []), release] : [];
        }
        return [];
    },

    SimulationMainProgram(steps, options, sim) {
        let sb = Generator.Header(options.RobotName);
        sb += `Include "s01_initial.pro";\nInclude "s02_offset.pro";\n`;
        if (options.EnableToolControl) sb += `Include "s04_Tool_Control.pro";\n`;
        steps.forEach(s => sb += `Include "${s.ProcessName}.pro";\n`);
        const payloadMatch = options.RobotName.match(/IR-(?:TS|[RS])(\d+)/i);
        const payload = payloadMatch ? parseInt(payloadMatch[1]) : 7;
        const calls = sim.Sequence.map(entry => {
            const s = steps.find(step => step.No === entry.No);
            return `        ${s.ProcessName}.P${s.No}_pos(${entry.Wait ? 1 : 0}); #P${s.No} ${entry.Wait ? "Wait" : "Work"}\n`;
        }).join("");
        const cycleTime = Generator.SIMULATION_CYCLE_VARIABLE;
        sb += `Start;\n    Int cycle;\n    #================================================================================\n    #  Simulation - Initial (no PLC signals)\n    #================================================================================\n    If Tool[1].TLoad.Mass == 0 \n        Tool[1].TLoad.Mass = ${payload};\n    EndIf;\n    If R_Cur_pos < 1\n        R_Cur_pos = 1; #Unknown start position = Home\n    EndIf;\n    s01_initial.Init_move_home();\n    Velset Rate[${sim.SpeedRate}];\n    #================================================================================\n    #  Simulation - Cycle (TimeStart(0) ~ TimeOut(0) = 1 cycle)\n    #================================================================================\n    For cycle=1,cycle<=${sim.Cycles},Step[1]\n        TimeStart(0);\n${calls}        TimeOut(0,${cycleTime});\n        Print "Simulation cycle " + cycle + " : " + ${cycleTime} + " s";\n    EndFor;\n    Print "Simulation End";\nEnd;\n`;
        return sb;
    },

    SimulationInitialProgram(steps, options) {
        const initSignal = `#====================================================================================\n#  Init Signal\n#====================================================================================\nFunc Init_signal()\n    Clear Out[520],120; #[520] ~ [639]\nEndFunc;\n`;
        const code = Generator.InitialProgram(steps, { ...options, EnableMultiRecipe: false });
        if (!code.includes(initSignal)) throw new Error("Initial program template changed; update the simulation output.");
        return code.replace(initSignal, "");
    },

    SimulationOffsetProgram(steps, options, sim) {
        const trays = steps.filter(Generator.UsesTrayOffset);
        let sb = `${Generator.Header(options.RobotName)}Func Set_PR()\n    #================================================================================\n    #  Offset - simulation (PLC, vision and teaching offsets are zero)\n    #================================================================================\n    PR[B_PR] = (0,0,0,0,0,0);\n`;
        if (trays.length) {
            sb += `    Switch B_Cur_process\n`;
            trays.forEach(s => sb += `        Case ${s.No}: # P${s.No} - ${s.WorkType} ${s.WorkMethod}\n            Set_tray_offset();\n            Break;\n`);
            sb += `    EndSwitch;\n`;
        }
        sb += `EndFunc;\n`;
        const tray = Generator.TrayOffsetFunction(steps);
        if (tray) {
            const source = "    Int num = xwTray_index - 1;";
            if (!tray.includes(source)) throw new Error("Tray offset template changed; update the simulation tray cell.");
            sb += tray.replace(source, `    Int num = ${sim.TrayCell - 1}; # Simulation tray cell ${sim.TrayCell}`);
        }
        return sb;
    },

    SimulationToolControlProgram(options, steps, sim) {
        if (!options.EnableToolControl) return null;
        let hasVacuum = false, hasGripper = false, hasTrash = false;
        steps.forEach(s => {
            if (s.ToolType === "Vacuum") hasVacuum = true;
            if (s.ToolType === "Gripper" || Generator.IsPeeling(s)) hasGripper = true;
            if (s.WorkType === "Trash") hasTrash = true;
        });
        if (hasTrash) hasVacuum = true;
        const outSuff = options.ToolControlType === "DIO" ? "" : "_REQ";
        const delay = Generator.SimulationDelay(sim.ToolTime, "Simulation tool time");
        // Outputs stay so simulated equipment can react; the feedback Wait becomes a Delay.
        const func = (name, off, on) => `#====================================================================================\nFunc ${name}()\n    Set ${off}${outSuff},OFF;\n    Set ${on}${outSuff},ON;\n${delay}    Set ${on}${outSuff},OFF;\nEndFunc;\n`;
        let sb = Generator.Header(options.RobotName, "getNow");
        if (hasVacuum) sb += func("Tool_Vac_ON", "yTool_vac_off", "yTool_vac_on") + func("Tool_Vac_OFF", "yTool_vac_on", "yTool_vac_off");
        if (hasGripper) sb += func("Tool_Grip", "yTool_ungrip", "yTool_grip") + func("Tool_Ungrip", "yTool_grip", "yTool_ungrip");
        if (hasTrash) sb += func("Trash_Grip", "yTrash_ungrip", "yTrash_grip") + func("Trash_Ungrip", "yTrash_grip", "yTrash_ungrip");
        for (const i of Generator.StageSlots(steps)) {
            const prefix = i === 1 ? "Stage" : `Stage${i}`;
            sb += func(`${prefix}_Vac_ON`, `y${prefix}_vac_off`, `y${prefix}_vac_on`) + func(`${prefix}_Vac_OFF`, `y${prefix}_vac_on`, `y${prefix}_vac_off`);
        }
        return sb;
    },

    // Program files of the simulation project, in the order they are declared in the .prj.
    SimulationProgramFiles(steps, options, sim) {
        const files = {
            "main.pro": Generator.SimulationMainProgram(steps, options, sim),
            "s01_initial.pro": Generator.SimulationInitialProgram(steps, options),
            "s02_offset.pro": Generator.SimulationOffsetProgram(steps, options, sim)
        };
        const tool = Generator.SimulationToolControlProgram(options, steps, sim);
        if (tool) files["s04_Tool_Control.pro"] = tool;
        let stageIndex = 0;
        steps.forEach(s => {
            if (s.WorkType === "Stage") stageIndex++;
            files[`${s.ProcessName}.pro`] = Generator.ProcessProgram(s, options, s.StageSlot || stageIndex, sim);
        });
        return files;
    },

    SimulationProjectInfo(programFiles) {
        return `{\n  "FileType": "RobotProjectConfigFile",\n  "Company": "Inovance",\n  "MajorVersion": 2,\n  "MinorVersion": 1,\n  "IsMainActive": true,\n  "MultiTaskCount": 0,\n  "MultiTaskInfos": [],\n  "ProgramFilesCount": ${programFiles.length},\n  "ProgramFiles": [\n${programFiles.map(p => `    "${p}"`).join(',\n')}\n  ],\n  "RobPointFilesCount": 1,\n  "RobPointFiles": [\n    "P.pts"\n  ]\n}`;
    }
};
