// Generator functions corresponding to C# ProjectGenerator, EasyMode, Labels.
const TemplateHelper = {
    getNow() { return new Date().toLocaleString('sv-SE').replace('-', '-').replace('T', ' '); }, // Similar to "yyyy-MM-dd HH:mm:ss"
    getNowAmPm() { return new Date().toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).replace(',', ''); }
};

const Generator = {
    TcpSpeedProgram(robotName) {
        return `ProgramInfo\n    Version = "S4.24"\n    VRC = "V4R24"\n    Time = "${TemplateHelper.getNowAmPm()}"\n    RobotName = "${robotName}"\nEndProgramInfo\nStart;\n    Double TCP_dist;\n    LP[0] = GetCurPos();\n    While True\n        Delay T[0.1];\n        LP[1] = GetCurPos();\n        TCP_dist = Dist(LP[0],LP[1]);\n        D_TCP_speed = TCP_dist / 0.1;\n        LP[1] = LP[0];\n        ywCur_TCP_speed = D_TCP_speed;\n    EndWhile;\nEnd;`;
    },
    TorqueProgram(robotName) {
        let ratios = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
        let csvLines = Assets.Robots_Torque.split(/\r?\n/);
        let foundRobot = null;
        for(let i=1; i<csvLines.length; i++) {
             let cols = csvLines[i].split(',');
             if(cols.length < 6) continue;
             let mName = cols[0].trim();
             if(!mName) continue;
             
             if(foundRobot && mName !== foundRobot) {
                 if (ratios.some(r => r !== 1.0)) break; 
             }
             if(mName && (robotName.toLowerCase().includes(mName.toLowerCase()) || mName.toLowerCase().includes(robotName.toLowerCase()))) {
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
        return `ProgramInfo\n    Version = "S4.24"\n    VRC = "V4R24"\n    Time = "${TemplateHelper.getNowAmPm()}"\n    RobotName = "${robotName}"\nEndProgramInfo\nStart;\n    D_J1_cur_torque = Abs(GetTorque(1) * ${ratios[0].toFixed(3)});\n    D_J2_cur_torque = Abs(GetTorque(2) * ${ratios[1].toFixed(3)});\n    D_J3_cur_torque = Abs(GetTorque(3) * ${ratios[2].toFixed(3)});\n    D_J4_cur_torque = Abs(GetTorque(4) * ${ratios[3].toFixed(3)});\n    D_J5_cur_torque = Abs(GetTorque(5) * ${ratios[4].toFixed(3)});\n    D_J6_cur_torque = Abs(GetTorque(6) * ${ratios[5].toFixed(3)});\n    #================================================================================\n    ywCur_J1_torque = D_J1_cur_torque;\n    ywCur_J2_torque = D_J2_cur_torque;\n    ywCur_J3_torque = D_J3_cur_torque;\n    ywCur_J4_torque = D_J4_cur_torque;\n    ywCur_J5_torque = D_J5_cur_torque;\n    ywCur_J6_torque = D_J6_cur_torque;\n    #================================================================================\n    If D_J1_cur_torque > D_J1_max_torque\n        D_J1_max_torque = D_J1_cur_torque;\n    EndIf;\n    If D_J2_cur_torque > D_J2_max_torque\n        D_J2_max_torque = D_J2_cur_torque;\n    EndIf;\n    If D_J3_cur_torque > D_J3_max_torque\n        D_J3_max_torque = D_J3_cur_torque;\n    EndIf;\n    If D_J4_cur_torque > D_J4_max_torque\n        D_J4_max_torque = D_J4_cur_torque;\n    EndIf;\n    If D_J5_cur_torque > D_J5_max_torque\n        D_J5_max_torque = D_J5_cur_torque;\n    EndIf;\n    If D_J6_cur_torque > D_J6_max_torque\n        D_J6_max_torque = D_J6_cur_torque;\n    EndIf;\nEnd;`;
    },
    ToolControlProgram(options, steps) {
        if (!options.EnableToolControl) return null;
        let hasVacuum = false, hasGripper = false, hasTrash = false;
        let stageCount = 0;
        
        steps.forEach(s => {
            if (s.ToolType === "Vacuum") hasVacuum = true;
            if (s.ToolType === "Gripper" || s.WorkType === "Peeling" || s.WorkMethod === "Peeling") hasGripper = true;
            if (s.WorkType === "Trash") hasTrash = true;
            if (s.WorkType === "Stage") stageCount++;
        });

        let sb = `ProgramInfo\n    Version = "S4.24"\n    VRC = "V4R24"\n    Time = "${TemplateHelper.getNow()}"\n    RobotName = "${options.RobotName}"\nEndProgramInfo\n`;

        if (hasVacuum) {
            sb += `Func Tool_Vac_ON()\n    Set yTool_vac_off_REQ,OFF;\n    Set yTool_vac_on_REQ,ON;\n    Wait xTool_vac_on == ON, T[60], Goto L[900];\n    Set yTool_vac_on_REQ,OFF;\n    Ret;\n    L[900]:\n    s01_initial.Init_signal();\n    Alarm[0];\nEndFunc;\n#====================================================================================\nFunc Tool_Vac_OFF()\n    Set yTool_vac_on_REQ,OFF;\n    Set yTool_vac_off_REQ,ON;\n    Wait xTool_vac_off == ON, T[60], Goto L[901];\n    Set yTool_vac_off_REQ,OFF;\n    Ret;\n    L[901]:\n    s01_initial.Init_signal();\n    Alarm[1];\nEndFunc;\n`;
        }
        if (hasGripper) {
            sb += `#====================================================================================\nFunc Tool_Grip()\n    Set yTool_ungrip_REQ,OFF;\n    Set yTool_grip_REQ,ON;\n    Wait xTool_grip == ON, T[60], Goto L[902];\n    Set yTool_grip_REQ,OFF;\n    Ret;\n    L[902]:\n    s01_initial.Init_signal();\n    Alarm[2];\nEndFunc;\n#====================================================================================\nFunc Tool_Ungrip()\n    Set yTool_grip_REQ,OFF;\n    Set yTool_ungrip_REQ,ON;\n    Wait xTool_ungrip == ON, T[60], Goto L[903];\n    Set yTool_ungrip_REQ,OFF;\n    Ret;\n    L[903]:\n    s01_initial.Init_signal();\n    Alarm[3];\nEndFunc;\n`;
        }
        if (hasTrash) {
            sb += `#====================================================================================\nFunc Trash_Grip()\n    Set yTrash_ungrip_REQ,OFF;\n    Set yTrash_grip_REQ,ON;\n    Wait xTrash_grip == ON, T[60], Goto L[904];\n    Set yTrash_grip_REQ,OFF;\n    Ret;\n    L[904]:\n    s01_initial.Init_signal();\n    Alarm[4];\nEndFunc;\n#====================================================================================\nFunc Trash_Ungrip()\n    Set yTrash_grip_REQ,OFF;\n    Set yTrash_ungrip_REQ,ON;\n    Wait xTrash_ungrip == ON, T[60], Goto L[905];\n    Set yTrash_ungrip_REQ,OFF;\n    Ret;\n    L[905]:\n    s01_initial.Init_signal();\n    Alarm[5];\nEndFunc;\n`;
        }
        let baseLabelOn = 906, baseLabelOff = 907;
        for (let i = 1; i <= stageCount; i++) {
            let prefix = i === 1 ? "Stage" : `Stage${i}`;
            let lOn = baseLabelOn + (i - 1) * 2;
            let lOff = baseLabelOff + (i - 1) * 2;
            sb += `#====================================================================================\nFunc ${prefix}_Vac_ON()\n    Set y${prefix}_vac_off_REQ,OFF;\n    Set y${prefix}_vac_on_REQ,ON;\n    Wait x${prefix}_vac_on == ON, T[60], Goto L[${lOn}];\n    Set y${prefix}_vac_on_REQ,OFF;\n    Ret;\n    L[${lOn}]:\n    s01_initial.Init_signal();\n    Alarm[6];\nEndFunc;\n#====================================================================================\nFunc ${prefix}_Vac_OFF()\n    Set y${prefix}_vac_on_REQ,OFF;\n    Set y${prefix}_vac_off_REQ,ON;\n    Wait x${prefix}_vac_off == ON, T[60], Goto L[${lOff}];\n    Set y${prefix}_vac_off_REQ,OFF;\n    Ret;\n    L[${lOff}]:\n    s01_initial.Init_signal();\n    Alarm[7];\nEndFunc;\n`;
        }
        return sb;
    },
    MainProgram(steps, options) {
        let sb = `ProgramInfo\n    Version = "S4.24"\n    VRC = "V4R24"\n    Time = "${TemplateHelper.getNowAmPm()}"\n    RobotName = "${options.RobotName}"\nEndProgramInfo\nInclude "s01_initial.pro";\n`;
        if (options.EnableToolControl) sb += `Include "s02_Tool_Control.pro";\n`;
        steps.forEach(s => sb += `Include "${s.ProcessName}.pro";\n`);
        sb += `Start;\n    L[0]:\n`;
        if (options.EnableMultiRecipe) sb += `    s01_initial.Manual_set_recipe();\n`;
        sb += `    If xwSet_speed <= 0\n        Velset Rate[1];\n    ElseIf xwSet_speed > 100\n        Velset Rate[100];\n    Else\n        Velset Rate[xwSet_speed];\n    EndIf;\n    #================================================================================\n    If xRobot_homing\n        s01_initial.Init_move_home();\n        s01_initial.Init_signal();\n    EndIf;\n    #================================================================================\n    If xReturn_wait_pos\n        Return_wait_pos();\n    EndIf;\n    #================================================================================\n    If InW[33] <> OutW[33]\n        Switch InW[33]\n`;
        steps.forEach((s, idx) => {
            let cv = 1 << idx;
            sb += `            Case ${cv}:\n                ${s.ProcessName}.P${s.No}_main();\n                Break;\n`;
        });
        sb += `        EndSwitch;\n    EndIf;\n    Delay T[0.1];\n    Goto L[0];\nEnd;\n#====================================================================================\nFunc Return_wait_pos()\n    Set yWait_pos_running, ON;\n    s01_initial.Return_move();\n    s01_initial.Init_signal();\n    Set yWait_pos_comp, ON;\n    Set yWait_pos_running, OFF;\nEndFunc;\n`;
        return sb;
    },
    InitialProgram(steps, options) {
        let lastPosNum = 0;
        steps.forEach(s => {
            let offset = (s.WorkType === "Peeling" || s.WorkMethod === "Peeling") ? 20 : 11;
            let mPos = (s.No * 100) + offset;
            if (mPos > lastPosNum) lastPosNum = mPos;
        });
        let sb = `ProgramInfo\n    Version = "S4.24"\n    VRC = "V4R24"\n    Time = "${TemplateHelper.getNowAmPm()}"\n    RobotName = "${options.RobotName}"\nEndProgramInfo\n`;
        sb += `#====================================================================================\n#  Init Signal\n#====================================================================================\nFunc Init_signal()\n    Clear Out[528],192; #[528] ~ [719]\n    Set yRobot_homing,OFF;\nEndFunc;\n`;
        sb += `#====================================================================================\n#  Init Move Home\n#====================================================================================\nFunc Init_move_home()\n    #================================================================================\n    #  Signal Set                  \n    #================================================================================\n    B_W_num = R_Cur_pos / 100;\n    Set yRobot_homing,ON;\n    #================================================================================\n    #  Find cur point number                  \n    #================================================================================\n    If yRobot_home_sts\n        R_Cur_pos = 0;\n    Else\n        Find_cur_point_all();\n    EndIf;\n    #================================================================================\n    Velset 50;\n    Bool return_result = Return_move();\n    If return_result == OFF\n        Velset OFF;\n        Set yRobot_homing,OFF;\n        Print "Homing Fail! Incorrect value. R_Cur_pos :  " + R_Cur_pos;\n        Alarm[15]; #Homing Error\n    EndIf;\n    #================================================================================\n    R_Cur_pos = 0;\n    Home[0],V[100];\n    Velset OFF;\n    Set yRobot_homing,OFF;\nEndFunc;\n`;
        sb += `#====================================================================================\n#  Return Move\n#====================================================================================\nFunc Bool Return_move()\n    Int cur_proces = R_Cur_pos / 100;\n    Print "Return move Process : " + cur_proces;\n    Switch R_Cur_pos\n        Case 0: #Home\n            Break;\n`;
        steps.forEach(s => {
            let isPeeling = s.WorkType === "Peeling" || s.WorkMethod === "Peeling";
            let tNum = s.ToolType === "Gripper" ? "2" : "1";
            sb += `        #============================================================================\n        #  P${s.No} - ${s.WorkType} ${s.WorkMethod}\n        #============================================================================\n`;    
            if (isPeeling) {
                sb += `        Case ${s.No}12:\n            Movl P${s.No}_Peel_1,V[100],Z[2],Tool[${tNum}],Wobj[B_W_num];\n            R_Cur_pos = ${s.No}12;\n        Case ${s.No}13:\n            Movl P${s.No}_Peel_2,V[100],Z[2],Tool[${tNum}],Wobj[B_W_num];\n            R_Cur_pos = ${s.No}13;\n        Case ${s.No}14:\n            Movl P${s.No}_Peel_3,V[100],Z[2],Tool[${tNum}],Wobj[B_W_num];\n            R_Cur_pos = ${s.No}14;\n        Case ${s.No}15:\n            Movl P${s.No}_Peel_4,V[100],Z[2],Tool[${tNum}],Wobj[B_W_num];\n            R_Cur_pos = ${s.No}15;\n        Case ${s.No}16:\n            Movl P${s.No}_Peel_5,V[100],Z[2],Tool[${tNum}],Wobj[B_W_num];\n            R_Cur_pos = ${s.No}16;\n        Case ${s.No}20:\n            R_Cur_pos = ${s.No}20;\n            Movl P${s.No}_Peel_end,V[100],Z[2],Tool[${tNum}],Wobj[B_W_num];\n            R_Cur_pos = ${s.No}00;\n            Movj P${s.No}_App,V[100],Z[CP],Tool[${tNum}],Wobj[B_W_num];\n            Break;\n        #============================================================================\n`;
            }
            sb += `        Case ${s.No}11:\n            Movl Offset(P${s.No}_Up, PR[B_PR_num]),V[100],Z[0],Tool[${tNum}],Wobj[B_W_num];\n            R_Cur_pos = ${s.No}10;\n        Case ${s.No}10:\n            Movj P${s.No}_Wait,V[100],Z[0],Tool[${tNum}],Wobj[B_W_num];\n            R_Cur_pos = ${s.No}01;\n        Case ${s.No}00 To ${s.No}01:\n            Movj P${s.No}_App,V[100],Z[CP],Tool[${tNum}],Wobj[B_W_num];\n            R_Cur_pos = ${s.No}00;\n            Break;\n`;
        });
        sb += `        #============================================================================\n        #  Other\n        #============================================================================\n        Default:\n            Return False;\n            Break;\n    EndSwitch;\n    Return True;\nEndFunc;\n`;
        sb += `#====================================================================================\n#  Find Current Point Number\n#====================================================================================\nFunc Find_cur_point_all()\n    Int min_index;\n    Int PR_num;\n    Int last_pos_num = ${lastPosNum}; # Find range : P[0] ~ P[${lastPosNum}]\n    int i;    \n    Double pos_dist[${lastPosNum + 1}];\n    Double min_dist = 5000;\n    #================================================================================\n    LP[0] = GetCurPos();\n    For i=0,i<=last_pos_num,Step[1]\n        pos_dist[i] = Dist(P[i],LP[0]);\n        If (i % 100) >= 10 And (i % 100) <= 11\n            PR_num = i / 100;\n            LP[1] = Offset(P[i],PR[PR_num]);\n            pos_dist[i] = Dist(LP[1],LP[0]);\n        EndIf;\n        If pos_dist[i] < min_dist\n            min_dist = pos_dist[i];\n            min_index = i;\n        EndIf;\n    EndFor;\n    #================================================================================\n    If min_dist < 1 \n        Print "Current pos : P[ " + min_index + " ]";\n        R_Cur_pos = min_index;\n    Else\n        Print "Cannot find the correct point number. Proceeding to Home based on R_cur_pos.";\n    EndIf;\nEndFunc;\n`;
        if (options.EnableMultiRecipe && options.RecipeCount > 1) {
            sb += `#====================================================================================\n#  Manual Set Recipe                     \n#====================================================================================\nFunc Manual_set_recipe() #Change recipe  \n    Switch xwP_file_switch\n        Case 0:\n            LoadPoints("P.pts");\n            Break;\n`;
            for (let i = 1; i < options.RecipeCount; i++) {
                sb += `        Case ${i}:\n            LoadPoints("P${i.toString().padStart(2, '0')}.pts");\n            Break;\n`;
            }
            sb += `    EndSwitch;\n    Print "Manual set recipe : " + GetCurPointsFileName();\nEndFunc;\n`;
        }
        return sb;
    },
    ProcessProgram(s, options, stageIndex) {
        let n = s.No;
        let type = s.WorkType, method = s.WorkMethod, tool = s.ToolType, visionUse = s.VisionUse;
        let stagePrefix = stageIndex === 1 ? "Stage" : `Stage${stageIndex}`;
        let tNum = tool === "Gripper" ? "2" : "1";
        
        // Offset Logic
        let offsetFunc = `Func Set_offset()\n    PR[B_PR_num] = (xwP${n}_offset_X.Int/10000,xwP${n}_offset_Y.Int/10000,xwP${n}_offset_Z.Int/10000,xwP${n}_offset_A.Int/10000,0,0);\nEndFunc;`;
        if (visionUse === "Use - IO") {
            offsetFunc = `Func Set_offset()\n    LPR[B_PR_num] = (xwVision_offset_X.Int/10000,xwVision_offset_Y.Int/10000,0,xwVision_offset_A.Int/10000,0,0);\n    PR[B_PR_num] = (xwP${n}_offset_X.Int/10000,xwP${n}_offset_Y.Int/10000,xwP${n}_offset_Z.Int/10000,xwP${n}_offset_A.Int/10000,0,0);\n    PR[B_PR_num] = PR[B_PR_num] + LPR[B_PR_num];\nEndFunc;`;
        } else if (visionUse === "Use - Socket" && method !== "Check" && method !== "Calibration") {
            offsetFunc = `Func Set_offset()\n    PR[B_PR_num] = (xwP${n}_offset_X.Int/10000,xwP${n}_offset_Y.Int/10000,xwP${n}_offset_Z.Int/10000,xwP${n}_offset_A.Int/10000,0,0);\n    PR[B_PR_num] = PR[B_PR_num] + PR[0];\nEndFunc;`;
        } else if (n > 10) {
            offsetFunc = `Func Set_offset()\n    PR[B_PR_num] = (0,0,0,0,0,0);\nEndFunc;`;
        }

        let chkHeader = "    #================================================================================\n    #  Tool position check                 \n    #================================================================================\n";
        let ctrlHeader = "    #================================================================================\n";
        let toolPosCheck = "", toolCtrlLogic = "";
        
        if (options.EnableToolControl) {
            if (type === "Trash") {
                toolPosCheck = chkHeader + "    If xTrash_ungrip\n        Alarm[15];\n    EndIf;\n";
                toolCtrlLogic = ctrlHeader + "    s02_Tool_Control.Trash_Grip();\n    s02_Tool_Control.Tool_Vac_OFF();\n    s02_Tool_Control.Trash_Ungrip();\n";
            } else if (method === "Get") {
                if (tool === "Vacuum") {
                    toolPosCheck = chkHeader + "    If xTool_vac_on\n        Alarm[15];\n    EndIf;\n";
                    toolCtrlLogic = ctrlHeader + "    s02_Tool_Control.Tool_Vac_ON();\n" + (type === "Stage" ? `    s02_Tool_Control.${stagePrefix}_Vac_OFF();\n` : "");
                } else if (tool === "Gripper") {
                    toolPosCheck = chkHeader + "    If xTool_grip\n        Alarm[15];\n    EndIf;\n";
                    toolCtrlLogic = ctrlHeader + "    s02_Tool_Control.Tool_Grip();\n" + (type === "Stage" ? `    s02_Tool_Control.${stagePrefix}_Vac_OFF();\n` : "");
                }
            } else if (method === "Put") {
                if (tool === "Vacuum") {
                    toolPosCheck = chkHeader + "    If xTool_vac_off\n        Alarm[15];\n    EndIf;\n";
                    toolCtrlLogic = ctrlHeader + (type === "Stage" ? `    s02_Tool_Control.${stagePrefix}_Vac_ON();\n    s02_Tool_Control.Tool_Vac_OFF();\n` : "    s02_Tool_Control.Tool_Vac_OFF();\n");
                } else if (tool === "Gripper") {
                    toolPosCheck = chkHeader + "    If xTool_ungrip\n        Alarm[15];\n    EndIf;\n";
                    toolCtrlLogic = ctrlHeader + (type === "Stage" ? `    s02_Tool_Control.${stagePrefix}_Vac_ON();\n    s02_Tool_Control.Tool_Ungrip();\n` : "    s02_Tool_Control.Tool_Ungrip();\n");
                }
            } else if (method === "Peeling" || type === "Peeling") {
                toolPosCheck = chkHeader + "    If xTool_grip\n        Alarm[15];\n    EndIf;\n";
                toolCtrlLogic = ctrlHeader + "    s02_Tool_Control.Tool_Grip();\n";
            }
        }

        let isCalib = method === "Calibration", isPeeling = type === "Peeling" || method === "Peeling";
        let isSocket = (method === "Check" && visionUse === "Use - Socket") || (isCalib && tool === "Vision (Socket)");
        
        let peekInit = isPeeling ? "    Set yPeel_pos_comp,OFF;\n" : "";
        let connectSocket = "", startAction = "", endAction = "", afterTeach = "";
        
        let socketFuncs = "";
        if (isSocket) {
            let vis = options.VisionConfigs[n - 1] || { IsClient: true, IpAddress: "192.168.1.10", Port: "5000" };
            let cFunc = vis.IsClient ? "Connect_socket_client" : "Connect_socket_server";
            if (method === "Check") {
                afterTeach = `\n    #================================================================================\n    ${cFunc}();\n    Send_data("Shot");\n    Receive_data();\n`;
            } else {
                connectSocket = `    ${cFunc}();\n`;
            }
            // Generate Helper functions for socket inline
            socketFuncs = "\n#====================================================================================\n";
            if (vis.IsClient) {
                socketFuncs += `#  Open Socket (Client)\n#====================================================================================\nFunc Connect_socket_client() #Client Only\n    Print "P${n} - Vision Socket Connect Start";\n    #================================================================================\n    #  Signal                     \n    #================================================================================\n    Close Socket,2;\n    Int i;\n    Int error_count = 5;\n    String server_IP = "${vis.IpAddress}";\n    Int server_port = ${vis.Port};\n    #================================================================================\n    #  Connect Socket                      \n    #================================================================================\n    For i=1,i <= error_count,Step[1]\n        Open Socket(server_IP,server_port,2,Single,LB[0]);\n        If LB[0] == 1\n            Break;\n        ElseIf LB[0] == 0 And i >= error_count\n            Alarm[13];#Socket COMM Error\n        EndIf;\n        Delay T[0.5];\n    EndFor;\n    Print "P${n} - Vision Socket Connect End";\nEndFunc;\n`;
            } else {
                socketFuncs += `#  Open Socket (Server)\n#====================================================================================\nFunc Connect_socket_server() #Server Only\n    Print "P${n} - Vision Socket Connect Start";\n    #================================================================================\n    #  Signal                     \n    #================================================================================\n    Close Socket,2;\n    Int i;\n    Int error_count = 5;\n    #================================================================================\n    #  Connect Socket                      \n    #================================================================================\n    For i=1,i <= error_count,Step[1]\n        LB[0] = GetPortState(2);\n        If LB[0] == 1\n            Break;\n        ElseIf LB[0] == 0 And i >= error_count\n            Alarm[13];#Socket COMM Error\n        EndIf;\n        Delay T[0.5];\n    EndFor;\n    Print "P${n} - Vision Socket Connect End";\nEndFunc;\n`;
            }
            if (method === "Check") {
                socketFuncs += `#====================================================================================\n#  Send data\n#====================================================================================\nFunc Send_data(String send_data) \n    Send Port[2],send_data;\n    Print "P${n} Vision Offset Sent data: " + send_data;\nEndFunc;\n#====================================================================================\n#  Receive data\n#====================================================================================\nFunc Receive_data()\n    L[800]:\n    Get Port[2],T[100],Goto L[800]; \n    String received_data = GetPortbuf(0,100,2);\n    LB[0] = StrGetData(received_data,",", LD[0]);\n    PR[0] = (LD[0], LD[1], 0, LD[2], 0, 0); \n    Print "P${n} Vision Offset Received data: " + PR[0];\nEndFunc;\n`;
            } else {
                socketFuncs += `#====================================================================================\n#  Send data\n#====================================================================================\nFunc Send_data(String send_data) \n    Send Port[2],send_data;\n    Print "P${n} - Vision Socket Sent data : " + send_data;\nEndFunc;\n#====================================================================================\n#  Receive data\n#====================================================================================\nFunc String Receive_data()\n    L[800]:\n    Get Port[2],T[100],Goto L[800]; \n    String received_data = GetPortbuf(0,100,2);\n    Print "P${n} - Vision Socket Received data : " + received_data;\n    Return received_data;\nEndFunc;\n`;
            }
        }

        if (isPeeling) {
            let waitingGrip = "";
            if (!options.EnableToolControl) {
                waitingGrip = `\n    #================================================================================\n    #  waiting Grip                     \n    #================================================================================\n\n    Set yPeel_pos_comp,ON;\n    Wait xPeel_start == ON;\n    Set yPeel_pos_comp,OFF;`;
            }
            startAction = `${waitingGrip}\n    #================================================================================\n    #  Peeling                      \n    #================================================================================\n    R_Cur_pos = ${n}12;\n    Movl P${n}_Peel_1,Speed[xwPeel_speed],Z[2],Tool[B_T_num],Wobj[B_W_num];\n    R_Cur_pos = ${n}13;\n    Movl P${n}_Peel_2,Speed[xwPeel_speed],Z[2],Tool[B_T_num],Wobj[B_W_num];\n    R_Cur_pos = ${n}14;\n    Movl P${n}_Peel_3,Speed[xwPeel_speed],Z[2],Tool[B_T_num],Wobj[B_W_num];\n    R_Cur_pos = ${n}15;\n    Movl P${n}_Peel_4,Speed[xwPeel_speed],Z[2],Tool[B_T_num],Wobj[B_W_num];\n    R_Cur_pos = ${n}16;\n    Movl P${n}_Peel_5,Speed[xwPeel_speed],Z[2],Tool[B_T_num],Wobj[B_W_num];\n`;
            endAction += `    R_Cur_pos = ${n}20;\n    Movl P${n}_Peel_end,Speed[xwPeel_speed],Z[0],Tool[B_T_num],Wobj[B_W_num];\n`;
        } else if (isCalib) {
            if (tool === "PLC (IO)") {
                startAction = `\n    #================================================================================\n    #  Vision Calibration Start                 \n    #================================================================================\n    Delay T[0.5];\n    LP[0] = GetCurPos();\n    While xVision_cali_comp == OFF\n        Print "Arrived " + B_Vision_cali_count + " position";\n        Set yVision_move_comp,ON;\n        Wait xVision_move_next == ON Or xVision_cali_comp == ON;\n        #============================================================================\n        If xVision_move_next\n            Set yVision_move_comp,OFF;\n            Set_offset();\n            Movl Offset(LP[0], PR[B_PR_num]),Speed[25],Fine,Tool[B_T_num],Wobj[B_W_num];\n            Incr B_Vision_cali_count;\n            Delay T[0.5];\n        Else\n            Set yVision_move_comp,OFF;\n            B_Vision_cali_count = 1;\n            Break;\n        EndIf;\n    EndWhile;\n`;
            } else {
                startAction = `\n    #================================================================================\n    #  Vision Calibration Start                 \n    #================================================================================\n    Delay T[0.5];\n    LP[0] = GetCurPos();\n    Send_data("CAL_START");\n    While True\n        Print "Arrived " + B_Vision_cali_count + " position";\n        Str[0] = Receive_data();\n        If Strcmp(Str[0],"CAL_END") == 0\n            B_Vision_cali_count = 1;\n            Break;\n        Else \n            LB[0] = StrGetData(Str[0],",",LD[0]);\n            LPR[0] = (LD[0],LD[1],0,LD[2],0,0); #X, Y, A(Rz)\n            Movl Offset(LP[0], LPR[0]),Speed[25],Fine,Tool[B_T_num],Wobj[B_W_num];\n            Delay T[0.5];\n            Send_data("CAL_SHOT");\n            Incr B_Vision_cali_count;\n        EndIf;\n    EndWhile;\n`;
            }
        }

        let mainStr = `ProgramInfo\n    Version = "S4.24"\n    VRC = "V4R24"\n    Time = "${TemplateHelper.getNowAmPm()}"\n    RobotName = "${options.RobotName}"\nEndProgramInfo\nFunc P${n}_main()\n${toolPosCheck}    #================================================================================\n    #  Return move before process pos                 \n    #================================================================================\n    OutW[33] = 0; #Process signal reset\n${peekInit}    Set yP${n}_running,ON;\n    Bool return_result = s01_initial.Return_move();\n    #================================================================================\n    #  Signal Initial                      \n    #================================================================================\n    L[0]:\n    Print "P${n} - ${type} ${method} Start";\n    B_T_num = ${tNum}; #Tool No\n    B_W_num = ${n};\n    B_PR_num = ${n}0;\n${connectSocket}    #================================================================================\n    Set_offset();\n    #================================================================================\n    #  Move                     \n    #================================================================================\n    R_Cur_pos = ${n}00;\n    Movj P${n}_App,V[100],Z[CP],Tool[B_T_num],Wobj[B_W_num];\n    R_Cur_pos = ${n}01;\n    Movj P${n}_Wait,V[100],Z[0],Tool[B_T_num],Wobj[B_W_num];\n    R_Cur_pos = ${n}10;\n    Movl Offset(P${n}_Up, PR[B_PR_num]),V[100],Z[0],Tool[B_T_num],Wobj[B_W_num];\n    R_Cur_pos = ${n}11;\n    Movl Offset(P${n}_Down, PR[B_PR_num]),Speed[100],Fine,Tool[B_T_num],Wobj[B_W_num];\n    #================================================================================\n    If xTeaching_mode\n        P${n}_teaching_mode();\n    EndIf;\n${afterTeach}${toolCtrlLogic}${startAction}    #================================================================================\n    #  Process Complete                    \n    #================================================================================\n${endAction}    Print "P${n} - ${type} ${method} End";\n    Set yP${n}_running,OFF;\n    Set yP${n}_comp,ON;\nEndFunc;\n\n#====================================================================================\n#  Position check mode\n#====================================================================================\nFunc P${n}_teaching_mode()\n    #================================================================================\n    #  Return move before process pos                 \n    #================================================================================\n    Set yTeaching_running,ON;    \n    Print "P${n} - ${type} ${method} Teaching mode Start";\n    #================================================================================\n    #  Move                     \n    #================================================================================\n    While xTeaching_mode == OFF or xTeaching_cancel == OFF\n        Set_offset();\n        Movl Offset(P${n}_Down, PR[B_PR_num]),Speed[50],Fine,Tool[B_T_num],Wobj[B_W_num];\n        If xTeaching_save\n            Print "Up Pos saved (Origin pos :" + P${n}_Up + ")";\n            Print "Down Pos saved (Origin pos :" + P${n}_Down + ")";\n            P${n}_Up = Offset(P${n}_Up,PR[B_PR_num]);\n            P${n}_Down = Offset(P${n}_Down,PR[B_PR_num]);\n            Print "Saved Offset value : " + PR[B_PR_num];\n            Print "Up Pos saved (Saved pos :" + P${n}_Up + ")";\n            Print "Down Pos saved (Saved pos :" + P${n}_Down + ")";\n            SavePoints;\n            Break;\n        EndIf;\n    EndWhile;\n    #================================================================================\n    Set yTeaching_running,OFF;\n    Print "P${n} - ${type} ${method} Teaching mode End";\nEndFunc;\n#====================================================================================\n# Set Offset                  \n#====================================================================================\n${offsetFunc}\n${socketFuncs}`;
        return mainStr;
    },
    // Data files
    DataPoints(steps, options) {
        let sb = `ProgramInfo\n    Version = "S4.24"\n    VRC = "V4R24"\n    Time = "${TemplateHelper.getNowAmPm()}"\n    RobotName = "${options.RobotName}"\nEndProgramInfo\n`;
        const zero = "0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000";
        const cfg = "0, 0, 0, 0";
        steps.forEach(s => {
            let n = s.No * 100;
            let list = [{N:"App",O:0},{N:"Wait",O:1},{N:"Up",O:10},{N:"Down",O:11}];
            if (s.WorkType === "Peeling" || s.WorkMethod === "Peeling") {
                list.push({N:"Peel_1",O:12}, {N:"Peel_2",O:13}, {N:"Peel_3",O:14}, {N:"Peel_4",O:15}, {N:"Peel_5",O:16}, {N:"Peel_end",O:20});
            }
            list.forEach(p => {
                sb += `P[${n + p.O}] = ${zero}; ${cfg};${zero};Name = P${s.No}_${p.N};Notes = "T1_W0";\n`;
            });
        });
        return sb;
    },
    DataWarning(steps, options) {
        let warn = ["","","","","","","","","","","","","","","",""];
        steps.forEach(s => {
            if (s.ToolType === "Vacuum") { warn[0]="ERR : Tool Vacuum ON Error!"; warn[1]="ERR : Tool Vacuum OFF Error!"; }
            if (s.ToolType === "Gripper") { warn[2]="ERR : Gripper ON Error!"; warn[3]="ERR : Gripper OFF Error!"; }
            if (s.WorkType === "Trash") { warn[4]="ERR : Trash Gripper ON Error!"; warn[5]="ERR : Trash Gripper OFF Error!"; }
            if (s.WorkType === "Stage") { warn[6]="ERR : Stage Vacuum ON Error!"; warn[7]="ERR : Stage Vacuum OFF Error!"; }
            if (s.WorkMethod === "Check" && s.WorkType === "MCR") warn[8]="ERR : MCR Shot Error!";
            if (s.WorkMethod === "Check" && s.WorkType === "Vision") warn[9]="ERR : Vision Shot Error!";
            if (s.WorkMethod === "Calibration" && s.ToolType === "Vision (Socket)") warn[13]="ERR : Socket communication Error!";
        });
        warn[14] = "ERR : Homing Error!";
        if(options.EnableToolControl) warn[15] = "ERR : Tool position Error!";
        return '{\n  "Warings": [\n' + warn.map(w => `    "${w}"`).join(',\n') + '\n  ]\n}';
    },
    DataPrj(steps, options, prjName) {
        let progFiles = ["main.pro", "s01_initial.pro"];
        let tasks = [];
        let tid = 1;
        if(options.EnableTcpSpeed) {
            tasks.push(`    {\n      "TaskId": ${tid++},\n      "EnterProgramFile": "PLC_TCP_Speed.pro",\n      "TaskType": 1,\n      "IsActive": true\n    }`);
            progFiles.push("PLC_TCP_Speed.pro");
        }
        if (options.EnableTorque) {
            tasks.push(`    {\n      "TaskId": ${tid++},\n      "EnterProgramFile": "PLC_Current_Torque.pro",\n      "TaskType": 1,\n      "IsActive": true\n    }`);
            progFiles.push("PLC_Current_Torque.pro");
        }
        if (options.EnableToolControl) progFiles.push("s02_Tool_Control.pro");
        steps.forEach(s => progFiles.push(`${s.ProcessName}.pro`));

        let ptF = ["P.pts"];
        if(options.EnableMultiRecipe) {
            for(let i=1; i<options.RecipeCount; i++) ptF.push(`P${i.toString().padStart(2, '0')}.pts`);
        }
        
        return `{\n  "FileType": "RobotProjectConfigFile",\n  "Company": "Inovance",\n  "MajorVersion": 2,\n  "MinorVersion": 1,\n  "IsMainActive": true,\n  "MultiTaskCount": ${tasks.length},\n  "MultiTaskInfos": [\n${tasks.join(',\n')}\n  ],\n  "ProgramFilesCount": ${progFiles.length},\n  "ProgramFiles": [\n${progFiles.map(p=>`    "${p}"`).join(',\n')}\n  ],\n  "RobPointFilesCount": ${ptF.length},\n  "RobPointFiles": [\n${ptF.map(p=>`    "${p}"`).join(',\n')}\n  ]\n}`;
    },
    RemoteIOInfo(options) {
        let t = Assets.RemoteIO.replace(/Time="[^"]*"/, `Time="${TemplateHelper.getNow()}"`);
        t = t.replace(/RobotName="[^"]*"/, `RobotName="${options.RobotName}"`);
        let chkCode = options.EnableMultiRecipe ? "67B10D3D" : "B584C2A8";
        t = t.replace(/CheckCode="[^"]*"/, `CheckCode="${chkCode}"`);
        let rAddr = options.EnableMultiRecipe ? "736" : "-1";
        t = t.replace(/("FuncId"\s*:\s*8288\s*,\s*"MemAddr"\s*:\s*)-?\d+/g, `$1${rAddr}`);
        t = t.replace(/("FuncId"\s*:\s*41056\s*,\s*"MemAddr"\s*:\s*)-?\d+/g, `$1${rAddr}`);
        return t;
    },
    RobPointMapping(options) {
        let t = `FileInfo\n    FileType="PosMappingFile"\n    Version="1.0"\n    SystemVersion="V4R24"\n    RobotName="${options.RobotName}"\n    Time="${TemplateHelper.getNow()}"\n    CheckCode="558447AB"\nEndFileInfo\n0-P.pts\n`;
        if(options.EnableMultiRecipe) {
            for(let i=1; i<options.RecipeCount; i++) t += `${i}-P${i.toString().padStart(2, '0')}.pts\n`;
        }
        return t;
    },
    LabelsJson(steps, options) {
        let hasCalibPlc = false, hasPeeling = false, hasVisionIo = false;
        let hasVacuum = false, hasGripper = false, hasTrash = false;
        let stageCount = 0;
        
        steps.forEach(s => {
            if (s.WorkMethod === "Calibration" && s.ToolType === "PLC (IO)") hasCalibPlc = true;
            if (s.WorkType === "Peeling" || s.WorkMethod === "Peeling") hasPeeling = true;
            if (s.VisionUse === "Use - IO") hasVisionIo = true;
            if (s.ToolType === "Vacuum") hasVacuum = true;
            if (s.ToolType === "Gripper") hasGripper = true;
            if (s.WorkType === "Trash") hasTrash = true;
            if (s.WorkType === "Stage") stageCount++;
        });

        // 1. InputBitLabels
        let inBits = [
            {nIndex: 512, sLabel: "xStart_prog", sDescription: "Start program", sOriginalName: "IN[512]"},
            {nIndex: 513, sLabel: "xStop_prog", sDescription: "Stop program", sOriginalName: "IN[513]"},
            {nIndex: 514, sLabel: "xReset_prog", sDescription: "Reset program", sOriginalName: "IN[514]"},
            {nIndex: 515, sLabel: "xReset_alarm", sDescription: "Clear alarm", sOriginalName: "IN[515]"},
            {nIndex: 519, sLabel: "xRobot_homing", sDescription: "", sOriginalName: "IN[519]"},
            {nIndex: 526, sLabel: "xReturn_wait_pos", sDescription: "", sOriginalName: "IN[526]"},
            {nIndex: 592, sLabel: "xTeaching_mode", sDescription: "", sOriginalName: "IN[592]"},
            {nIndex: 593, sLabel: "xTeaching_save", sDescription: "", sOriginalName: "IN[593]"},
            {nIndex: 594, sLabel: "xTeaching_cancel", sDescription: "", sOriginalName: "IN[594]"}
        ];

        let baseInIdx = 528;
        steps.forEach(s => { inBits.push({nIndex: baseInIdx, sLabel: `xP${s.No}_start`, sDescription: "", sOriginalName: `IN[${baseInIdx}]`}); baseInIdx++; });
        if (hasCalibPlc) { inBits.push({nIndex: 576, sLabel: "xVision_move_next", sDescription: "", sOriginalName: "IN[576]"}, {nIndex: 577, sLabel: "xVision_cali_comp", sDescription: "", sOriginalName: "IN[577]"}); }
        if (hasPeeling) { inBits.push({nIndex: 568, sLabel: "xPeel_start", sDescription: "", sOriginalName: "IN[568]"}); }
        if (options.EnableToolControl) {
            if (hasVacuum) { inBits.push({nIndex: 600, sLabel: "xTool_vac_on", sDescription: "", sOriginalName: "IN[600]"}, {nIndex: 601, sLabel: "xTool_vac_off", sDescription: "", sOriginalName: "IN[601]"}); }
            if (hasGripper) { inBits.push({nIndex: 602, sLabel: "xTool_grip", sDescription: "", sOriginalName: "IN[602]"}, {nIndex: 603, sLabel: "xTool_ungrip", sDescription: "", sOriginalName: "IN[603]"}); }
            if (hasTrash) { inBits.push({nIndex: 604, sLabel: "xTrash_grip", sDescription: "", sOriginalName: "IN[604]"}, {nIndex: 605, sLabel: "xTrash_ungrip", sDescription: "", sOriginalName: "IN[605]"}); }
            let curStageInIdx = 606;
            for (let i = 1; i <= stageCount; i++) {
                let prefix = i === 1 ? "xStage" : `xStage${i}`;
                inBits.push({nIndex: curStageInIdx, sLabel: `${prefix}_vac_on`, sDescription: "", sOriginalName: `IN[${curStageInIdx}]`});
                inBits.push({nIndex: curStageInIdx+1, sLabel: `${prefix}_vac_off`, sDescription: "", sOriginalName: `IN[${curStageInIdx+1}]`});
                curStageInIdx += 2;
            }
        }

        // 3. InputWordLabels
        let inWords = [];
        if (hasVisionIo) {
            inWords.push({nIndex: 40, sLabel: "xwVision_offset_X", sDescription: "2Word_/10000", sOriginalName: "INW[40]"});
            inWords.push({nIndex: 42, sLabel: "xwVision_offset_Y", sDescription: "2Word_/10000", sOriginalName: "INW[42]"});
            inWords.push({nIndex: 44, sLabel: "xwVision_offset_A", sDescription: "2Word_/10000", sOriginalName: "INW[44]"});
        }
        if (options.EnableMultiRecipe) inWords.push({nIndex: 46, sLabel: "xwP_file_switch", sDescription: "", sOriginalName: "INW[46]"});
        inWords.push({nIndex: 47, sLabel: "xwSet_speed", sDescription: "Speed settings", sOriginalName: "INW[47]"});
        if (hasPeeling) inWords.push({nIndex: 48, sLabel: "xwPeel_speed", sDescription: "", sOriginalName: "INW[48]"});
        let valW = 49;
        for (let j=0; j<steps.length; j++) {
            let s = steps[j];
            if(s.No > 10) break;
            inWords.push({nIndex: valW, sLabel: `xwP${s.No}_offset_X`, sDescription: "2 Word, /10000", sOriginalName: `INW[${valW}]`});
            inWords.push({nIndex: valW+2, sLabel: `xwP${s.No}_offset_Y`, sDescription: "2 Word, /10000", sOriginalName: `INW[${valW+2}]`});
            inWords.push({nIndex: valW+4, sLabel: `xwP${s.No}_offset_Z`, sDescription: "2 Word, /10000", sOriginalName: `INW[${valW+4}]`});
            inWords.push({nIndex: valW+6, sLabel: `xwP${s.No}_offset_A`, sDescription: "2 Word, /10000", sOriginalName: `INW[${valW+6}]`});
            valW += 8;
        }

        // 4. OutputBitLabels
        let outBits = [
            {nIndex: 512, sLabel: "yProg_run_sts", sDescription: "Program run status", sOriginalName: "OUT[512]"},
            {nIndex: 513, sLabel: "yProg_stop_sts", sDescription: "Program stopped", sOriginalName: "OUT[513]"},
            {nIndex: 514, sLabel: "yProg_reset_sts", sDescription: "Program reset successful", sOriginalName: "OUT[514]"},
            {nIndex: 515, sLabel: "yAlarm_sts", sDescription: "System fault status", sOriginalName: "OUT[515]"},
            {nIndex: 516, sLabel: "yRobot_busy", sDescription: "Robot in motion", sOriginalName: "OUT[516]"},
            {nIndex: 517, sLabel: "yComm_heartbeat", sDescription: "Bus communication heartbeat", sOriginalName: "OUT[517]"},
            {nIndex: 518, sLabel: "yRobot_homing", sDescription: "", sOriginalName: "OUT[518]"},
            {nIndex: 519, sLabel: "yRobot_home_sts", sDescription: "", sOriginalName: "OUT[519]"},
            {nIndex: 526, sLabel: "yWait_pos_comp", sDescription: "", sOriginalName: "OUT[526]"},
            {nIndex: 527, sLabel: "yWait_pos_running", sDescription: "", sOriginalName: "OUT[527]"},
            {nIndex: 592, sLabel: "yTeaching_running", sDescription: "", sOriginalName: "OUT[592]"}
        ];
        let baseOutIdx = 528;
        steps.forEach(s => { outBits.push({nIndex: baseOutIdx, sLabel: `yP${s.No}_comp`, sDescription: "", sOriginalName: `OUT[${baseOutIdx}]`}); baseOutIdx++; });
        baseOutIdx = 544;
        steps.forEach(s => { outBits.push({nIndex: baseOutIdx+1, sLabel: `yP${s.No}_running`, sDescription: "", sOriginalName: `OUT[${baseOutIdx+1}]`}); baseOutIdx++; });

        if (hasCalibPlc) outBits.push({nIndex: 576, sLabel: "yVision_move_comp", sDescription: "", sOriginalName: "OUT[576]"});
        if (hasPeeling) outBits.push({nIndex: 568, sLabel: "yPeel_pos_comp", sDescription: "", sOriginalName: "OUT[568]"});

        if (hasVacuum) { outBits.push({nIndex: 600, sLabel: "yTool_vac_on_REQ", sDescription: "", sOriginalName: "OUT[600]"}, {nIndex: 601, sLabel: "yTool_vac_off_REQ", sDescription: "", sOriginalName: "OUT[601]"}); }
        if (hasGripper) { outBits.push({nIndex: 602, sLabel: "yTool_grip_REQ", sDescription: "", sOriginalName: "OUT[602]"}, {nIndex: 603, sLabel: "yTool_ungrip_REQ", sDescription: "", sOriginalName: "OUT[603]"}); }
        if (hasTrash) { outBits.push({nIndex: 604, sLabel: "yTrash_grip_REQ", sDescription: "", sOriginalName: "OUT[604]"}, {nIndex: 605, sLabel: "yTrash_ungrip_REQ", sDescription: "", sOriginalName: "OUT[605]"}); }
        let curStageOutIdx = 606;
        for (let i = 1; i <= stageCount; i++) {
            let prefix = i === 1 ? "yStage" : `yStage${i}`;
            outBits.push({nIndex: curStageOutIdx, sLabel: `${prefix}_vac_on_REQ", sDescription: "", sOriginalName: "OUT[${curStageOutIdx}]`});
            outBits.push({nIndex: curStageOutIdx+1, sLabel: `${prefix}_vac_off_REQ", sDescription: "", sOriginalName: "OUT[${curStageOutIdx+1}]`});
            curStageOutIdx += 2;
        }

        // 5. OutputWordLabels
        let outWords = [];
        if(options.EnableMultiRecipe) outWords.push({nIndex: 46, sLabel: "ywP_file_switch_sts", sDescription: "", sOriginalName: "OUTW[46]"});
        outWords.push(
            {nIndex: 47, sLabel: "ywCur_speed", sDescription: "", sOriginalName: "OUTW[47]"},
            {nIndex: 48, sLabel: "ywCur_control_mode", sDescription: "", sOriginalName: "OUTW[48]"},
            {nIndex: 49, sLabel: "ywCur_mode", sDescription: "", sOriginalName: "OUTW[49]"},
            {nIndex: 50, sLabel: "ywCur_alarm_code", sDescription: "", sOriginalName: "OUTW[50]"},
            {nIndex: 51, sLabel: "ywCur_pos_X", sDescription: "", sOriginalName: "OUTW[51]"},
            {nIndex: 53, sLabel: "ywCur_pos_Y", sDescription: "", sOriginalName: "OUTW[53]"},
            {nIndex: 55, sLabel: "ywCur_pos_Z", sDescription: "", sOriginalName: "OUTW[55]"},
            {nIndex: 57, sLabel: "ywCur_pos_A", sDescription: "", sOriginalName: "OUTW[57]"},
            {nIndex: 59, sLabel: "ywCur_pos_B", sDescription: "", sOriginalName: "OUTW[59]"},
            {nIndex: 61, sLabel: "ywCur_pos_C", sDescription: "", sOriginalName: "OUTW[61]"}
        );
        if (options.EnableTcpSpeed) outWords.push({nIndex: 63, sLabel: "ywCur_TCP_speed", sDescription: "", sOriginalName: "OUTW[63]"});
        if (options.EnableTorque) {
            outWords.push({nIndex: 64, sLabel: "ywCur_J1_torque", sDescription: "", sOriginalName: "OUTW[64]"}, {nIndex: 65, sLabel: "ywCur_J2_torque", sDescription: "", sOriginalName: "OUTW[65]"}, {nIndex: 66, sLabel: "ywCur_J3_torque", sDescription: "", sOriginalName: "OUTW[66]"}, {nIndex: 67, sLabel: "ywCur_J4_torque", sDescription: "", sOriginalName: "OUTW[67]"}, {nIndex: 68, sLabel: "ywCur_J5_torque", sDescription: "", sOriginalName: "OUTW[68]"}, {nIndex: 69, sLabel: "ywCur_J6_torque", sDescription: "", sOriginalName: "OUTW[69]"});
        }

        let bVars = [
            {nIndex: 0, sLabel: "B_T_num", sDescription: "", sOriginalName: "B[0]"},
            {nIndex: 1, sLabel: "B_W_num", sDescription: "", sOriginalName: "B[1]"},
            {nIndex: 2, sLabel: "B_PR_num", sDescription: "", sOriginalName: "B[2]"}
        ];
        if (hasCalibPlc) bVars.push({nIndex: 5, sLabel: "B_Vision_cali_count", sDescription: "", sOriginalName: "B[5]"});
        let rVars = [{nIndex: 0, sLabel: "R_Cur_pos", sDescription: "", sOriginalName: "R[0]"}];
        let dVars = [];
        if (options.EnableTcpSpeed) dVars.push({nIndex: 0, sLabel: "D_TCP_speed", sDescription: "", sOriginalName: "D[0]"});
        if (options.EnableTorque) {
            dVars.push({nIndex: 1, sLabel: "D_J1_cur_torque", sDescription: "", sOriginalName: "D[1]"}, {nIndex: 2, sLabel: "D_J2_cur_torque", sDescription: "", sOriginalName: "D[2]"}, {nIndex: 3, sLabel: "D_J3_cur_torque", sDescription: "", sOriginalName: "D[3]"}, {nIndex: 4, sLabel: "D_J4_cur_torque", sDescription: "", sOriginalName: "D[4]"}, {nIndex: 5, sLabel: "D_J5_cur_torque", sDescription: "", sOriginalName: "D[5]"}, {nIndex: 6, sLabel: "D_J6_cur_torque", sDescription: "", sOriginalName: "D[6]"});
            dVars.push({nIndex: 7, sLabel: "D_J1_max_torque", sDescription: "", sOriginalName: "D[7]"}, {nIndex: 8, sLabel: "D_J2_max_torque", sDescription: "", sOriginalName: "D[8]"}, {nIndex: 9, sLabel: "D_J3_max_torque", sDescription: "", sOriginalName: "D[9]"}, {nIndex: 10, sLabel: "D_J4_max_torque", sDescription: "", sOriginalName: "D[10]"}, {nIndex: 11, sLabel: "D_J5_max_torque", sDescription: "", sOriginalName: "D[11]"}, {nIndex: 12, sLabel: "D_J6_max_torque", sDescription: "", sOriginalName: "D[12]"});
        }

        function createSection(name, arr) {
            return `  "${name}": {\n    "nNumberOfLabels": ${arr.length},\n    "LabelsArray": [\n${arr.map((a,i)=>`      {\n        "nLabelId": ${i},\n        "nIndex": ${a.nIndex},\n        "sLabel": "${a.sLabel}",\n        "sDescription": "${a.sDescription}",\n        "sOriginalName": "${a.sOriginalName}"\n      }`).join(',\n')}\n    ]\n  }`;
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
