ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2026-06-14 오후 11:49:21"
    RobotName = "IR-R10-140S5-D1NH-INT_01741041"
EndProgramInfo
Include "s01_initial.pro";
Include "s02_offset.pro";
Include "s03_teching_mode.pro";
Include "sP01_Tray_Get.pro";
Include "sP02_Tray_Put.pro";
Include "sP03_Tray_Get.pro";
Include "sP04_Tray_Get.pro";
Start;
    #================================================================================
    #  Initial           
    #================================================================================
    xReIO_run_all_static = ON;
    #================================================================================
    If Tool[1].TLoad.Mass == 0 
        Tool[1].TLoad.Mass = 10;
    EndIf;
    #================================================================================
    s01_initial.Init_move_home();
    s01_initial.Init_signal();
    s01_initial.Manual_set_recipe();
    #================================================================================
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
    If xwProcess_work_pos > 0 And xwProcess_wait_pos == 0
        Print "Work pos Start";
        ywProcess_wait_comp = 0; #Process Wait pos comp reset
        ywProcess_work_comp = 0; #Process Work pos comp reset
        ywProcess_work_busy = xwProcess_work_pos; #Process Work pos busy ON
        #============================================================================
        If xP1_work_pos_start
            sP01_Tray_Get.P1_pos();
        ElseIf xP2_work_pos_start
            sP02_Tray_Put.P2_pos();
        ElseIf xP3_work_pos_start
            sP03_Tray_Get.P3_pos();
        ElseIf xP4_work_pos_start
            sP04_Tray_Get.P4_pos();
        EndIf;
    #================================================================================
    ElseIf xwProcess_wait_pos > 0 And xwProcess_work_pos == 0 
        Print "Wait pos Start";
        ywProcess_wait_comp = 0; #Process Wait pos comp reset
        ywProcess_work_comp = 0; #Process Work pos comp reset
        ywProcess_wait_busy = xwProcess_wait_pos; #Process Wait pos busy ON
        #============================================================================
        If xP1_wait_pos_start
            sP01_Tray_Get.P1_pos();
        ElseIf xP2_wait_pos_start
            sP02_Tray_Put.P2_pos();
        ElseIf xP3_wait_pos_start
            sP03_Tray_Get.P3_pos();
        ElseIf xP4_wait_pos_start
            sP04_Tray_Get.P4_pos();
        EndIf;
    EndIf;
    #================================================================================
    #  Singal reset          
    #================================================================================
    yTeach_mode_sts = xTeach_mode;
    ywProcess_work_busy = 0; #Process Work pos busy OFF
    ywProcess_wait_busy = 0; #Process Work pos busy OFF
    #================================================================================
    Goto L[0];
End;
