ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2025-11-16 오후 7:42:39"
    RobotName = "IR-R25-178S5-D1NH-INT_01741089"
EndProgramInfo
Func reset() #Program Number 1001
    Set yHoming, ON;
    Set yInit_start, ON;
    Str[3] = ""; 
    Str[14] = ""; 
    Str[15] = ""; 
    Clear Port[2];
    Clear Port[3];
    Wait xSocket_receive_Req == ON,T[1], Goto L[0];
    L[0]:
    If xSocket_receive_Req
        s09_receive.receive_socket();
        if Strcmp(Str[14],"Receive Socket Exit") <> 0
            ybCur_process = 0;
            s05_error.set_log("Receive Socket Communication Error");
            Pause;
        EndIf;
    EndIf;
    If yHome_position
        B_Skip_course = 0;
        B_Bef_process = 0;
        B_Cur_process = 0;
        ybCur_process = 0;
        R_Cur_pos = 1;
    EndIf;
    s03_course_set.data_set();
    Clear Out[537],4; 
    Clear Out[542],82; 
    Clear Out[640],48; 
    Set yP1_interlock,ON;
    Set yP2_interlock,ON;
    Set yP3_interlock,ON;
    Set yTool_vac_off_Req,OFF;
    Set yTool_vac_on_Req,OFF;
EndFunc;