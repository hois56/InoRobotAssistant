use super::{stage_name, strings, Plan, Step};
use std::fmt::Write;

// Controller-language literals intentionally retain the export's whitespace.
pub(super) fn main_program(p: &Plan, out: &mut String) {
    out.push_str("Include \"s01_initial.pro\";\n");
    out.push_str("Include \"s02_offset.pro\";\n");
    if p.teach {
        out.push_str("Include \"s03_teach_mode.pro\";\n");
    }
    if p.control {
        out.push_str("Include \"s04_Tool_Control.pro\";\n");
    }
    for s in &p.steps {
        write!(out, "Include \"{}.pro\";\n", s.name).unwrap();
    }
    let payload = p.payload;
    write!(
        out,
        r##"Start;
    #================================================================================
    #  Initial
    #================================================================================
    xReIO_run_all_static = ON;
    #================================================================================
    If Tool[1].TLoad.Mass == 0 
        Tool[1].TLoad.Mass = {payload};
    EndIf;
    #================================================================================
    s01_initial.Init_move_home();
    s01_initial.Init_signal();
"##
    )
    .unwrap();
    if p.multi {
        out.push_str("    s01_initial.Manual_set_recipe();\n");
    }
    out.push_str(
        r##"    #================================================================================
    #  Set initial speed
    #================================================================================
    If xwSet_speed <= 0
        Velset Rate[1];
    ElseIf xwSet_speed > 100
        Velset Rate[100];
    Else
        Velset Rate[xwSet_speed];
    EndIf;
    #================================================================================
    L[0]: #Loop of Wait Start process signal
    #================================================================================
    If xRobot_homing
        s01_initial.Init_move_home();
        s01_initial.Init_signal();
    EndIf;
    #================================================================================
    #  Start Process
    #================================================================================
"##,
    );
    let work_condition = if p.wait {
        "xwProcess_work_pos > 0 And xwProcess_wait_pos == 0"
    } else {
        "xwProcess_work_pos > 0"
    };
    write!(out, "    If {work_condition}\n        Print \"Work pos Start\";\n        ywProcess_work_comp = 0; #Process Work pos comp reset\n").unwrap();
    if p.wait {
        out.push_str("        ywProcess_wait_comp = 0; #Process Wait pos comp reset\n");
    }
    if p.busy {
        out.push_str(
            "        ywProcess_work_busy = xwProcess_work_pos; #Process Work pos busy ON\n",
        );
    }
    out.push_str(
        "        #============================================================================\n",
    );
    for (i, s) in p.steps.iter().enumerate() {
        let branch = if i == 0 { "If" } else { "ElseIf" };
        write!(
            out,
            "        {branch} xP{}_work_pos_start\n            {}.P{}_pos();\n",
            s.no, s.name, s.no
        )
        .unwrap();
    }
    out.push_str("        EndIf;\n");
    if p.wait {
        out.push_str(r##"    #================================================================================
    ElseIf xwProcess_wait_pos > 0 And xwProcess_work_pos == 0 
        Print "Wait pos Start";
        ywProcess_wait_comp = 0; #Process Wait pos comp reset
        ywProcess_work_comp = 0; #Process Work pos comp reset
"##);
        if p.busy {
            out.push_str(
                "        ywProcess_wait_busy = xwProcess_wait_pos; #Process Wait pos busy ON\n",
            );
        }
        out.push_str("        #============================================================================\n");
        for (i, s) in p.steps.iter().enumerate() {
            let branch = if i == 0 { "If" } else { "ElseIf" };
            write!(
                out,
                "        {branch} xP{}_wait_pos_start\n            {}.P{}_pos();\n",
                s.no, s.name, s.no
            )
            .unwrap();
        }
        out.push_str("        EndIf;\n");
    }
    out.push_str(
        r##"    EndIf;
    #================================================================================
    #  Signal reset
    #================================================================================
"##,
    );
    if p.teach {
        out.push_str("    yTeach_mode_sts = xTeach_mode;\n");
    }
    if p.busy {
        out.push_str("    ywProcess_work_busy = 0; #Process Work pos busy OFF\n");
        if p.wait {
            out.push_str("    ywProcess_wait_busy = 0; #Process Wait pos busy OFF\n");
        }
    }
    out.push_str("    #================================================================================\n    Goto L[0];\nEnd;\n");
}

pub(super) fn initial(p: &Plan, out: &mut String) {
    out.push_str(
        r##"#====================================================================================
#  Init Signal
#====================================================================================
Func Init_signal()
    Clear Out[520],120; #[520] ~ [639]
EndFunc;
#====================================================================================
#  Init Move Home
#====================================================================================
Func Init_move_home()
    #================================================================================
    #  Signal Set
    #================================================================================
    If yRobot_home_sts
        R_Cur_pos = 1;
    EndIf;
    #================================================================================
    #  Start Return
    #================================================================================
    Velset 50;
    Return_move(0);
    #================================================================================
    R_Cur_pos = 1;
    Home[0],V[100];
    Velset OFF;
EndFunc;
#====================================================================================
#  Return Move
#====================================================================================
Func Return_move(Int return_path)
    Int cur_proces = R_Cur_pos / 100;
    Print "Return move Process : " + cur_proces;
    Switch R_Cur_pos
        Case 1: #Home
            Break;
"##,
    );
    for s in &p.steps {
        let n = s.no;
        let last_wait = 1 + s.extra as i32;
        let z_up = if n == 1 { 2 } else { 1 };
        let acc_up = if s.method == "Get" { ",Acc[5]" } else { "" };
        write!(out, r##"        #============================================================================
        #  P{n} - {} {}
        #============================================================================
"##, s.work, s.method).unwrap();
        if s.peeling() {
            for i in 12..=15 {
                write!(out, "        Case {}:\n            Movl P{n}_Peel_{},V[100],Z[2],Tool[B_Tool],Wobj[B_Wobj];\n            R_Cur_pos = {};\n", n * 100 + i, i - 10, n * 100 + i + 1).unwrap();
            }
            write!(
                out,
                r##"        Case {}:
            Movl P{n}_Peel_end,V[100],Z[2],Tool[B_Tool],Wobj[B_Wobj];
            R_Cur_pos = {};
        Case {}:
            Movj P{n}_Safe,V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];
            R_Cur_pos = {};
            Break;
"##,
                n * 100 + 16,
                n * 100 + 20,
                n * 100 + 20,
                n * 100
            )
            .unwrap();
        }
        write!(
            out,
            r##"        Case {}:
            Movl Offset(P{n}_Pre_work, PR[B_PR]),V[100],Z[{z_up}],Tool[B_Tool],Wobj[B_Wobj]{acc_up};
            R_Cur_pos = {};
            If return_path == 10
                Break;
            EndIf;
        Case {}:
            Movj P{n}_Wait,V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];
            R_Cur_pos = {};
"##,
            n * 100 + 11,
            n * 100 + 10,
            n * 100 + 10,
            n * 100 + 1
        )
        .unwrap();
        for i in 2..=last_wait {
            write!(out, "            Movj P{n}_Wait{i},V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];\n            R_Cur_pos = {};\n", n * 100 + i).unwrap();
        }
        write!(
            out,
            r##"            If return_path == 1
                Break;
            EndIf;
        Case {} To {}:
            Movj P{n}_Safe,V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];
            R_Cur_pos = {};
            Break;
"##,
            n * 100,
            n * 100 + last_wait,
            n * 100
        )
        .unwrap();
    }
    out.push_str(
        r##"        #============================================================================
        #  Other
        #============================================================================
        Default:
            Print "Return move Fail! Incorrect value. R_Cur_pos :  " + R_Cur_pos;
            Alarm[14]; #Return move Error
            Break;
    EndSwitch;
EndFunc;
"##,
    );
    if p.multi && p.recipes > 1 {
        out.push_str(r##"#====================================================================================
#  Manual Set Recipe
#====================================================================================
Func Manual_set_recipe() #Change recipe
    If xwP_file_switch == ywCur_P_file
        ret;
    EndIf;
    #================================================================================
    Switch xwP_file_switch
        Case 0:
            LoadPoints("P.pts");
            Break;
"##);
        for i in 1..p.recipes {
            let padded = format!("{i:02}");
            write!(out, "        Case {i}:\n            LoadPoints(\"P{padded}.pts\");\n            Break;\n").unwrap();
        }
        out.push_str(
            r##"    EndSwitch;
    #================================================================================
    String P_name = GetCurPointsFileName();
    Print "Current Point file : " + P_name;
    P_name = StrRePlace(P_name,"P","");
    P_name = StrRePlace(P_name,".pts","");
    ywCur_P_file = StrToR(P_name);
EndFunc;
"##,
        );
    }
}

pub(super) fn teach(p: &Plan, out: &mut String) {
    write!(
        out,
        r##"Global Int aiP_num[16][30];
Global Int aiMove_type[16][30];
Global Int aiPos_count[16];
Global Int iCur_pos_idx;
#====================================================================================
#  Move Type
#====================================================================================
#    0 = MovJ, Not use Offset
#    1 = MovJ, Use Offset ON
#    2 = MovL, Not use Offset
#    3 = MovL, Use Offset ON
#====================================================================================
#  Teaching Config Init
#====================================================================================
Func Set_path()
    Int i;
    Switch B_Cur_process
"##
    )
    .unwrap();
    for s in &p.steps {
        let n = s.no;
        let points = s.points();
        let point_ids = points
            .iter()
            .map(|(offset, _, _)| (n * 100 + offset).to_string())
            .collect::<Vec<_>>()
            .join(", ");
        let moves = points
            .iter()
            .map(|(_, _, kind)| kind.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        write!(
            out,
            r##"        Case {n}: # Process {n}
            aiPos_count[{n}] = {};
            Int P{n}_pos_num[30] = {{{point_ids}}};
            Int P{n}_move_type[30] = {{{moves}}};
            For i=0,i<aiPos_count[{n}],Step[1]
                aiP_num[{n}][i] = P{n}_pos_num[i];
                aiMove_type[{n}][i] = P{n}_move_type[i];
            EndFor;
            Break;
        #============================================================================
"##,
            points.len()
        )
        .unwrap();
    }
    out.push_str(
        r##"    EndSwitch;
EndFunc;
#====================================================================================
#  Teaching Mode Start
#====================================================================================
Func Teaching_mode()
    Set yTeach_mode_sts,ON;
    Print "Teaching mode Start. Process : " + B_Cur_process;
    #================================================================================
    #  Set Position data
    #================================================================================
    Set_path();
    #============================================================================
    #  Teaching Loop
    #============================================================================
    iCur_pos_idx = 0;
    Teach_move(); # Go Safe of current process position
    #============================================================================
    While xTeach_mode == ON
        #========================================================================
        #  Move Next
        #========================================================================
        If xTeach_move_next And iCur_pos_idx < aiPos_count[B_Cur_process] - 1
            iCur_pos_idx = iCur_pos_idx + 1;
            Teach_move();
            Set yTeach_move_comp, ON;
            Wait xTeach_move_next == OFF or xTeach_mode == OFF;
            Set yTeach_move_comp, OFF;
        #========================================================================
        #  Move Previous
        #========================================================================
        ElseIf xTeach_move_prev And iCur_pos_idx > 0
            iCur_pos_idx = iCur_pos_idx - 1;
            Teach_move();
            Set yTeach_move_comp, ON;
            Wait xTeach_move_prev == OFF or xTeach_mode == OFF;
            Set yTeach_move_comp, OFF;
        #========================================================================
        #  Move Offset
        #========================================================================
        ElseIf xTeach_move_offset
            Teach_move();
            Set yTeach_move_comp, ON;
            Wait xTeach_move_offset == OFF or xTeach_mode == OFF;
            Set yTeach_move_comp, OFF;
        #========================================================================
        #  Save Points
        #========================================================================
        ElseIf xTeach_save And iCur_pos_idx >= 2 #Up, Down pos save
            Int cur_up_pos = B_Cur_process * 100 + 10;
            Int cur_down_pos = B_Cur_process * 100 + 11;
            P[cur_up_pos] = Offset(P[cur_up_pos],PR[5]);
            P[cur_down_pos] = Offset(P[cur_down_pos],PR[5]);
            SavePoints;
            Set yTeach_save_comp, ON;
            Wait xTeach_save == OFF or xTeach_mode == OFF;
            Set yTeach_save_comp, OFF;
            Break;
        EndIf;
    EndWhile;
    Set yTeach_mode_sts,OFF;
    Print "Teaching mode End";
EndFunc;
#====================================================================================
#  Move Current Step
#====================================================================================
Func Teach_move()
    Int P_num = aiP_num[B_Cur_process][iCur_pos_idx];
    Int move_type = aiMove_type[B_Cur_process][iCur_pos_idx];
    If P_num < 100
        Print "Teach mode Pos num error";
        Alarm[13];
        ret;
    EndIf;
    #============================================================================
    s02_offset.Set_PR();
    R_Cur_pos = P_num;
    #============================================================================
    If move_type == 0 # MovJ, Offset OFF
        Movj P[P_num],V[30],Z[0],Tool[B_Tool],Wobj[B_Wobj];
    #============================================================================
    ElseIf move_type == 1 # MovJ, Offset ON
        Movj Offset(P[P_num], PR[6]),V[30],Z[0],Tool[B_Tool],Wobj[B_Wobj];
    #============================================================================
    ElseIf move_type == 2 # MovL, Offset OFF
        Movl P[P_num],V[30],Z[0],Tool[B_Tool],Wobj[B_Wobj];
    #============================================================================
    ElseIf move_type == 3 # MovL, Offset ON
        Movl Offset(P[P_num], PR[6]),V[30],Z[0],Tool[B_Tool],Wobj[B_Wobj];
    Else
        Print "Teach mode move type error";
        Alarm[13];
        ret;
    EndIf;
EndFunc;
"##,
    );
}

pub(super) fn tray(p: &Plan, out: &mut String) {
    let trays = p
        .steps
        .iter()
        .filter_map(|s| s.tray.as_ref().map(|t| (s, t)))
        .collect::<Vec<_>>();
    if trays.is_empty() {
        return;
    }
    let mut settings = String::new();
    if trays.iter().any(|(_, values)| {
        values
            .iter()
            .map(String::as_str)
            .ne(["3", "3", "-58", "-58"])
    }) {
        settings.push_str("    Switch B_Cur_process\n");
        for (s, [x, y, px, py]) in trays {
            write!(settings, "        Case {}:\n            X_count = {x};\n            Y_count = {y};\n            pitch_X = {px};\n            pitch_Y = {py};\n            Break;\n", s.no).unwrap();
        }
        settings.push_str("    EndSwitch;\n");
    }
    let count = if settings.is_empty() { " = 3" } else { "" };
    let pitch = if settings.is_empty() { " = -58" } else { "" };
    write!(
        out,
        r##"#====================================================================================
#  Set tray offset
#====================================================================================
Func Set_tray_offset()
    #============================================================
    # Setting
    #============================================================
    Int X_count{count};       # X Cell Count
    Int Y_count{count};       # Y Cell Count
    Double pitch_X{pitch};    # X Pitch
    Double pitch_Y{pitch};    # Y Pitch
{settings}    #============================================================
    # Cell Number
    #============================================================
    Int num = xwTray_index - 1;
    Int total_cell = X_count * Y_count;
    #============================================================
    # Range Check
    #============================================================
    If num < 0 Or num >= total_cell
        Alarm[12];
        Ret;
    EndIf;
    #============================================================
    # Row / Column Calculate
    #============================================================
    Int row = num / X_count;
    Int col = num - (row * X_count);
    #============================================================
    # Offset Calculate
    #============================================================
    LPR[B_PR] = (pitch_X*row, pitch_Y*col,0,0,0,0);
    PR[B_PR] = PR[B_PR] + LPR[B_PR];
EndFunc;
"##
    )
    .unwrap();
}

pub(super) fn offset_code(s: &Step, indent: &str, out: &mut String) {
    let n = s.no;
    let socket = s.socket() && s.method != "Check";
    if n > 10 && !socket {
        writeln!(out, "{indent}PR[B_PR] = (0,0,0,0,0,0);").unwrap();
        return;
    }
    if socket {
        writeln!(out, "{indent}LPR[B_PR] = PR[0];").unwrap();
    } else if s.vision_io() {
        writeln!(out,"{indent}LPR[B_PR] = (xwVision_offset_X.Int/10000,xwVision_offset_Y.Int/10000,0,xwVision_offset_A.Int/10000,0,0);").unwrap();
    }
    if n > 10 {
        writeln!(out, "{indent}PR[B_PR] = (0,0,0,0,0,0);").unwrap();
    } else {
        writeln!(out,"{indent}PR[B_PR] = (xwOffset_{n}_X.Int/10000,xwOffset_{n}_Y.Int/10000,xwOffset_{n}_Z.Int/10000,xwOffset_{n}_A.Int/10000,0,0);").unwrap();
    }
    if socket || s.vision_io() {
        writeln!(out, "{indent}PR[B_PR] = PR[B_PR] + LPR[B_PR];").unwrap();
    }
}

pub(super) fn offset(p: &Plan, out: &mut String) {
    write!(
        out,
        r##"Func Set_PR()
    #================================================================================
    #  Offset
    #================================================================================
    Switch B_Cur_process
"##
    )
    .unwrap();
    for s in &p.steps {
        let n = s.no;
        write!(out, r##"        #============================================================================
        #  P{n} - {} {}
        #============================================================================
        Case {n}:
"##, s.work, s.method).unwrap();
        offset_code(s, "            ", out);
        if s.tray.is_some() {
            out.push_str("            Set_tray_offset();\n");
        }
        out.push_str("            Break;\n");
    }
    out.push_str("    EndSwitch;\n");
    if p.teach {
        out.push_str(r##"    #================================================================================
    #  Teach mode offset
    #================================================================================
    If xTeach_mode
        PR[5] = (xwTeach_offset_X.Int/10000,xwTeach_offset_Y.Int/10000,xwTeach_offset_Z.Int/10000,xwTeach_offset_A.Int/10000,xwTeach_offset_B.Int/10000,xwTeach_offset_C.Int/10000);
        PR[6] = PR[5] + PR[B_PR];
    EndIf;
"##);
    }
    out.push_str("EndFunc;\n");
    tray(p, out);
}

pub(super) fn tool(p: &Plan, out: &mut String) {
    let (input_suffix, output_suffix) = if p.dio { ("_chk", "") } else { ("", "_REQ") };
    if p.vacuum() {
        write!(
            out,
            r##"Func Tool_Vac_ON()
    Set yTool_vac_off{output_suffix},OFF;
    Set yTool_vac_on{output_suffix},ON;
    Wait xTool_vac_on{input_suffix} == ON, T[60], Goto L[900];
    Set yTool_vac_on{output_suffix},OFF;
    Ret;
    L[900]:
    s01_initial.Init_signal();
    Alarm[0];
EndFunc;
#====================================================================================
Func Tool_Vac_OFF()
    Set yTool_vac_on{output_suffix},OFF;
    Set yTool_vac_off{output_suffix},ON;
    Wait xTool_vac_off{input_suffix} == ON, T[60], Goto L[901];
    Set yTool_vac_off{output_suffix},OFF;
    Ret;
    L[901]:
    s01_initial.Init_signal();
    Alarm[1];
EndFunc;
"##
        )
        .unwrap();
    }
    if p.gripper() {
        write!(out, r##"#====================================================================================
Func Tool_Grip()
    Set yTool_ungrip{output_suffix},OFF;
    Set yTool_grip{output_suffix},ON;
    Wait xTool_grip{input_suffix} == ON, T[60], Goto L[902];
    Set yTool_grip{output_suffix},OFF;
    Ret;
    L[902]:
    s01_initial.Init_signal();
    Alarm[2];
EndFunc;
#====================================================================================
Func Tool_Ungrip()
    Set yTool_grip{output_suffix},OFF;
    Set yTool_ungrip{output_suffix},ON;
    Wait xTool_ungrip{input_suffix} == ON, T[60], Goto L[903];
    Set yTool_ungrip{output_suffix},OFF;
    Ret;
    L[903]:
    s01_initial.Init_signal();
    Alarm[3];
EndFunc;
"##).unwrap();
    }
    if p.trash() {
        write!(out, r##"#====================================================================================
Func Trash_Grip()
    Set yTrash_ungrip{output_suffix},OFF;
    Set yTrash_grip{output_suffix},ON;
    Wait xTrash_grip{input_suffix} == ON, T[60], Goto L[904];
    Set yTrash_grip{output_suffix},OFF;
    Ret;
    L[904]:
    s01_initial.Init_signal();
    Alarm[4];
EndFunc;
#====================================================================================
Func Trash_Ungrip()
    Set yTrash_grip{output_suffix},OFF;
    Set yTrash_ungrip{output_suffix},ON;
    Wait xTrash_ungrip{input_suffix} == ON, T[60], Goto L[905];
    Set yTrash_ungrip{output_suffix},OFF;
    Ret;
    L[905]:
    s01_initial.Init_signal();
    Alarm[5];
EndFunc;
"##).unwrap();
    }
    for i in p.stage_slots() {
        let prefix = stage_name(i);
        let on = 906 + (i - 1) * 2;
        let off = on + 1;
        write!(out, r##"#====================================================================================
Func {prefix}_Vac_ON()
    Set y{prefix}_vac_off{output_suffix},OFF;
    Set y{prefix}_vac_on{output_suffix},ON;
    Wait x{prefix}_vac_on{input_suffix} == ON, T[60], Goto L[{on}];
    Set y{prefix}_vac_on{output_suffix},OFF;
    Ret;
    L[{on}]:
    s01_initial.Init_signal();
    Alarm[6];
EndFunc;
#====================================================================================
Func {prefix}_Vac_OFF()
    Set y{prefix}_vac_on{output_suffix},OFF;
    Set y{prefix}_vac_off{output_suffix},ON;
    Wait x{prefix}_vac_off{input_suffix} == ON, T[60], Goto L[{off}];
    Set y{prefix}_vac_off{output_suffix},OFF;
    Ret;
    L[{off}]:
    s01_initial.Init_signal();
    Alarm[7];
EndFunc;
"##).unwrap();
    }
}

pub(super) fn tcp(_: &Plan, out: &mut String) {
    write!(
        out,
        r##"Start;
    Double TCP_dist;
    LP[0] = GetCurPos();
    #================================================================================
    While True
        Delay T[0.1];
        LP[1] = GetCurPos();
        TCP_dist = Dist(LP[0],LP[1]);
        D_TCP_speed = TCP_dist / 0.1;
        LP[0] = LP[1];
        ywCur_TCP_speed = D_TCP_speed;
    EndWhile;
End;"##
    )
    .unwrap();
}

pub(super) fn torque(p: &Plan, ratios: &[String], out: &mut String) {
    let (mut get, mut output, mut max) = (String::new(), String::new(), String::new());
    if !p.scara {
        write!(get, "    D_J5_cur_torque = Abs(GetTorque(5) * {});\n    D_J6_cur_torque = Abs(GetTorque(6) * {});\n", ratios[4], ratios[5]).unwrap();
        output.push_str(
            "    ywCur_J5_torque = D_J5_cur_torque;\n    ywCur_J6_torque = D_J6_cur_torque;\n",
        );
        max.push_str(
            r##"    If D_J5_cur_torque > D_J5_max_torque
        D_J5_max_torque = D_J5_cur_torque;
    EndIf;
    If D_J6_cur_torque > D_J6_max_torque
        D_J6_max_torque = D_J6_cur_torque;
    EndIf;
"##,
        );
    }
    write!(
        out,
        r##"#====================================================================================
#  Current torque
#====================================================================================
Func Current_torque()
    D_J1_cur_torque = Abs(GetTorque(1) * {});
    D_J2_cur_torque = Abs(GetTorque(2) * {});
    D_J3_cur_torque = Abs(GetTorque(3) * {});
    D_J4_cur_torque = Abs(GetTorque(4) * {});
{get}    #================================================================================
    ywCur_J1_torque = D_J1_cur_torque;
    ywCur_J2_torque = D_J2_cur_torque;
    ywCur_J3_torque = D_J3_cur_torque;
    ywCur_J4_torque = D_J4_cur_torque;
{output}    #================================================================================
    If D_J1_cur_torque > D_J1_max_torque
        D_J1_max_torque = D_J1_cur_torque;
    EndIf;
    If D_J2_cur_torque > D_J2_max_torque
        D_J2_max_torque = D_J2_cur_torque;
    EndIf;
    If D_J3_cur_torque > D_J3_max_torque
        D_J3_max_torque = D_J3_cur_torque;
    EndIf;
    If D_J4_cur_torque > D_J4_max_torque
        D_J4_max_torque = D_J4_cur_torque;
    EndIf;
{max}EndFunc;
"##,
        ratios[0], ratios[1], ratios[2], ratios[3]
    )
    .unwrap();
}
pub(super) fn plc(p: &Plan, out: &mut String) {
    let mut call = String::new();
    let mut torque_text = String::new();
    if p.torque {
        call.push_str(r##"    #====================================================================================
    #  Output - Current torque
    #====================================================================================
    Current_torque();
"##);
        torque(p, &strings(), &mut torque_text);
    }
    let torque = torque_text;
    write!(
        out,
        r##"Start;
    #====================================================================================
    #  Reset - Start all static
    #====================================================================================
    xReIO_run_all_static = OFF;
    #====================================================================================
    #  Output - Control mode
    #====================================================================================
    # Remote IO = 3 other TP, API, ECT
    If ywReIO_cur_control == 3
        Set yRemote_mode_sts,ON;
    Else
        Set yRemote_mode_sts,OFF;
    EndIf;
{call}End;
{torque}"##
    )
    .unwrap();
}

pub(super) fn exchange(indent: &str, message: &str, out: &mut String) {
    write!(out, "{indent}Connect_socket();\n{indent}Send_data(\"{message}\");\n{indent}Str[0] = Receive_data();\n{indent}LB[0] = StrGetData(Str[0],\",\",LD[0]);\n{indent}PR[0] = (LD[0],LD[1],0,LD[2],0,0);\n").unwrap();
}

pub(super) fn process(p: &Plan, out: &mut String) {
    let s = &p.steps[0];
    let n = s.no;
    let args = strings();
    let [stage, client, ip, port, simulation, vision_delay, simulation_actions, simulation_speed] =
        args.as_slice()
    else {
        unreachable!()
    };
    let sim = simulation == "1";
    let speed = if sim {
        simulation_speed.as_str()
    } else {
        "xwPeel_speed"
    };
    let tool_no = s.tool_no();
    let last_wait = s.extra as i32 + 1;
    let mut before_offset = String::new();
    let mut after_move = String::new();
    let mut socket = String::new();
    if sim {
        if s.socket() && s.method != "Check" {
            before_offset.push_str(vision_delay);
        } else if (s.method == "Check" || s.method == "Calibration") && !vision_delay.is_empty() {
            write!(after_move, r##"    #================================================================================
    #  Vision Check Shot - simulation time
    #================================================================================
{vision_delay}"##).unwrap();
        }
    } else if s.socket() {
        if s.method == "Check" {
            after_move.push_str(r##"    #================================================================================
    #  Vision Check Shot
    #================================================================================
"##);
            exchange("    ", "Shot", &mut after_move);
        } else {
            exchange("    ", "Shot", &mut before_offset);
        }
        write!(socket, r##"#====================================================================================
#  Open Socket
#====================================================================================
Func Connect_socket()
    Print "P{n} - Vision Socket Connect Start";
    #================================================================================
    Close Socket,2;
    Int i;
    Int error_count = 5;
"##).unwrap();
        if client == "1" {
            write!(
                socket,
                r##"    String server_IP = "{ip}";
    Int server_port = {port};
    #================================================================================
    For i=1,i <= error_count,Step[1]
        Open Socket(server_IP,server_port,2,Single,LB[0]);
        If LB[0] == 1
            Break;
        ElseIf LB[0] == 0 And i >= error_count
            Alarm[13]; #Socket COMM Error
        EndIf;
        Delay T[0.5];
    EndFor;
"##
            )
            .unwrap();
        } else {
            socket.push_str(r##"    #================================================================================
    For i=1,i <= error_count,Step[1]
        LB[0] = GetPortState(2);
        If LB[0] == 1
            Break;
        ElseIf LB[0] == 0 And i >= error_count
            Alarm[13]; #Socket COMM Error
        EndIf;
        Delay T[0.5];
    EndFor;
"##);
        }
        write!(
            socket,
            r##"    Print "P{n} - Vision Socket Connect End";
EndFunc;
#====================================================================================
#  Send data
#====================================================================================
Func Send_data(String send_data)
    Send Port[2],send_data;
    Print "P{n} - Vision Socket Sent data : " + send_data;
EndFunc;
#====================================================================================
#  Receive data
#====================================================================================
Func String Receive_data()
    L[800]:
    Get Port[2],T[100],Goto L[800];
    String received_data = GetPortbuf(0,100,2);
    Print "P{n} - Vision Socket Received data : " + received_data;
    Return received_data;
EndFunc;
"##
        )
        .unwrap();
    }
    let mut tool_check = String::new();
    let mut tool_actions = String::new();
    if p.control {
        let suffix = if p.dio { "_chk" } else { "" };
        let mut actions = Vec::new();
        let mut input = "";
        match (s.work.as_str(), s.method.as_str(), s.tool.as_str()) {
            ("Trash", _, _) => {
                input = "xTrash_ungrip";
                actions.extend([
                    "Trash_Grip".into(),
                    "Tool_Vac_OFF".into(),
                    "Trash_Ungrip".into(),
                ]);
            }
            (work, "Get", tool @ ("Vacuum" | "Gripper")) => {
                input = if tool == "Vacuum" {
                    "xTool_vac_on"
                } else {
                    "xTool_grip"
                };
                actions.push(if tool == "Vacuum" {
                    "Tool_Vac_ON".into()
                } else {
                    "Tool_Grip".into()
                });
                if work == "Stage" {
                    actions.push(format!("{stage}_Vac_OFF"));
                }
            }
            (work, "Put", tool @ ("Vacuum" | "Gripper")) => {
                input = if tool == "Vacuum" {
                    "xTool_vac_off"
                } else {
                    "xTool_ungrip"
                };
                if work == "Stage" {
                    actions.push(format!("{stage}_Vac_ON"));
                }
                actions.push(if tool == "Vacuum" {
                    "Tool_Vac_OFF".into()
                } else {
                    "Tool_Ungrip".into()
                });
            }
            (_, method, _) if method != "Get" && method != "Put" && s.peeling() => {
                input = "xTool_grip";
                actions.push("Tool_Grip".into());
            }
            _ => {}
        }
        if !actions.is_empty() {
            const RULE:&str="    #================================================================================\n";
            tool_actions.push_str(RULE);
            for name in actions {
                writeln!(tool_actions, "    s04_Tool_Control.{name}();").unwrap();
            }
            if !sim {
                write!(tool_check,"{RULE}    #  Tool position check\n{RULE}    If {input}{suffix}\n        Alarm[15];\n    EndIf;\n").unwrap();
            }
        }
    } else if sim {
        tool_actions.push_str(simulation_actions);
    }
    let mut process_action = String::new();
    let mut final_action = String::new();
    if s.peeling() {
        if !p.control && !sim {
            process_action.push_str(r##"    #================================================================================
    #  Waiting Grip
    #================================================================================
    Set yPeel_pos_comp,ON;
    Wait xPeel_start == ON;
    Set yPeel_pos_comp,OFF;
"##);
        }
        process_action.push_str(r##"    #================================================================================
    #  Peeling
    #================================================================================
"##);
        for i in 1..=5 {
            write!(process_action, "    R_Cur_pos = {};\n    Movl P{n}_Peel_{i},Speed[{speed}],Z[2],Tool[B_Tool],Wobj[B_Wobj];\n", n * 100 + 11 + i).unwrap();
        }
        write!(final_action, "    R_Cur_pos = {};\n    Movl P{n}_Peel_end,Speed[{speed}],Z[1],Tool[B_Tool],Wobj[B_Wobj];\n", n * 100 + 20).unwrap();
    }
    let mut wait_moves = String::new();
    for i in 2..=last_wait {
        write!(wait_moves, "            R_Cur_pos = {};\n            Movj P{n}_Wait{i},V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];\n", n * 100 + i).unwrap();
    }
    let mut teaching = String::new();
    if p.teach && !sim {
        teaching.push_str("    If xTeach_mode\n        s03_teach_mode.Teaching_mode();\n        Goto L[0];\n    EndIf;\n    #================================================================================\n");
    }
    let deceleration = if s.method == "Put" { ",DEC[5]" } else { "" };
    let (work_flag, wait_flag) = if sim {
        ("(wait_call == 0)".into(), "(wait_call == 1)".into())
    } else if p.busy {
        (
            format!("yP{n}_work_pos_busy"),
            format!("yP{n}_wait_pos_busy"),
        )
    } else {
        (
            format!("xP{n}_work_pos_start"),
            format!("xP{n}_wait_pos_start"),
        )
    };
    let mut completion = String::new();
    if !sim {
        if p.wait {
            write!(completion, "    If {wait_flag}\n        Set yP{n}_wait_pos_comp,ON;\n    ElseIf {work_flag}\n        Set yP{n}_work_pos_comp,ON;\n    EndIf;\n").unwrap();
        } else {
            write!(completion, "    Set yP{n}_work_pos_comp,ON;\n").unwrap();
        }
    }
    let arguments = if sim { "Int wait_call" } else { "" };
    let label = if sim { "" } else { "    L[0]:\n" };
    write!(
        out,
        r##"Func P{n}_pos({arguments})
{tool_check}    #================================================================================
    #  Path setting - Same process
    #================================================================================
    If {work_flag} And R_Cur_pos == {}
        B_path = 10; #Starting position = Up
    ElseIf {work_flag} And R_Cur_pos == {}
        B_path = 10; #Starting position = Up
        s01_initial.Return_move(10); #UP pos Return from before Process Pos
"##,
        n * 100 + last_wait,
        n * 100 + 11
    )
    .unwrap();
    if p.wait {
        write!(out, "    ElseIf {wait_flag} And R_Cur_pos == {}\n        B_path = 1; #Starting position = Wait\n        s01_initial.Return_move(10); #Go back Up position of before process\n", n * 100 + 11).unwrap();
    }
    write!(
        out,
        r##"    #================================================================================
    #  Path setting - other process
    #================================================================================
    Else
        B_path = 0; #Starting position = Safe
        s01_initial.Return_move(0); #Return from Previous Process Pos
    EndIf;
    #================================================================================
    #  Set signal
    #================================================================================
    B_Cur_process = {n};
    B_Tool = {tool_no};
    B_Wobj = 0;
    B_PR = {};
    #================================================================================
{teaching}    #  Move
    #================================================================================
{before_offset}    s02_offset.Set_PR();
    #================================================================================
    Switch B_path
        Case 0:
            R_Cur_pos = {};
            Movj P{n}_Safe,V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];
        Case 1:
            R_Cur_pos = {};
            Movj P{n}_Wait,V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];
{wait_moves}"##,
        n * 10,
        n * 100,
        n * 100 + 1
    )
    .unwrap();
    if p.wait {
        write!(
            out,
            "            If {wait_flag}\n                Break;\n            EndIf;\n"
        )
        .unwrap();
    }
    write!(out, r##"        Case 10:
            R_Cur_pos = {};
            Movj Offset(P{n}_Pre_work, PR[B_PR]),V[100],Z[1],Tool[B_Tool],Wobj[B_Wobj];
            R_Cur_pos = {};
            Movl Offset(P{n}_Work, PR[B_PR]),V[100],Z[0],Tool[B_Tool],Wobj[B_Wobj]{deceleration};
            Break;
    EndSwitch;
{after_move}{tool_actions}{process_action}    #================================================================================
    #  Process Complete
    #================================================================================
{final_action}{label}    Print "P{n} - {} {} pos End";
{completion}EndFunc;
"##, n * 100 + 10, n * 100 + 11, s.work, s.method).unwrap();
    if !socket.is_empty() {
        write!(out, "\n{socket}").unwrap();
    }
}
