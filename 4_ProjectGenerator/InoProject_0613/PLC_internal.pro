ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2026-06-14 오후 11:49:21"
    RobotName = "IR-R10-140S5-D1NH-INT_01741041"
EndProgramInfo
Start;
    #====================================================================================
    #  Reset - Start all static
    #====================================================================================
    xReIO_run_all_static = OFF;
    #====================================================================================
    #  Reset - R_Cur_pos (Home pos)
    #====================================================================================
    If yRobot_home_sts
        R_Cur_pos = 1;
    EndIf;
    #====================================================================================
    #  Output - Control mode
    #====================================================================================
    # Remote IO = 3 other TP, API, ECT  
    If ywReIO_cur_control == 3
        Set yRemote_mode_sts,ON;
    Else
        Set yRemote_mode_sts,OFF;
    EndIf;
    #====================================================================================
    #  Output - Current torque 
    #====================================================================================
    Current_torque();
End;
#====================================================================================
#  Current torque 
#====================================================================================
Func Current_torque()
    D_J1_cur_torque = Abs(GetTorque(1) * 0.952);
    D_J2_cur_torque = Abs(GetTorque(2) * 2.263);
    D_J3_cur_torque = Abs(GetTorque(3) * 2.754);
    D_J4_cur_torque = Abs(GetTorque(4) * 2.304);
    D_J5_cur_torque = Abs(GetTorque(5) * 2.541);
    D_J6_cur_torque = Abs(GetTorque(6) * 1.000);
    #================================================================================
    ywCur_J1_torque = D_J1_cur_torque;
    ywCur_J2_torque = D_J2_cur_torque;
    ywCur_J3_torque = D_J3_cur_torque;
    ywCur_J4_torque = D_J4_cur_torque;
    ywCur_J5_torque = D_J5_cur_torque;
    ywCur_J6_torque = D_J6_cur_torque;
    #================================================================================
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
    If D_J5_cur_torque > D_J5_max_torque
        D_J5_max_torque = D_J5_cur_torque;
    EndIf;
    If D_J6_cur_torque > D_J6_max_torque
        D_J6_max_torque = D_J6_cur_torque;
    EndIf;
EndFunc;