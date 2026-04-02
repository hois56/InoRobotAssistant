ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2026-04-02 오후 12:51:18"
    RobotName = "IR-R7H-90S5-C2H-INT_01741200"
EndProgramInfo
Start;
    D_J1_cur_torque = Abs(GetTorque(1) * 0.952);
    D_J2_cur_torque = Abs(GetTorque(2) * 1.994);
    D_J3_cur_torque = Abs(GetTorque(3) * 1.693);
    D_J4_cur_torque = Abs(GetTorque(4) * 1.389);
    D_J5_cur_torque = Abs(GetTorque(5) * 1.756);
    D_J6_cur_torque = Abs(GetTorque(6) * 0.721);
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
End;