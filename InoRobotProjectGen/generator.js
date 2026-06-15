// Generator functions corresponding to C# ProjectGenerator, EasyMode, Labels.
const TemplateHelper = {
    getNow() { return new Date().toLocaleString('sv-SE').replace('-', '-').replace('T', ' '); },
    getNowAmPm() { return new Date().toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).replace(',', ''); }
};

const Generator = {
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
        return step.VisionUse === "Use - IO" || (step.WorkType === "Vision" && step.WorkMethod === "Calibration");
    },

    LastWaitOffset(step) {
        return 1 + (step.ExtraWaitCount || 0);
    },

    OffsetCode(step, indent = "    ") {
        const n = step.No;
        if (n > 10) {
            return `${indent}PR[B_PR] = (0,0,0,0,0,0);\n`;
        }

        let code = "";
        if (Generator.UsesVisionOffset(step)) {
            code += `${indent}LPR[B_PR] = (xwVision_offset_X.Int/10000,xwVision_offset_Y.Int/10000,0,xwVision_offset_A.Int/10000,0,0);\n`;
        }
        code += `${indent}PR[B_PR] = (xwOffset_${n}_X.Int/10000,xwOffset_${n}_Y.Int/10000,xwOffset_${n}_Z.Int/10000,xwOffset_${n}_A.Int/10000,0,0);\n`;
        if (Generator.UsesVisionOffset(step)) {
            code += `${indent}PR[B_PR] = PR[B_PR] + LPR[B_PR];\n`;
        } else if (step.VisionUse === "Use - Socket" && step.WorkMethod !== "Check" && step.WorkMethod !== "Calibration") {
            code += `${indent}PR[B_PR] = PR[B_PR] + PR[0];\n`;
        }
        return code;
    },

    SocketExchange(step, indent = "    ", message = "Shot") {
        return `${indent}Connect_socket();\n${indent}Send_data("${message}");\n${indent}Str[0] = Receive_data();\n${indent}LB[0] = StrGetData(Str[0],",",LD[0]);\n${indent}PR[0] = (LD[0],LD[1],0,LD[2],0,0);\n`;
    },

    CurrentTorqueFunction(robotName) {
        let ratios = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
        let isScara = Generator.IsScara(robotName);
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

        let j56get = isScara ? "" : `    D_J5_cur_torque = Abs(GetTorque(5) * ${ratios[4].toFixed(3)});\n    D_J6_cur_torque = Abs(GetTorque(6) * ${ratios[5].toFixed(3)});\n`;
        let j56out = isScara ? "" : `    ywCur_J5_torque = D_J5_cur_torque;\n    ywCur_J6_torque = D_J6_cur_torque;\n`;
        let j56max = isScara ? "" : `    If D_J5_cur_torque > D_J5_max_torque\n        D_J5_max_torque = D_J5_cur_torque;\n    EndIf;\n    If D_J6_cur_torque > D_J6_max_torque\n        D_J6_max_torque = D_J6_cur_torque;\n    EndIf;\n`;

        return `#====================================================================================\n#  Current torque\n#====================================================================================\nFunc Current_torque()\n    D_J1_cur_torque = Abs(GetTorque(1) * ${ratios[0].toFixed(3)});\n    D_J2_cur_torque = Abs(GetTorque(2) * ${ratios[1].toFixed(3)});\n    D_J3_cur_torque = Abs(GetTorque(3) * ${ratios[2].toFixed(3)});\n    D_J4_cur_torque = Abs(GetTorque(4) * ${ratios[3].toFixed(3)});\n${j56get}    #================================================================================\n    ywCur_J1_torque = D_J1_cur_torque;\n    ywCur_J2_torque = D_J2_cur_torque;\n    ywCur_J3_torque = D_J3_cur_torque;\n    ywCur_J4_torque = D_J4_cur_torque;\n${j56out}    #================================================================================\n    If D_J1_cur_torque > D_J1_max_torque\n        D_J1_max_torque = D_J1_cur_torque;\n    EndIf;\n    If D_J2_cur_torque > D_J2_max_torque\n        D_J2_max_torque = D_J2_cur_torque;\n    EndIf;\n    If D_J3_cur_torque > D_J3_max_torque\n        D_J3_max_torque = D_J3_cur_torque;\n    EndIf;\n    If D_J4_cur_torque > D_J4_max_torque\n        D_J4_max_torque = D_J4_cur_torque;\n    EndIf;\n${j56max}EndFunc;\n`;
    },

    TcpSpeedProgram(robotName) {
        return `${Generator.Header(robotName)}Start;\n    Double TCP_dist;\n    LP[0] = GetCurPos();\n    #================================================================================\n    While True\n        Delay T[0.1];\n        LP[1] = GetCurPos();\n        TCP_dist = Dist(LP[0],LP[1]);\n        D_TCP_speed = TCP_dist / 0.1;\n        LP[0] = LP[1];\n        ywCur_TCP_speed = D_TCP_speed;\n    EndWhile;\nEnd;`;
    },

    TorqueProgram(robotName) {
        return Generator.PLCInternalProgram({ RobotName: robotName, EnableTorque: true });

        let ratios = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
        let isScara = Generator.IsScara(robotName);
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

        let j56get = isScara ? "" : `    D_J5_cur_torque = Abs(GetTorque(5) * ${ratios[4].toFixed(3)});\n    D_J6_cur_torque = Abs(GetTorque(6) * ${ratios[5].toFixed(3)});\n`;
        let j56out = isScara ? "" : `    ywCur_J5_torque = D_J5_cur_torque;\n    ywCur_J6_torque = D_J6_cur_torque;\n`;
        let j56max = isScara ? "" : `    If D_J5_cur_torque > D_J5_max_torque\n        D_J5_max_torque = D_J5_cur_torque;\n    EndIf;\n    If D_J6_cur_torque > D_J6_max_torque\n        D_J6_max_torque = D_J6_cur_torque;\n    EndIf;\n`;

        return `${Generator.Header(robotName)}Start;\n    D_J1_cur_torque = Abs(GetTorque(1) * ${ratios[0].toFixed(3)});\n    D_J2_cur_torque = Abs(GetTorque(2) * ${ratios[1].toFixed(3)});\n    D_J3_cur_torque = Abs(GetTorque(3) * ${ratios[2].toFixed(3)});\n    D_J4_cur_torque = Abs(GetTorque(4) * ${ratios[3].toFixed(3)});\n${j56get}    #================================================================================\n    ywCur_J1_torque = D_J1_cur_torque;\n    ywCur_J2_torque = D_J2_cur_torque;\n    ywCur_J3_torque = D_J3_cur_torque;\n    ywCur_J4_torque = D_J4_cur_torque;\n${j56out}    #================================================================================\n    If D_J1_cur_torque > D_J1_max_torque\n        D_J1_max_torque = D_J1_cur_torque;\n    EndIf;\n    If D_J2_cur_torque > D_J2_max_torque\n        D_J2_max_torque = D_J2_cur_torque;\n    EndIf;\n    If D_J3_cur_torque > D_J3_max_torque\n        D_J3_max_torque = D_J3_cur_torque;\n    EndIf;\n    If D_J4_cur_torque > D_J4_max_torque\n        D_J4_max_torque = D_J4_cur_torque;\n    EndIf;\n${j56max}End;`;
    },

    PLCInternalProgram(options) {
        let torqueCall = options.EnableTorque ? `    #====================================================================================\n    #  Output - Current torque\n    #====================================================================================\n    Current_torque();\n` : "";
        let torqueFunc = options.EnableTorque ? Generator.CurrentTorqueFunction(options.RobotName) : "";
        return `${Generator.Header(options.RobotName)}Start;\n    #====================================================================================\n    #  Reset - Start all static\n    #====================================================================================\n    xReIO_run_all_static = OFF;\n    #====================================================================================\n    #  Output - Control mode\n    #====================================================================================\n    # Remote IO = 3 other TP, API, ECT\n    If ywReIO_cur_control == 3\n        Set yRemote_mode_sts,ON;\n    Else\n        Set yRemote_mode_sts,OFF;\n    EndIf;\n${torqueCall}End;\n${torqueFunc}`;
    },

    ToolControlProgram(options, steps) {
        if (!options.EnableToolControl) return null;

        let hasVacuum = false, hasGripper = false, hasTrash = false, stageCount = 0;
        steps.forEach(s => {
            if (s.ToolType === "Vacuum") hasVacuum = true;
            if (s.ToolType === "Gripper" || Generator.IsPeeling(s)) hasGripper = true;
            if (s.WorkType === "Trash") hasTrash = true;
            if (s.WorkType === "Stage") stageCount++;
        });
        if (hasTrash) hasVacuum = true;

        const isDIO = options.ToolControlType === "DIO";
        const inSuff = isDIO ? "_chk" : "";
        const outSuff = isDIO ? "" : "_REQ";
        let sb = Generator.Header(options.RobotName, "getNow");

        if (hasVacuum) {
            sb += `Func Tool_Vac_ON()\n    Set yTool_vac_off${outSuff},OFF;\n    Set yTool_vac_on${outSuff},ON;\n    Wait xTool_vac_on${inSuff} == ON, T[60], Goto L[900];\n    Set yTool_vac_on${outSuff},OFF;\n    Ret;\n    L[900]:\n    s01_initial.Init_signal();\n    Alarm[0];\nEndFunc;\n#====================================================================================\nFunc Tool_Vac_OFF()\n    Set yTool_vac_on${outSuff},OFF;\n    Set yTool_vac_off${outSuff},ON;\n    Wait xTool_vac_off${inSuff} == ON, T[60], Goto L[901];\n    Set yTool_vac_off${outSuff},OFF;\n    Ret;\n    L[901]:\n    s01_initial.Init_signal();\n    Alarm[1];\nEndFunc;\n`;
        }
        if (hasGripper) {
            sb += `#====================================================================================\nFunc Tool_Grip()\n    Set yTool_ungrip${outSuff},OFF;\n    Set yTool_grip${outSuff},ON;\n    Wait xTool_grip${inSuff} == ON, T[60], Goto L[902];\n    Set yTool_grip${outSuff},OFF;\n    Ret;\n    L[902]:\n    s01_initial.Init_signal();\n    Alarm[2];\nEndFunc;\n#====================================================================================\nFunc Tool_Ungrip()\n    Set yTool_grip${outSuff},OFF;\n    Set yTool_ungrip${outSuff},ON;\n    Wait xTool_ungrip${inSuff} == ON, T[60], Goto L[903];\n    Set yTool_ungrip${outSuff},OFF;\n    Ret;\n    L[903]:\n    s01_initial.Init_signal();\n    Alarm[3];\nEndFunc;\n`;
        }
        if (hasTrash) {
            sb += `#====================================================================================\nFunc Trash_Grip()\n    Set yTrash_ungrip${outSuff},OFF;\n    Set yTrash_grip${outSuff},ON;\n    Wait xTrash_grip${inSuff} == ON, T[60], Goto L[904];\n    Set yTrash_grip${outSuff},OFF;\n    Ret;\n    L[904]:\n    s01_initial.Init_signal();\n    Alarm[4];\nEndFunc;\n#====================================================================================\nFunc Trash_Ungrip()\n    Set yTrash_grip${outSuff},OFF;\n    Set yTrash_ungrip${outSuff},ON;\n    Wait xTrash_ungrip${inSuff} == ON, T[60], Goto L[905];\n    Set yTrash_ungrip${outSuff},OFF;\n    Ret;\n    L[905]:\n    s01_initial.Init_signal();\n    Alarm[5];\nEndFunc;\n`;
        }

        for (let i = 1; i <= stageCount; i++) {
            let prefix = i === 1 ? "Stage" : `Stage${i}`;
            let lOn = 906 + (i - 1) * 2;
            let lOff = 907 + (i - 1) * 2;
            sb += `#====================================================================================\nFunc ${prefix}_Vac_ON()\n    Set y${prefix}_vac_off${outSuff},OFF;\n    Set y${prefix}_vac_on${outSuff},ON;\n    Wait x${prefix}_vac_on${inSuff} == ON, T[60], Goto L[${lOn}];\n    Set y${prefix}_vac_on${outSuff},OFF;\n    Ret;\n    L[${lOn}]:\n    s01_initial.Init_signal();\n    Alarm[6];\nEndFunc;\n#====================================================================================\nFunc ${prefix}_Vac_OFF()\n    Set y${prefix}_vac_on${outSuff},OFF;\n    Set y${prefix}_vac_off${outSuff},ON;\n    Wait x${prefix}_vac_off${inSuff} == ON, T[60], Goto L[${lOff}];\n    Set y${prefix}_vac_off${outSuff},OFF;\n    Ret;\n    L[${lOff}]:\n    s01_initial.Init_signal();\n    Alarm[7];\nEndFunc;\n`;
        }
        return sb;
    },

    OffsetProgram(steps, options) {
        let sb = `${Generator.Header(options.RobotName)}Func Set_PR()\n    #================================================================================\n    #  Offset\n    #================================================================================\n    Switch B_Cur_process\n`;
        steps.forEach(s => {
            const n = s.No;
            sb += `        #============================================================================\n        #  P${n} - ${s.WorkType} ${s.WorkMethod}\n        #============================================================================\n        Case ${n}:\n`;
            if (n > 10) {
                sb += `            PR[B_PR] = (0,0,0,0,0,0);\n`;
            } else {
                if (Generator.UsesVisionOffset(s)) {
                    sb += `            LPR[B_PR] = (xwVision_offset_X.Int/10000,xwVision_offset_Y.Int/10000,0,xwVision_offset_A.Int/10000,0,0);\n`;
                }
                sb += `            PR[B_PR] = (xwOffset_${n}_X.Int/10000,xwOffset_${n}_Y.Int/10000,xwOffset_${n}_Z.Int/10000,xwOffset_${n}_A.Int/10000,0,0);\n`;
                if (Generator.UsesVisionOffset(s)) {
                    sb += `            PR[B_PR] = PR[B_PR] + LPR[B_PR];\n`;
                } else if (s.VisionUse === "Use - Socket" && s.WorkMethod !== "Check" && s.WorkMethod !== "Calibration") {
                    sb += `            PR[B_PR] = PR[B_PR] + PR[0];\n`;
                }
            }
            sb += `            Break;\n`;
        });
        sb += `    EndSwitch;\n`;
        if (options.EnableTeachingMode) {
            sb += `    #================================================================================\n    #  Teach mode offset\n    #================================================================================\n    If xTeach_mode\n        PR[5] = (xwTeach_offset_X.Int/10000,xwTeach_offset_Y.Int/10000,xwTeach_offset_Z.Int/10000,xwTeach_offset_A.Int/10000,xwTeach_offset_B.Int/10000,xwTeach_offset_C.Int/10000);\n        PR[6] = PR[5] + PR[B_PR];\n    EndIf;\n`;
        }
        sb += `EndFunc;\n`;
        return sb;
    },

    TeachModeProgram(steps, options) {
        let sb = `${Generator.Header(options.RobotName)}Global Int aiP_num[16][30];\nGlobal Int aiMove_type[16][30];\nGlobal Int aiPos_count[16];\nGlobal Int iCur_pos_idx;\n#====================================================================================\n#  Move Type\n#====================================================================================\n#    0 = MovJ, Not use Offset\n#    1 = MovJ, Use Offset ON\n#    2 = MovL, Not use Offset\n#    3 = MovL, Use Offset ON\n#====================================================================================\n#  Teaching Config Init\n#====================================================================================\nFunc Set_path()\n    Int i;\n    Switch B_Cur_process\n`;
        steps.forEach(s => {
            const n = s.No;
            const lastWait = Generator.LastWaitOffset(s);
            let points = [n * 100, n * 100 + 1];
            let moveTypes = [0, 0];
            for (let i = 2; i <= lastWait; i++) {
                points.push(n * 100 + i);
                moveTypes.push(0);
            }
            points.push(n * 100 + 10, n * 100 + 11);
            moveTypes.push(1, 3);
            if (Generator.IsPeeling(s)) {
                for (let i = 12; i <= 16; i++) {
                    points.push(n * 100 + i);
                    moveTypes.push(2);
                }
                points.push(n * 100 + 20);
                moveTypes.push(2);
            }
            sb += `        Case ${n}: # Process ${n}\n            aiPos_count[${n}] = ${points.length};\n            Int P${n}_pos_num[30] = {${points.join(', ')}};\n            Int P${n}_move_type[30] = {${moveTypes.join(', ')}};\n            For i=0,i<aiPos_count[${n}],Step[1]\n                aiP_num[${n}][i] = P${n}_pos_num[i];\n                aiMove_type[${n}][i] = P${n}_move_type[i];\n            EndFor;\n            Break;\n        #============================================================================\n`;
        });
        sb += `    EndSwitch;\nEndFunc;\n#====================================================================================\n#  Teaching Mode Start\n#====================================================================================\nFunc Teaching_mode()\n    Set yTeach_mode_sts,ON;\n    Print "Teaching mode Start. Process : " + B_Cur_process;\n    #================================================================================\n    #  Set Position data\n    #================================================================================\n    Set_path();\n    #============================================================================\n    #  Teaching Loop\n    #============================================================================\n    iCur_pos_idx = 0;\n    Teach_move(); # Go Safe of current process position\n    #============================================================================\n    While xTeach_mode == ON\n        #========================================================================\n        #  Move Next\n        #========================================================================\n        If xTeach_move_next And iCur_pos_idx < aiPos_count[B_Cur_process] - 1\n            iCur_pos_idx = iCur_pos_idx + 1;\n            Teach_move();\n            Set yTeach_move_comp, ON;\n            Wait xTeach_move_next == OFF or xTeach_mode == OFF;\n            Set yTeach_move_comp, OFF;\n        #========================================================================\n        #  Move Previous\n        #========================================================================\n        ElseIf xTeach_move_prev And iCur_pos_idx > 0\n            iCur_pos_idx = iCur_pos_idx - 1;\n            Teach_move();\n            Set yTeach_move_comp, ON;\n            Wait xTeach_move_prev == OFF or xTeach_mode == OFF;\n            Set yTeach_move_comp, OFF;\n        #========================================================================\n        #  Move Offset\n        #========================================================================\n        ElseIf xTeach_move_offset\n            Teach_move();\n            Set yTeach_move_comp, ON;\n            Wait xTeach_move_offset == OFF or xTeach_mode == OFF;\n            Set yTeach_move_comp, OFF;\n        #========================================================================\n        #  Save Points\n        #========================================================================\n        ElseIf xTeach_save And iCur_pos_idx >= 2 #Up, Down pos save\n            Int cur_up_pos = B_Cur_process * 100 + 10;\n            Int cur_down_pos = B_Cur_process * 100 + 11;\n            P[cur_up_pos] = Offset(P[cur_up_pos],PR[5]);\n            P[cur_down_pos] = Offset(P[cur_down_pos],PR[5]);\n            SavePoints;\n            Set yTeach_save_comp, ON;\n            Wait xTeach_save == OFF or xTeach_mode == OFF;\n            Set yTeach_save_comp, OFF;\n        EndIf;\n    EndWhile;\n    Set yTeach_mode_sts,OFF;\n    Print "Teaching mode End";\nEndFunc;\n#====================================================================================\n#  Move Current Step\n#====================================================================================\nFunc Teach_move()\n    Int P_num = aiP_num[B_Cur_process][iCur_pos_idx];\n    Int move_type = aiMove_type[B_Cur_process][iCur_pos_idx];\n    If P_num < 100\n        Print "Teach mode Pos num error";\n        Alarm[13];\n        ret;\n    EndIf;\n    #============================================================================\n    s02_offset.Set_PR();\n    R_Cur_pos = P_num;\n    #============================================================================\n    If move_type == 0 # MovJ, Offset OFF\n        Movj P[P_num],V[30],Z[0],Tool[B_Tool],Wobj[B_Wobj];\n    #============================================================================\n    ElseIf move_type == 1 # MovJ, Offset ON\n        Movj Offset(P[P_num], PR[6]),V[30],Z[0],Tool[B_Tool],Wobj[B_Wobj];\n    #============================================================================\n    ElseIf move_type == 2 # MovL, Offset OFF\n        Movl P[P_num],V[30],Z[0],Tool[B_Tool],Wobj[B_Wobj];\n    #============================================================================\n    ElseIf move_type == 3 # MovL, Offset ON\n        Movl Offset(P[P_num], PR[6]),V[30],Z[0],Tool[B_Tool],Wobj[B_Wobj];\n    Else\n        Print "Teach mode move type error";\n        Alarm[13];\n        ret;\n    EndIf;\nEndFunc;\n`;
        return sb;
    },

    MainProgram(steps, options) {
        let sb = Generator.Header(options.RobotName);
        sb += `Include "s01_initial.pro";\n`;
        sb += `Include "s02_offset.pro";\n`;
        if (options.EnableTeachingMode) sb += `Include "s03_teach_mode.pro";\n`;
        if (options.EnableToolControl) sb += `Include "s04_Tool_Control.pro";\n`;
        steps.forEach(s => sb += `Include "${s.ProcessName}.pro";\n`);

        let payloadMatch = options.RobotName.match(/IR-(?:TS|[RS])(\d+)/i);
        let payload = payloadMatch ? parseInt(payloadMatch[1]) : 7;
        const hasWait = options.EnableWaitPos !== false;
        const hasBusy = options.EnableProcessBusy !== false;

        sb += `Start;\n    #================================================================================\n    #  Initial\n    #================================================================================\n    xReIO_run_all_static = ON;\n    #================================================================================\n    If Tool[1].TLoad.Mass == 0 \n        Tool[1].TLoad.Mass = ${payload};\n    EndIf;\n    #================================================================================\n    s01_initial.Init_move_home();\n    s01_initial.Init_signal();\n`;
        if (options.EnableMultiRecipe) sb += `    s01_initial.Manual_set_recipe();\n`;
        sb += `    #================================================================================\n    #  Set initial speed\n    #================================================================================\n    If xwSet_speed <= 0\n        Velset Rate[1];\n    ElseIf xwSet_speed > 100\n        Velset Rate[100];\n    Else\n        Velset Rate[xwSet_speed];\n    EndIf;\n    #================================================================================\n    L[0]: #Loop of Wait Start process signal\n    #================================================================================\n    If xRobot_homing\n        s01_initial.Init_move_home();\n        s01_initial.Init_signal();\n    EndIf;\n    #================================================================================\n    #  Start Process\n    #================================================================================\n`;

        let workCond = hasWait ? "xwProcess_work_pos > 0 And xwProcess_wait_pos == 0" : "xwProcess_work_pos > 0";
        sb += `    If ${workCond}\n        Print "Work pos Start";\n        ywProcess_work_comp = 0; #Process Work pos comp reset\n`;
        if (hasWait) sb += `        ywProcess_wait_comp = 0; #Process Wait pos comp reset\n`;
        if (hasBusy) sb += `        ywProcess_work_busy = xwProcess_work_pos; #Process Work pos busy ON\n`;
        sb += `        #============================================================================\n`;
        steps.forEach((s, i) => {
            sb += `        ${i === 0 ? "If" : "ElseIf"} xP${s.No}_work_pos_start\n            ${s.ProcessName}.P${s.No}_pos();\n`;
        });
        sb += `        EndIf;\n`;

        if (hasWait) {
            sb += `    #================================================================================\n    ElseIf xwProcess_wait_pos > 0 And xwProcess_work_pos == 0 \n        Print "Wait pos Start";\n        ywProcess_wait_comp = 0; #Process Wait pos comp reset\n        ywProcess_work_comp = 0; #Process Work pos comp reset\n`;
            if (hasBusy) sb += `        ywProcess_wait_busy = xwProcess_wait_pos; #Process Wait pos busy ON\n`;
            sb += `        #============================================================================\n`;
            steps.forEach((s, i) => {
                sb += `        ${i === 0 ? "If" : "ElseIf"} xP${s.No}_wait_pos_start\n            ${s.ProcessName}.P${s.No}_pos();\n`;
            });
            sb += `        EndIf;\n`;
        }

        sb += `    EndIf;\n    #================================================================================\n    #  Signal reset\n    #================================================================================\n`;
        if (options.EnableTeachingMode) sb += `    yTeach_mode_sts = xTeach_mode;\n`;
        if (hasBusy) {
            sb += `    ywProcess_work_busy = 0; #Process Work pos busy OFF\n`;
            if (hasWait) sb += `    ywProcess_wait_busy = 0; #Process Wait pos busy OFF\n`;
        }
        sb += `    #================================================================================\n    Goto L[0];\nEnd;\n`;
        return sb;
    },

    InitialProgram(steps, options) {
        let sb = Generator.Header(options.RobotName);
        sb += `#====================================================================================\n#  Init Signal\n#====================================================================================\nFunc Init_signal()\n    Clear Out[520],120; #[520] ~ [639]\nEndFunc;\n#====================================================================================\n#  Init Move Home\n#====================================================================================\nFunc Init_move_home()\n    #================================================================================\n    #  Signal Set\n    #================================================================================\n    If yRobot_home_sts\n        R_Cur_pos = 1;\n    EndIf;\n    #================================================================================\n    #  Start Return\n    #================================================================================\n    Velset 50;\n    Return_move(0);\n    #================================================================================\n    R_Cur_pos = 1;\n    Home[0],V[100];\n    Velset OFF;\nEndFunc;\n#====================================================================================\n#  Return Move\n#====================================================================================\nFunc Return_move(Int return_path)\n    Int cur_proces = R_Cur_pos / 100;\n    Print "Return move Process : " + cur_proces;\n    Switch R_Cur_pos\n        Case 1: #Home\n            Break;\n`;

        steps.forEach(s => {
            const n = s.No;
            const toolNo = Generator.ToolNo(s);
            const lastWait = Generator.LastWaitOffset(s);
            const zUp = n === 1 ? 2 : 1;
            const accUp = (s.WorkMethod === "Get") ? ",Acc[5]" : "";
            sb += `        #============================================================================\n        #  P${n} - ${s.WorkType} ${s.WorkMethod}\n        #============================================================================\n`;
            if (Generator.IsPeeling(s)) {
                for (let i = 12; i <= 15; i++) {
                    sb += `        Case ${n * 100 + i}:\n            Movl P${n}_Peel_${i - 10},V[100],Z[2],Tool[B_Tool],Wobj[B_Wobj];\n            R_Cur_pos = ${n * 100 + i + 1};\n`;
                }
                sb += `        Case ${n * 100 + 16}:\n            Movl P${n}_Peel_end,V[100],Z[2],Tool[B_Tool],Wobj[B_Wobj];\n            R_Cur_pos = ${n * 100 + 20};\n        Case ${n * 100 + 20}:\n            Movj P${n}_Safe,V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];\n            R_Cur_pos = ${n * 100};\n            Break;\n`;
            }
            sb += `        Case ${n * 100 + 11}:\n            Movl Offset(P${n}_Up, PR[B_PR]),V[100],Z[${zUp}],Tool[B_Tool],Wobj[B_Wobj]${accUp};\n            R_Cur_pos = ${n * 100 + 10};\n            If return_path == 10\n                Break;\n            EndIf;\n        Case ${n * 100 + 10}:\n            R_Cur_pos = ${n * 100 + 1};\n            Movj P${n}_Wait,V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];\n`;
            for (let i = 2; i <= lastWait; i++) {
                sb += `            R_Cur_pos = ${n * 100 + i};\n            Movj P${n}_Wait${i},V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];\n`;
            }
            sb += `            If return_path == 1\n                Break;\n            EndIf;\n        Case ${n * 100} To ${n * 100 + lastWait}:\n            Movj P${n}_Safe,V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];\n            R_Cur_pos = ${n * 100};\n            Break;\n`;
        });

        sb += `        #============================================================================\n        #  Other\n        #============================================================================\n        Default:\n            Print "Return move Fail! Incorrect value. R_Cur_pos :  " + R_Cur_pos;\n            Alarm[14]; #Return move Error\n            Break;\n    EndSwitch;\nEndFunc;\n`;

        if (options.EnableMultiRecipe && options.RecipeCount > 1) {
            sb += `#====================================================================================\n#  Manual Set Recipe\n#====================================================================================\nFunc Manual_set_recipe() #Change recipe\n    If xwP_file_switch == ywCur_P_file\n        ret;\n    EndIf;\n    #================================================================================\n    Switch xwP_file_switch\n        Case 0:\n            LoadPoints("P.pts");\n            Break;\n`;
            for (let i = 1; i < options.RecipeCount; i++) {
                sb += `        Case ${i}:\n            LoadPoints("P${i.toString().padStart(2, '0')}.pts");\n            Break;\n`;
            }
            sb += `    EndSwitch;\n    #================================================================================\n    String P_name = GetCurPointsFileName();\n    Print "Current Point file : " + P_name;\n    P_name = StrRePlace(P_name,"P","");\n    P_name = StrRePlace(P_name,".pts","");\n    ywCur_P_file = StrToR(P_name);\nEndFunc;\n`;
        }
        return sb;
    },

    ProcessProgram(s, options, stageIndex) {
        const n = s.No;
        const type = s.WorkType;
        const method = s.WorkMethod;
        const tool = s.ToolType;
        const toolNo = Generator.ToolNo(s);
        const lastWait = Generator.LastWaitOffset(s);
        const hasWait = options.EnableWaitPos !== false;
        const hasBusy = options.EnableProcessBusy !== false;
        const workFlag = hasBusy ? `yP${n}_work_pos_busy` : `xP${n}_work_pos_start`;
        const waitFlag = hasBusy ? `yP${n}_wait_pos_busy` : `xP${n}_wait_pos_start`;
        const stagePrefix = stageIndex === 1 ? "Stage" : `Stage${stageIndex}`;
        const isDIO = options.ToolControlType === "DIO";
        const inSuff = isDIO ? "_chk" : "";

        let socketFuncs = "";
        let preOffsetAction = "";
        let afterMoveAction = "";
        let toolPosCheck = "";
        let toolCtrlLogic = "";
        let processAction = "";
        let finalAction = "";

        const needsSocket = s.VisionUse === "Use - Socket";
        if (needsSocket) {
            const vis = options.VisionConfigs[n - 1] || { IsClient: true, IpAddress: "192.168.1.10", Port: "5000" };
            if (method !== "Calibration" && method !== "Check") {
                preOffsetAction = Generator.SocketExchange(s);
            } else if (method === "Check") {
                afterMoveAction += `    #================================================================================\n    #  Vision Check Shot\n    #================================================================================\n` + Generator.SocketExchange(s);
            }

            socketFuncs += `#====================================================================================\n#  Open Socket\n#====================================================================================\nFunc Connect_socket()\n    Print "P${n} - Vision Socket Connect Start";\n    #================================================================================\n    Close Socket,2;\n    Int i;\n    Int error_count = 5;\n`;
            if (vis.IsClient) {
                socketFuncs += `    String server_IP = "${vis.IpAddress}";\n    Int server_port = ${vis.Port};\n    #================================================================================\n    For i=1,i <= error_count,Step[1]\n        Open Socket(server_IP,server_port,2,Single,LB[0]);\n        If LB[0] == 1\n            Break;\n        ElseIf LB[0] == 0 And i >= error_count\n            Alarm[13]; #Socket COMM Error\n        EndIf;\n        Delay T[0.5];\n    EndFor;\n`;
            } else {
                socketFuncs += `    #================================================================================\n    For i=1,i <= error_count,Step[1]\n        LB[0] = GetPortState(2);\n        If LB[0] == 1\n            Break;\n        ElseIf LB[0] == 0 And i >= error_count\n            Alarm[13]; #Socket COMM Error\n        EndIf;\n        Delay T[0.5];\n    EndFor;\n`;
            }
            socketFuncs += `    Print "P${n} - Vision Socket Connect End";\nEndFunc;\n#====================================================================================\n#  Send data\n#====================================================================================\nFunc Send_data(String send_data)\n    Send Port[2],send_data;\n    Print "P${n} - Vision Socket Sent data : " + send_data;\nEndFunc;\n#====================================================================================\n#  Receive data\n#====================================================================================\nFunc String Receive_data()\n    L[800]:\n    Get Port[2],T[100],Goto L[800];\n    String received_data = GetPortbuf(0,100,2);\n    Print "P${n} - Vision Socket Received data : " + received_data;\n    Return received_data;\nEndFunc;\n`;
        }

        if (options.EnableToolControl) {
            const check = label => `    If ${label}${inSuff}\n        Alarm[15];\n    EndIf;\n`;
            if (type === "Trash") {
                toolPosCheck = check("xTrash_ungrip");
                toolCtrlLogic = `    #================================================================================\n    s04_Tool_Control.Trash_Grip();\n    s04_Tool_Control.Tool_Vac_OFF();\n    s04_Tool_Control.Trash_Ungrip();\n`;
            } else if (method === "Get") {
                if (tool === "Vacuum") {
                    toolPosCheck = check("xTool_vac_on");
                    toolCtrlLogic = `    #================================================================================\n    s04_Tool_Control.Tool_Vac_ON();\n` + (type === "Stage" ? `    s04_Tool_Control.${stagePrefix}_Vac_OFF();\n` : "");
                } else if (tool === "Gripper") {
                    toolPosCheck = check("xTool_grip");
                    toolCtrlLogic = `    #================================================================================\n    s04_Tool_Control.Tool_Grip();\n` + (type === "Stage" ? `    s04_Tool_Control.${stagePrefix}_Vac_OFF();\n` : "");
                }
            } else if (method === "Put") {
                if (tool === "Vacuum") {
                    toolPosCheck = check("xTool_vac_off");
                    toolCtrlLogic = `    #================================================================================\n` + (type === "Stage" ? `    s04_Tool_Control.${stagePrefix}_Vac_ON();\n    s04_Tool_Control.Tool_Vac_OFF();\n` : "    s04_Tool_Control.Tool_Vac_OFF();\n");
                } else if (tool === "Gripper") {
                    toolPosCheck = check("xTool_ungrip");
                    toolCtrlLogic = `    #================================================================================\n` + (type === "Stage" ? `    s04_Tool_Control.${stagePrefix}_Vac_ON();\n    s04_Tool_Control.Tool_Ungrip();\n` : "    s04_Tool_Control.Tool_Ungrip();\n");
                }
            } else if (Generator.IsPeeling(s)) {
                toolPosCheck = check("xTool_grip");
                toolCtrlLogic = `    #================================================================================\n    s04_Tool_Control.Tool_Grip();\n`;
            }
        }

        if (Generator.IsPeeling(s)) {
            if (!options.EnableToolControl) {
                processAction += `    #================================================================================\n    #  Waiting Grip\n    #================================================================================\n    Set yPeel_pos_comp,ON;\n    Wait xPeel_start == ON;\n    Set yPeel_pos_comp,OFF;\n`;
            }
            processAction += `    #================================================================================\n    #  Peeling\n    #================================================================================\n`;
            for (let i = 1; i <= 5; i++) {
                processAction += `    R_Cur_pos = ${n * 100 + 11 + i};\n    Movl P${n}_Peel_${i},Speed[xwPeel_speed],Z[2],Tool[B_Tool],Wobj[B_Wobj];\n`;
            }
            finalAction += `    R_Cur_pos = ${n * 100 + 20};\n    Movl P${n}_Peel_end,Speed[xwPeel_speed],Z[1],Tool[B_Tool],Wobj[B_Wobj];\n`;
        }

        let moveWaits = "";
        for (let i = 2; i <= lastWait; i++) {
            moveWaits += `            R_Cur_pos = ${n * 100 + i};\n            Movj P${n}_Wait${i},V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];\n`;
        }

        let teachingCall = "";
        if (options.EnableTeachingMode) {
            teachingCall = `    If xTeach_mode\n        s03_teach_mode.Teaching_mode();\n        Goto L[0];\n    EndIf;\n    #================================================================================\n`;
        }

        const downDec = method === "Put" ? ",DEC[5]" : "";

        let completion = "";
        if (hasWait) {
            completion = `    If ${waitFlag}\n        Set yP${n}_wait_pos_comp,ON;\n    ElseIf ${workFlag}\n        Set yP${n}_work_pos_comp,ON;\n    EndIf;\n`;
        } else {
            completion = `    Set yP${n}_work_pos_comp,ON;\n`;
        }

        let sb = `${Generator.Header(options.RobotName)}Func P${n}_pos()\n${toolPosCheck ? `    #================================================================================\n    #  Tool position check\n    #================================================================================\n${toolPosCheck}` : ""}    #================================================================================\n    #  Path setting - Same process\n    #================================================================================\n    If ${workFlag} And R_Cur_pos == ${n * 100 + lastWait}\n        B_path = 10; #Starting position = Up\n    ElseIf ${workFlag} And R_Cur_pos == ${n * 100 + 11}\n        B_path = 10; #Starting position = Up\n        s01_initial.Return_move(10); #UP pos Return from before Process Pos\n`;
        if (hasWait) {
            sb += `    ElseIf ${waitFlag} And R_Cur_pos == ${n * 100 + 11}\n        B_path = 1; #Starting position = Wait\n        s01_initial.Return_move(10); #Go back Up position of before process\n`;
        }
        sb += `    #================================================================================\n    #  Path setting - other process\n    #================================================================================\n    Else\n        B_path = 0; #Starting position = Safe\n        s01_initial.Return_move(0); #Return from Previous Process Pos\n    EndIf;\n    #================================================================================\n    #  Set signal\n    #================================================================================\n    B_Cur_process = ${n};\n    B_Tool = ${toolNo};\n    B_Wobj = 0;\n    B_PR = ${n * 10};\n    #================================================================================\n${teachingCall}    #  Move\n    #================================================================================\n${preOffsetAction}    s02_offset.Set_PR();\n    #================================================================================\n    Switch B_path\n        Case 0:\n            R_Cur_pos = ${n * 100};\n            Movj P${n}_Safe,V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];\n        Case 1:\n            R_Cur_pos = ${n * 100 + 1};\n            Movj P${n}_Wait,V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];\n${moveWaits}`;
        if (hasWait) {
            sb += `            If ${waitFlag}\n                Break;\n            EndIf;\n`;
        }
        sb += `        Case 10:\n            R_Cur_pos = ${n * 100 + 10};\n            Movj Offset(P${n}_Up, PR[B_PR]),V[100],Z[1],Tool[B_Tool],Wobj[B_Wobj];\n            R_Cur_pos = ${n * 100 + 11};\n            Movl Offset(P${n}_Down, PR[B_PR]),V[100],Z[0],Tool[B_Tool],Wobj[B_Wobj]${downDec};\n            Break;\n    EndSwitch;\n${afterMoveAction}${toolCtrlLogic}${processAction}    #================================================================================\n    #  Process Complete\n    #================================================================================\n${finalAction}    L[0]:\n    Print "P${n} - ${type} ${method} pos End";\n${completion}EndFunc;\n`;

        if (socketFuncs) {
            sb += `\n${socketFuncs}`;
        }
        return sb;
    },

    DataPoints(steps, options, fileName = "P.pts") {
        let sb = Generator.Header(options.RobotName);
        const zero = "0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000";
        const cfg = "0, 0, 0, 0";
        const includeName = fileName === "P.pts";
        steps.forEach(s => {
            const n = s.No * 100;
            let list = [{ N: "Safe", O: 0 }, { N: "Wait", O: 1 }];
            for (let i = 1; i <= (s.ExtraWaitCount || 0); i++) list.push({ N: `Wait${i + 1}`, O: 1 + i });
            list.push({ N: "Up", O: 10 }, { N: "Down", O: 11 });
            if (Generator.IsPeeling(s)) {
                list.push({ N: "Peel_1", O: 12 }, { N: "Peel_2", O: 13 }, { N: "Peel_3", O: 14 }, { N: "Peel_4", O: 15 }, { N: "Peel_5", O: 16 }, { N: "Peel_end", O: 20 });
            }
            list.forEach(p => {
                let name = includeName ? `Name = P${s.No}_${p.N};` : "";
                sb += `P[${n + p.O}] = ${zero}; ${cfg};${zero};${name}Notes = "T1_W0";\n`;
            });
        });
        return sb;
    },

    DataWarning(steps, options) {
        let warn = ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
        steps.forEach(s => {
            if (s.ToolType === "Vacuum" || s.WorkType === "Trash") { warn[0] = "ERR : Tool Vacuum ON Error!"; warn[1] = "ERR : Tool Vacuum OFF Error!"; }
            if (s.ToolType === "Gripper" || Generator.IsPeeling(s) || s.WorkType === "Trash") { warn[2] = "ERR : Gripper ON Error!"; warn[3] = "ERR : Gripper OFF Error!"; }
            if (s.WorkType === "Trash") { warn[4] = "ERR : Trash Gripper ON Error!"; warn[5] = "ERR : Trash Gripper OFF Error!"; }
            if (s.WorkType === "Stage") { warn[6] = "ERR : Stage Vacuum ON Error!"; warn[7] = "ERR : Stage Vacuum OFF Error!"; }
            if (s.WorkMethod === "Check" && s.WorkType === "MCR") warn[8] = "ERR : MCR Shot Error!";
            if (s.WorkMethod === "Check" && s.WorkType === "Vision") warn[9] = "ERR : Vision Shot Error!";
        });
        if (options.EnableTeachingMode) warn[13] = "ERR : Teaching mode Error!";
        warn[14] = "ERR : Homing Error!";
        if (options.EnableToolControl) warn[15] = "ERR : Tool position Error!";
        return '{\n  "Warings": [\n' + warn.map(w => `    "${w}"`).join(',\n') + '\n  ]\n}';
    },

    DataPrj(steps, options, prjName) {
        let tasks = [];
        let tid = 1;
        tasks.push(`    {\n      "TaskId": ${tid++},\n      "EnterProgramFile": "PLC_internal.pro",\n      "TaskType": 1,\n      "IsActive": true\n    }`);
        if (options.EnableTcpSpeed) {
            tasks.push(`    {\n      "TaskId": ${tid++},\n      "EnterProgramFile": "PLC_TCP_Speed.pro",\n      "TaskType": 1,\n      "IsActive": true\n    }`);
        }

        let progFiles = ["main.pro"];
        progFiles.push("PLC_internal.pro");
        if (options.EnableTcpSpeed) progFiles.push("PLC_TCP_Speed.pro");
        progFiles.push("s01_initial.pro");
        progFiles.push("s02_offset.pro");
        if (options.EnableTeachingMode) progFiles.push("s03_teach_mode.pro");
        if (options.EnableToolControl) progFiles.push("s04_Tool_Control.pro");
        steps.forEach(s => progFiles.push(`${s.ProcessName}.pro`));

        let ptF = ["P.pts"];
        if (options.EnableMultiRecipe) {
            for (let i = 1; i < options.RecipeCount; i++) ptF.push(`P${i.toString().padStart(2, '0')}.pts`);
        }

        return `{\n  "FileType": "RobotProjectConfigFile",\n  "Company": "Inovance",\n  "MajorVersion": 2,\n  "MinorVersion": 1,\n  "IsMainActive": true,\n  "MultiTaskCount": ${tasks.length},\n  "MultiTaskInfos": [\n${tasks.join(',\n')}\n  ],\n  "ProgramFilesCount": ${progFiles.length},\n  "ProgramFiles": [\n${progFiles.map(p => `    "${p}"`).join(',\n')}\n  ],\n  "RobPointFilesCount": ${ptF.length},\n  "RobPointFiles": [\n${ptF.map(p => `    "${p}"`).join(',\n')}\n  ]\n}`;
    },

    RemoteIOInfo(options) {
        let t = Assets.RemoteIO.replace(/Time="[^"]*"/, `Time="${TemplateHelper.getNow()}"`);
        t = t.replace(/RobotName="[^"]*"/, `RobotName="${options.RobotName}"`);
        return t;
    },

    RobPointMapping(options) {
        let t = `FileInfo\n    FileType="PosMappingFile"\n    Version="1.0"\n    SystemVersion="V4R24"\n    RobotName="${options.RobotName}"\n    Time="${TemplateHelper.getNow()}"\n    CheckCode="558447AB"\nEndFileInfo\n0-P.pts\n`;
        if (options.EnableMultiRecipe) {
            for (let i = 1; i < options.RecipeCount; i++) t += `${i}-P${i.toString().padStart(2, '0')}.pts\n`;
        }
        return t;
    },

    LabelsJson(steps, options) {
        let isScara = Generator.IsScara(options.RobotName);
        let hasPeeling = false, hasVisionIo = false;
        let hasVacuum = false, hasGripper = false, hasTrash = false, stageCount = 0;

        steps.forEach(s => {
            if (Generator.IsPeeling(s)) hasPeeling = true;
            if (Generator.UsesVisionOffset(s)) hasVisionIo = true;
            if (s.ToolType === "Vacuum") hasVacuum = true;
            if (s.ToolType === "Gripper" || Generator.IsPeeling(s)) hasGripper = true;
            if (s.WorkType === "Trash") hasTrash = true;
            if (s.WorkType === "Stage") stageCount++;
        });
        if (hasTrash) hasVacuum = true;

        let inBits = [
            { nIndex: 512, sLabel: "xStart_prog", sDescription: "Start program", sOriginalName: "IN[512]" },
            { nIndex: 513, sLabel: "xStop_prog", sDescription: "Stop program", sOriginalName: "IN[513]" },
            { nIndex: 514, sLabel: "xReset_prog", sDescription: "Program reset", sOriginalName: "IN[514]" },
            { nIndex: 515, sLabel: "xReset_alarm", sDescription: "Clear alarm", sOriginalName: "IN[515]" },
            { nIndex: 519, sLabel: "xRobot_homing", sDescription: "", sOriginalName: "IN[519]" }
        ];

        if (options.EnableTeachingMode) {
            inBits.push(
                { nIndex: 520, sLabel: "xTeach_mode", sDescription: "", sOriginalName: "IN[520]" },
                { nIndex: 521, sLabel: "xTeach_move_next", sDescription: "", sOriginalName: "IN[521]" },
                { nIndex: 522, sLabel: "xTeach_move_prev", sDescription: "", sOriginalName: "IN[522]" },
                { nIndex: 523, sLabel: "xTeach_move_offset", sDescription: "", sOriginalName: "IN[523]" },
                { nIndex: 524, sLabel: "xTeach_save", sDescription: "", sOriginalName: "IN[524]" }
            );
        }

        if (options.EnableWaitPos !== false) {
            let baseInIdx = 528;
            steps.forEach(s => { inBits.push({ nIndex: baseInIdx, sLabel: `xP${s.No}_wait_pos_start`, sDescription: "", sOriginalName: `IN[${baseInIdx}]` }); baseInIdx++; });
        }
        let baseWorkInIdx = 544;
        steps.forEach(s => { inBits.push({ nIndex: baseWorkInIdx, sLabel: `xP${s.No}_work_pos_start`, sDescription: "", sOriginalName: `IN[${baseWorkInIdx}]` }); baseWorkInIdx++; });
        if (hasPeeling) inBits.push({ nIndex: 568, sLabel: "xPeel_start", sDescription: "", sOriginalName: "IN[568]" });
        if (options.EnableToolControl) {
            const isDIO = options.ToolControlType === "DIO";
            if (hasVacuum) {
                if (isDIO) {
                    inBits.push({ nIndex: 0, sLabel: "xTool_vac_on_chk", sDescription: "DIO Tool", sOriginalName: "IN[0]" }, { nIndex: 1, sLabel: "xTool_vac_off_chk", sDescription: "DIO Tool", sOriginalName: "IN[1]" });
                    inBits.push({ nIndex: 608, sLabel: "xTool_vac_on_REQ", sDescription: "COMM Tool", sOriginalName: "IN[608]" }, { nIndex: 609, sLabel: "xTool_vac_off_REQ", sDescription: "COMM Tool", sOriginalName: "IN[609]" });
                } else {
                    inBits.push({ nIndex: 608, sLabel: "xTool_vac_on", sDescription: "", sOriginalName: "IN[608]" }, { nIndex: 609, sLabel: "xTool_vac_off", sDescription: "", sOriginalName: "IN[609]" });
                }
            }
            if (hasGripper) {
                if (isDIO) {
                    inBits.push({ nIndex: 2, sLabel: "xTool_grip_chk", sDescription: "DIO Tool", sOriginalName: "IN[2]" }, { nIndex: 3, sLabel: "xTool_ungrip_chk", sDescription: "DIO Tool", sOriginalName: "IN[3]" });
                    inBits.push({ nIndex: 610, sLabel: "xTool_grip_REQ", sDescription: "COMM Tool", sOriginalName: "IN[610]" }, { nIndex: 611, sLabel: "xTool_ungrip_REQ", sDescription: "COMM Tool", sOriginalName: "IN[611]" });
                } else {
                    inBits.push({ nIndex: 610, sLabel: "xTool_grip", sDescription: "", sOriginalName: "IN[610]" }, { nIndex: 611, sLabel: "xTool_ungrip", sDescription: "", sOriginalName: "IN[611]" });
                }
            }
            if (hasTrash) {
                if (isDIO) {
                    inBits.push({ nIndex: 4, sLabel: "xTrash_grip_chk", sDescription: "DIO Tool", sOriginalName: "IN[4]" }, { nIndex: 5, sLabel: "xTrash_ungrip_chk", sDescription: "DIO Tool", sOriginalName: "IN[5]" });
                    inBits.push({ nIndex: 612, sLabel: "xTrash_grip_REQ", sDescription: "COMM Tool", sOriginalName: "IN[612]" }, { nIndex: 613, sLabel: "xTrash_ungrip_REQ", sDescription: "COMM Tool", sOriginalName: "IN[613]" });
                } else {
                    inBits.push({ nIndex: 612, sLabel: "xTrash_grip", sDescription: "", sOriginalName: "IN[612]" }, { nIndex: 613, sLabel: "xTrash_ungrip", sDescription: "", sOriginalName: "IN[613]" });
                }
            }
            let curStageInIdx = 614;
            let curDioInIdx = 6;
            for (let i = 1; i <= stageCount; i++) {
                let prefix = i === 1 ? "Stage" : `Stage${i}`;
                if (isDIO) {
                    inBits.push({ nIndex: curDioInIdx, sLabel: `x${prefix}_vac_on_chk`, sDescription: "DIO Tool", sOriginalName: `IN[${curDioInIdx}]` });
                    inBits.push({ nIndex: curDioInIdx + 1, sLabel: `x${prefix}_vac_off_chk`, sDescription: "DIO Tool", sOriginalName: `IN[${curDioInIdx + 1}]` });
                    inBits.push({ nIndex: curStageInIdx, sLabel: `x${prefix}_vac_on_REQ`, sDescription: "COMM Tool", sOriginalName: `IN[${curStageInIdx}]` });
                    inBits.push({ nIndex: curStageInIdx + 1, sLabel: `x${prefix}_vac_off_REQ`, sDescription: "COMM Tool", sOriginalName: `IN[${curStageInIdx + 1}]` });
                    curDioInIdx += 2;
                } else {
                    inBits.push({ nIndex: curStageInIdx, sLabel: `x${prefix}_vac_on`, sDescription: "", sOriginalName: `IN[${curStageInIdx}]` });
                    inBits.push({ nIndex: curStageInIdx + 1, sLabel: `x${prefix}_vac_off`, sDescription: "", sOriginalName: `IN[${curStageInIdx + 1}]` });
                }
                curStageInIdx += 2;
            }
        }
        inBits.push({ nIndex: 12800, sLabel: "xReIO_run_all_static", sDescription: "", sOriginalName: "IN[12800]" });

        let inWords = [
            { nIndex: 33, sLabel: "xwProcess_wait_pos", sDescription: "", sOriginalName: "INW[33]" },
            { nIndex: 34, sLabel: "xwProcess_work_pos", sDescription: "", sOriginalName: "INW[34]" }
        ];
        if (options.EnableMultiRecipe) inWords.push({ nIndex: 40, sLabel: "xwP_file_switch", sDescription: "", sOriginalName: "INW[40]" });
        inWords.push({ nIndex: 41, sLabel: "xwSet_speed", sDescription: "Speed settings", sOriginalName: "INW[41]" });
        if (options.EnableTeachingMode) {
            inWords.push(
                { nIndex: 42, sLabel: "xwTeach_offset_X", sDescription: "", sOriginalName: "INW[42]" },
                { nIndex: 44, sLabel: "xwTeach_offset_Y", sDescription: "", sOriginalName: "INW[44]" },
                { nIndex: 46, sLabel: "xwTeach_offset_Z", sDescription: "", sOriginalName: "INW[46]" },
                { nIndex: 48, sLabel: "xwTeach_offset_A", sDescription: "", sOriginalName: "INW[48]" },
                { nIndex: 50, sLabel: "xwTeach_offset_B", sDescription: "", sOriginalName: "INW[50]" },
                { nIndex: 52, sLabel: "xwTeach_offset_C", sDescription: "", sOriginalName: "INW[52]" }
            );
        }
        let valW = 54;
        if (hasVisionIo) {
            inWords.push({ nIndex: valW, sLabel: "xwVision_offset_X", sDescription: "2Word_/10000", sOriginalName: `INW[${valW}]` });
            inWords.push({ nIndex: valW + 2, sLabel: "xwVision_offset_Y", sDescription: "2Word_/10000", sOriginalName: `INW[${valW + 2}]` });
            inWords.push({ nIndex: valW + 4, sLabel: "xwVision_offset_A", sDescription: "2Word_/10000", sOriginalName: `INW[${valW + 4}]` });
            valW += 6;
        }
        for (let j = 0; j < steps.length; j++) {
            let s = steps[j];
            if (s.No > 10) break;
            inWords.push({ nIndex: valW, sLabel: `xwOffset_${s.No}_X`, sDescription: "2 Word, /10000", sOriginalName: `INW[${valW}]` });
            inWords.push({ nIndex: valW + 2, sLabel: `xwOffset_${s.No}_Y`, sDescription: "2 Word, /10000", sOriginalName: `INW[${valW + 2}]` });
            inWords.push({ nIndex: valW + 4, sLabel: `xwOffset_${s.No}_Z`, sDescription: "2 Word, /10000", sOriginalName: `INW[${valW + 4}]` });
            inWords.push({ nIndex: valW + 6, sLabel: `xwOffset_${s.No}_A`, sDescription: "2 Word, /10000", sOriginalName: `INW[${valW + 6}]` });
            valW += 8;
        }
        if (hasPeeling) {
            inWords.push({ nIndex: valW, sLabel: "xwPeel_speed", sDescription: "", sOriginalName: `INW[${valW}]` });
            valW += 1;
        }

        let outBits = [
            { nIndex: 512, sLabel: "yProg_run_sts", sDescription: "Program run status", sOriginalName: "OUT[512]" },
            { nIndex: 513, sLabel: "yProg_stop_sts", sDescription: "Program stopped", sOriginalName: "OUT[513]" },
            { nIndex: 514, sLabel: "yProg_reset_sts", sDescription: "Program reset successful", sOriginalName: "OUT[514]" },
            { nIndex: 515, sLabel: "yAlarm_sts", sDescription: "System fault status", sOriginalName: "OUT[515]" },
            { nIndex: 516, sLabel: "yRemote_mode_sts", sDescription: "ON : PLC can control robot", sOriginalName: "OUT[516]" },
            { nIndex: 519, sLabel: "yRobot_home_sts", sDescription: "", sOriginalName: "OUT[519]" }
        ];
        if (options.EnableTeachingMode) {
            outBits.push(
                { nIndex: 520, sLabel: "yTeach_mode_sts", sDescription: "", sOriginalName: "OUT[520]" },
                { nIndex: 521, sLabel: "yTeach_move_comp", sDescription: "", sOriginalName: "OUT[521]" },
                { nIndex: 524, sLabel: "yTeach_save_comp", sDescription: "", sOriginalName: "OUT[524]" }
            );
        }
        if (options.EnableWaitPos !== false) {
            let baseOutIdx = 528;
            steps.forEach(s => { outBits.push({ nIndex: baseOutIdx, sLabel: `yP${s.No}_wait_pos_comp`, sDescription: "", sOriginalName: `OUT[${baseOutIdx}]` }); baseOutIdx++; });
        }
        let baseOutIdx = 544;
        steps.forEach(s => { outBits.push({ nIndex: baseOutIdx, sLabel: `yP${s.No}_work_pos_comp`, sDescription: "", sOriginalName: `OUT[${baseOutIdx}]` }); baseOutIdx++; });
        if (options.EnableProcessBusy !== false) {
            if (options.EnableWaitPos !== false) {
                baseOutIdx = 560;
                steps.forEach(s => { outBits.push({ nIndex: baseOutIdx, sLabel: `yP${s.No}_wait_pos_busy`, sDescription: "", sOriginalName: `OUT[${baseOutIdx}]` }); baseOutIdx++; });
            }
            baseOutIdx = 576;
            steps.forEach(s => { outBits.push({ nIndex: baseOutIdx, sLabel: `yP${s.No}_work_pos_busy`, sDescription: "", sOriginalName: `OUT[${baseOutIdx}]` }); baseOutIdx++; });
        }
        if (hasPeeling) outBits.push({ nIndex: 600, sLabel: "yPeel_pos_comp", sDescription: "", sOriginalName: "OUT[600]" });

        if (options.EnableToolControl) {
            const isDIO = options.ToolControlType === "DIO";
            if (hasVacuum) {
                if (isDIO) {
                    outBits.push({ nIndex: 0, sLabel: "yTool_vac_on", sDescription: "DIO Tool", sOriginalName: "OUT[0]" }, { nIndex: 1, sLabel: "yTool_vac_off", sDescription: "DIO Tool", sOriginalName: "OUT[1]" });
                    outBits.push({ nIndex: 608, sLabel: "yTool_vac_on_sts", sDescription: "COMM Tool", sOriginalName: "OUT[608]" }, { nIndex: 609, sLabel: "yTool_vac_off_sts", sDescription: "COMM Tool", sOriginalName: "OUT[609]" });
                } else {
                    outBits.push({ nIndex: 608, sLabel: "yTool_vac_on_REQ", sDescription: "", sOriginalName: "OUT[608]" }, { nIndex: 609, sLabel: "yTool_vac_off_REQ", sDescription: "", sOriginalName: "OUT[609]" });
                }
            }
            if (hasGripper) {
                if (isDIO) {
                    outBits.push({ nIndex: 2, sLabel: "yTool_grip", sDescription: "DIO Tool", sOriginalName: "OUT[2]" }, { nIndex: 3, sLabel: "yTool_ungrip", sDescription: "DIO Tool", sOriginalName: "OUT[3]" });
                    outBits.push({ nIndex: 610, sLabel: "yTool_grip_sts", sDescription: "COMM Tool", sOriginalName: "OUT[610]" }, { nIndex: 611, sLabel: "yTool_ungrip_sts", sDescription: "COMM Tool", sOriginalName: "OUT[611]" });
                } else {
                    outBits.push({ nIndex: 610, sLabel: "yTool_grip_REQ", sDescription: "", sOriginalName: "OUT[610]" }, { nIndex: 611, sLabel: "yTool_ungrip_REQ", sDescription: "", sOriginalName: "OUT[611]" });
                }
            }
            if (hasTrash) {
                if (isDIO) {
                    outBits.push({ nIndex: 4, sLabel: "yTrash_grip", sDescription: "DIO Tool", sOriginalName: "OUT[4]" }, { nIndex: 5, sLabel: "yTrash_ungrip", sDescription: "DIO Tool", sOriginalName: "OUT[5]" });
                    outBits.push({ nIndex: 612, sLabel: "yTrash_grip_sts", sDescription: "COMM Tool", sOriginalName: "OUT[612]" }, { nIndex: 613, sLabel: "yTrash_ungrip_sts", sDescription: "COMM Tool", sOriginalName: "OUT[613]" });
                } else {
                    outBits.push({ nIndex: 612, sLabel: "yTrash_grip_REQ", sDescription: "", sOriginalName: "OUT[612]" }, { nIndex: 613, sLabel: "yTrash_ungrip_REQ", sDescription: "", sOriginalName: "OUT[613]" });
                }
            }
            let curStageOutIdx = 614;
            let curDioOutIdx = 6;
            for (let i = 1; i <= stageCount; i++) {
                let prefix = i === 1 ? "Stage" : `Stage${i}`;
                if (isDIO) {
                    outBits.push({ nIndex: curDioOutIdx, sLabel: `y${prefix}_vac_on`, sDescription: "DIO Tool", sOriginalName: `OUT[${curDioOutIdx}]` });
                    outBits.push({ nIndex: curDioOutIdx + 1, sLabel: `y${prefix}_vac_off`, sDescription: "DIO Tool", sOriginalName: `OUT[${curDioOutIdx + 1}]` });
                    outBits.push({ nIndex: curStageOutIdx, sLabel: `y${prefix}_vac_on_sts`, sDescription: "COMM Tool", sOriginalName: `OUT[${curStageOutIdx}]` });
                    outBits.push({ nIndex: curStageOutIdx + 1, sLabel: `y${prefix}_vac_off_sts`, sDescription: "COMM Tool", sOriginalName: `OUT[${curStageOutIdx + 1}]` });
                    curDioOutIdx += 2;
                } else {
                    outBits.push({ nIndex: curStageOutIdx, sLabel: `y${prefix}_vac_on_REQ`, sDescription: "", sOriginalName: `OUT[${curStageOutIdx}]` });
                    outBits.push({ nIndex: curStageOutIdx + 1, sLabel: `y${prefix}_vac_off_REQ`, sDescription: "", sOriginalName: `OUT[${curStageOutIdx + 1}]` });
                }
                curStageOutIdx += 2;
            }
        }

        let outWords = [
            { nIndex: 33, sLabel: "ywProcess_wait_comp", sDescription: "", sOriginalName: "OUTW[33]" },
            { nIndex: 34, sLabel: "ywProcess_work_comp", sDescription: "", sOriginalName: "OUTW[34]" },
            { nIndex: 35, sLabel: "ywProcess_wait_busy", sDescription: "", sOriginalName: "OUTW[35]" },
            { nIndex: 36, sLabel: "ywProcess_work_busy", sDescription: "", sOriginalName: "OUTW[36]" }
        ];
        if (options.EnableMultiRecipe) outWords.push({ nIndex: 46, sLabel: "ywCur_P_file", sDescription: "", sOriginalName: "OUTW[46]" });
        outWords.push(
            { nIndex: 47, sLabel: "ywCur_speed", sDescription: "", sOriginalName: "OUTW[47]" },
            { nIndex: 49, sLabel: "ywCur_mode", sDescription: "", sOriginalName: "OUTW[49]" },
            { nIndex: 50, sLabel: "ywCur_alarm_code", sDescription: "", sOriginalName: "OUTW[50]" },
            { nIndex: 51, sLabel: "ywCur_pos_X", sDescription: "", sOriginalName: "OUTW[51]" },
            { nIndex: 53, sLabel: "ywCur_pos_Y", sDescription: "", sOriginalName: "OUTW[53]" },
            { nIndex: 55, sLabel: "ywCur_pos_Z", sDescription: "", sOriginalName: "OUTW[55]" },
            { nIndex: 57, sLabel: "ywCur_pos_A", sDescription: "", sOriginalName: "OUTW[57]" },
            { nIndex: 59, sLabel: "ywCur_pos_B", sDescription: "", sOriginalName: "OUTW[59]" },
            { nIndex: 61, sLabel: "ywCur_pos_C", sDescription: "", sOriginalName: "OUTW[61]" }
        );
        if (options.EnableTcpSpeed) outWords.push({ nIndex: 63, sLabel: "ywCur_TCP_speed", sDescription: "", sOriginalName: "OUTW[63]" });
        if (options.EnableTorque) {
            outWords.push({ nIndex: 64, sLabel: "ywCur_J1_torque", sDescription: "", sOriginalName: "OUTW[64]" }, { nIndex: 65, sLabel: "ywCur_J2_torque", sDescription: "", sOriginalName: "OUTW[65]" }, { nIndex: 66, sLabel: "ywCur_J3_torque", sDescription: "", sOriginalName: "OUTW[66]" }, { nIndex: 67, sLabel: "ywCur_J4_torque", sDescription: "", sOriginalName: "OUTW[67]" });
            if (!isScara) outWords.push({ nIndex: 68, sLabel: "ywCur_J5_torque", sDescription: "", sOriginalName: "OUTW[68]" }, { nIndex: 69, sLabel: "ywCur_J6_torque", sDescription: "", sOriginalName: "OUTW[69]" });
        }
        outWords.push({ nIndex: 801, sLabel: "ywReIO_cur_control", sDescription: "", sOriginalName: "OUTW[801]" });

        let bVars = [
            { nIndex: 0, sLabel: "B_Tool", sDescription: "", sOriginalName: "B[0]" },
            { nIndex: 1, sLabel: "B_Wobj", sDescription: "", sOriginalName: "B[1]" },
            { nIndex: 2, sLabel: "B_PR", sDescription: "", sOriginalName: "B[2]" },
            { nIndex: 3, sLabel: "B_path", sDescription: "", sOriginalName: "B[3]" },
            { nIndex: 4, sLabel: "B_Cur_process", sDescription: "", sOriginalName: "B[4]" }
        ];
        let rVars = [{ nIndex: 0, sLabel: "R_Cur_pos", sDescription: "", sOriginalName: "R[0]" }];
        let dVars = [];
        if (options.EnableTcpSpeed) dVars.push({ nIndex: 0, sLabel: "D_TCP_speed", sDescription: "", sOriginalName: "D[0]" });
        if (options.EnableTorque) {
            dVars.push({ nIndex: 1, sLabel: "D_J1_cur_torque", sDescription: "", sOriginalName: "D[1]" }, { nIndex: 2, sLabel: "D_J2_cur_torque", sDescription: "", sOriginalName: "D[2]" }, { nIndex: 3, sLabel: "D_J3_cur_torque", sDescription: "", sOriginalName: "D[3]" }, { nIndex: 4, sLabel: "D_J4_cur_torque", sDescription: "", sOriginalName: "D[4]" });
            if (!isScara) dVars.push({ nIndex: 5, sLabel: "D_J5_cur_torque", sDescription: "", sOriginalName: "D[5]" }, { nIndex: 6, sLabel: "D_J6_cur_torque", sDescription: "", sOriginalName: "D[6]" });
            dVars.push({ nIndex: 7, sLabel: "D_J1_max_torque", sDescription: "", sOriginalName: "D[7]" }, { nIndex: 8, sLabel: "D_J2_max_torque", sDescription: "", sOriginalName: "D[8]" }, { nIndex: 9, sLabel: "D_J3_max_torque", sDescription: "", sOriginalName: "D[9]" }, { nIndex: 10, sLabel: "D_J4_max_torque", sDescription: "", sOriginalName: "D[10]" });
            if (!isScara) dVars.push({ nIndex: 11, sLabel: "D_J5_max_torque", sDescription: "", sOriginalName: "D[11]" }, { nIndex: 12, sLabel: "D_J6_max_torque", sDescription: "", sOriginalName: "D[12]" });
        }

        function createSection(name, arr) {
            return `  "${name}": {\n    "nNumberOfLabels": ${arr.length},\n    "LabelsArray": [\n${arr.map((a, i) => `      {\n        "nLabelId": ${i},\n        "nIndex": ${a.nIndex},\n        "sLabel": "${a.sLabel}",\n        "sDescription": "${a.sDescription}",\n        "sOriginalName": "${a.sOriginalName}"\n      }`).join(',\n')}\n    ]\n  }`;
        }

        return `{\n` +
            createSection("InputBitLabels", inBits) + ",\n" +
            createSection("InputByteLabels", []) + ",\n" +
            createSection("InputWordLabels", inWords) + ",\n" +
            createSection("OutputBitLabels", outBits) + ",\n" +
            createSection("OutputByteLabels", []) + ",\n" +
            createSection("OutputWordLabels", outWords) + ",\n" +
            createSection("AdLabels", []) + ",\n" +
            createSection("DaLabels", []) + ",\n" +
            createSection("BVarLabels", bVars) + ",\n" +
            createSection("RVarLabels", rVars) + ",\n" +
            createSection("DVarLabels", dVars) + "\n}";
    }
};
