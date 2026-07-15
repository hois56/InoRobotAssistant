ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2026-04-02 오후 12:51:18"
    RobotName = "IR-R7H-90S5-C2H-INT_01741200"
EndProgramInfo
Func Tool_Vac_ON()
    Set yTool_vac_off_REQ,OFF;
    Set yTool_vac_on_REQ,ON;
    Wait xTool_vac_on == ON, T[60], Goto L[900];
    Set yTool_vac_on_REQ,OFF;
    Ret;
    L[900]:
    s01_initial.Init_signal();
    Alarm[0];
EndFunc;
#====================================================================================
Func Tool_Vac_OFF()
    Set yTool_vac_on_REQ,OFF;
    Set yTool_vac_off_REQ,ON;
    Wait xTool_vac_off == ON, T[60], Goto L[901];
    Set yTool_vac_off_REQ,OFF;
    Ret;
    L[901]:
    s01_initial.Init_signal();
    Alarm[1];
EndFunc;
#====================================================================================
Func Tool_Grip()
    Set yTool_ungrip_REQ,OFF;
    Set yTool_grip_REQ,ON;
    Wait xTool_grip == ON, T[60], Goto L[902];
    Set yTool_grip_REQ,OFF;
    Ret;
    L[902]:
    s01_initial.Init_signal();
    Alarm[2];
EndFunc;
#====================================================================================
Func Tool_Ungrip()
    Set yTool_grip_REQ,OFF;
    Set yTool_ungrip_REQ,ON;
    Wait xTool_ungrip == ON, T[60], Goto L[903];
    Set yTool_ungrip_REQ,OFF;
    Ret;
    L[903]:
    s01_initial.Init_signal();
    Alarm[3];
EndFunc;
#====================================================================================
Func Stage_Vac_ON()
    Set yStage_vac_off_REQ,OFF;
    Set yStage_vac_on_REQ,ON;
    Wait xStage_vac_on == ON, T[60], Goto L[906];
    Set yStage_vac_on_REQ,OFF;
    Ret;
    L[906]:
    s01_initial.Init_signal();
    Alarm[6];
EndFunc;
#====================================================================================
Func Stage_Vac_OFF()
    Set yStage_vac_on_REQ,OFF;
    Set yStage_vac_off_REQ,ON;
    Wait xStage_vac_off == ON, T[60], Goto L[907];
    Set yStage_vac_off_REQ,OFF;
    Ret;
    L[907]:
    s01_initial.Init_signal();
    Alarm[7];
EndFunc;
#====================================================================================
Func Stage2_Vac_ON()
    Set yStage2_vac_off_REQ,OFF;
    Set yStage2_vac_on_REQ,ON;
    Wait xStage2_vac_on == ON, T[60], Goto L[908];
    Set yStage2_vac_on_REQ,OFF;
    Ret;
    L[908]:
    s01_initial.Init_signal();
    Alarm[6];
EndFunc;
#====================================================================================
Func Stage2_Vac_OFF()
    Set yStage2_vac_on_REQ,OFF;
    Set yStage2_vac_off_REQ,ON;
    Wait xStage2_vac_off == ON, T[60], Goto L[909];
    Set yStage2_vac_off_REQ,OFF;
    Ret;
    L[909]:
    s01_initial.Init_signal();
    Alarm[7];
EndFunc;
