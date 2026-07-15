ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2026-06-14 오후 11:49:22"
    RobotName = "IR-R10-140S5-D1NH-INT_01741041"
EndProgramInfo
Func P3_pos()
    Print "P3 - Tray Get pos Start";
    #================================================================================
    #  Path setting - Same process              
    #================================================================================
    # Wait -> Up -> Down
    If yP3_work_pos_busy And R_Cur_pos == 301
        B_path = 10; #Starting position = Up
    #================================================================================
    # Down -> Up -> Up(offset) -> Down
    ElseIf yP3_work_pos_busy And R_Cur_pos == 311
        s01_initial.Return_move(10); #UP pos Return from before Process Pos  
        B_path = 10; #Starting position = Up
    #================================================================================
    # Down -> Up -> Wait
    ElseIf yP3_wait_pos_busy And R_Cur_pos == 311
        s01_initial.Return_move(10); #Go back Up position of before process
        B_path = 1; #Starting position = Wait 
    #================================================================================
    #  Path setting - other process              
    #================================================================================
    # App -> Wait -> Up -> Down
    Else
        s01_initial.Return_move(0); #Return from Previous Process Pos  
        B_path = 0; #Starting position = App
    EndIf;
    #================================================================================
    #  Set signal                  
    #================================================================================
    B_Cur_process = 3;
    B_Tool = 1;
    B_Wobj = 0;
    B_PR = 30;
    #================================================================================
    If xTeach_mode
        s03_teching_mode.Teaching_mode();
        Goto L[0];
    EndIf;
    #================================================================================
    #  Move                     
    #================================================================================
    s02_offset.Set_PR();
    #================================================================================
    Switch B_path
        Case 0:
            R_Cur_pos = 300;
            Movj P3_Safe,V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];
        Case 1:
            R_Cur_pos = 301;
            Movj P3_Wait,V[100],Z[CP],Tool[B_Tool],Wobj[B_Wobj];
            If yP3_wait_pos_busy
                Break;
            EndIf;
        Case 10:
            R_Cur_pos = 310;
            Movj Offset(P3_Up, PR[B_PR]),V[100],Z[1],Tool[B_Tool],Wobj[B_Wobj];
            R_Cur_pos = 311;
            Movl Offset(P3_Down, PR[B_PR]),V[100],Z[0],Tool[B_Tool],Wobj[B_Wobj];
            Break;
    EndSwitch;
    #================================================================================
    #  Process Complete                 
    #================================================================================
    L[0]:
    Print "P3 - Tray Get pos End";
    Set yP3_wait_pos_comp,ON;
EndFunc;