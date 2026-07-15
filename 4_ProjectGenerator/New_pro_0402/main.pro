ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2026-04-02 오후 12:51:18"
    RobotName = "IR-R7H-90S5-C2H-INT_01741200"
EndProgramInfo
Include "s01_initial.pro";
Include "s02_Tool_Control.pro";
Include "sP01_Tray_Get.pro";
Include "sP02_Tray_Put.pro";
Include "sP03_Stage_Get.pro";
Include "sP04_Stage_Put.pro";
Start;
    If Tool[1].TLoad.Mass == 0
        Tool[1].TLoad.Mass = 7;
    EndIf;
    #================================================================================
    L[0]:
    s01_initial.Manual_set_recipe();
    #================================================================================
    If xwSet_speed <= 0
        Velset Rate[1];
    ElseIf xwSet_speed > 100
        Velset Rate[100];
    Else
        Velset Rate[xwSet_speed];
    EndIf;
    #================================================================================
    If xRobot_homing
        s01_initial.Init_move_home();
        s01_initial.Init_signal();
    EndIf;
    #================================================================================
    #  Process Wait pos               
    #================================================================================
    If xP1_wait_pos_start
        sP01_Tray_Get.P1_wait_pos();
    EndIf;
    If xP2_wait_pos_start
        sP02_Tray_Put.P2_wait_pos();
    EndIf;
    If xP3_wait_pos_start
        sP03_Stage_Get.P3_wait_pos();
    EndIf;
    If xP4_wait_pos_start
        sP04_Stage_Put.P4_wait_pos();
    EndIf;
    #================================================================================
    #  Process Work pos               
    #================================================================================
    If InW[33] == 0
        If xP1_work_pos_start
            sP01_Tray_Get.P1_work_pos();
        EndIf;
        If xP2_work_pos_start
            sP02_Tray_Put.P2_work_pos();
        EndIf;
        If xP3_work_pos_start
            sP03_Stage_Get.P3_work_pos();
        EndIf;
        If xP4_work_pos_start
            sP04_Stage_Put.P4_work_pos();
        EndIf;
    EndIf;
    #====================================================================================
    Delay T[0.1];
    Goto L[0];
End;
