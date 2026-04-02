ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2026-04-02 오후 12:51:19"
    RobotName = "IR-R7H-90S5-C2H-INT_01741200"
EndProgramInfo
#================================================================================
#  Process Wait pos                   
#================================================================================
Func P4_wait_pos()
    #================================================================================
    #  Return move before process pos                 
    #================================================================================
    OutW[33] = 0; #Process Wait pos comp reset
    OutW[34] = 0; #Process Work pos comp reset
    Print "P4 - Stage Put Wait pos Start";
    Set yP4_wait_pos_busy,ON; #Process Wait pos busy ON
    #================================================================================
    If R_Cur_pos == 110 Or R_Cur_pos == 111
        R_Cur_pos = 410;
        Movl Offset(P4_Up, PR[B_PR_num]),V[100],Z[1],Tool[B_T_num],Wobj[B_W_num];
        R_Cur_pos = 401;
        Movj P4_Wait,V[100],Z[CP],Tool[B_T_num],Wobj[B_W_num];
        Goto L[0];
    Else
        Bool return_result = s01_initial.Return_move(); #Return move before process pos  
    EndIf;
    #================================================================================
    #  Tool / Wobj Setting                   
    #================================================================================
    B_T_num = 1; #Tool No
    B_W_num = 0;
    #================================================================================
    #  Move                     
    #================================================================================
    R_Cur_pos = 400;
    Movj P4_App,V[100],Z[CP],Tool[B_T_num],Wobj[B_W_num];
    R_Cur_pos = 401;
    Movj P4_Wait,V[100],Z[CP],Tool[B_T_num],Wobj[B_W_num];
    #================================================================================
    #  Process Wait pos Complete                    
    #================================================================================
    L[0]:
    Print "P4 - Stage Put Wait pos End";
    Set yP4_wait_pos_busy,OFF;
    Set yP4_wait_pos_comp,ON;
EndFunc;
#================================================================================
#  Process Work pos                   
#================================================================================
Func P4_work_pos()
    #================================================================================
    #  Tool position check                 
    #================================================================================
    If xTool_vac_off And ywCur_control_mode == 3
        Alarm[15];
    EndIf;
    #================================================================================
    #  Return move before process pos                 
    #================================================================================
    OutW[33] = 0; #Process signal reset
    OutW[34] = 0; #Process signal reset
    Set yP4_work_pos_busy,ON;
    #================================================================================
    If R_Cur_pos <> 401
        Bool return_result = s01_initial.Return_move();
    EndIf;
    #================================================================================
    #  Signal Initial                      
    #================================================================================
    Print "P4 - Stage Put Work pos Start";
    B_T_num = 1; #Tool No
    B_W_num = 0;
    B_PR_num = 40;
    #================================================================================
    Set_offset();
    #================================================================================
    #  Move                     
    #================================================================================
    If R_Cur_pos <> 401
        R_Cur_pos = 400;
        Movj P4_App,V[100],Z[CP],Tool[B_T_num],Wobj[B_W_num];
        R_Cur_pos = 401;
        Movj P4_Wait,V[100],Z[CP],Tool[B_T_num],Wobj[B_W_num];
    EndIf;
    #================================================================================
    R_Cur_pos = 410;
    Movl Offset(P4_Up, PR[B_PR_num]),V[100],Z[1],Tool[B_T_num],Wobj[B_W_num];
    R_Cur_pos = 411;
    Movl Offset(P4_Down, PR[B_PR_num]),Speed[100],Fine,Tool[B_T_num],Wobj[B_W_num];
    #================================================================================
    If xTeaching_mode
        P4_teaching_mode();
    EndIf;
    #================================================================================
    s02_Tool_Control.Stage2_Vac_ON();
    s02_Tool_Control.Tool_Vac_OFF();
    #================================================================================
    #  Process Complete                    
    #================================================================================
    Print "P4 - Stage Put Work pos End";
    Set yP4_work_pos_busy,OFF;
    Set yP4_work_pos_comp,ON;
EndFunc;
#====================================================================================
#  Position check mode
#====================================================================================
Func P4_teaching_mode()
    #================================================================================
    #  Return move before process pos                 
    #================================================================================
    Set yTeaching_running,ON;    
    Print "P4 - Stage Put Teaching mode Start";
    #================================================================================
    #  Move                     
    #================================================================================
    While xTeaching_mode == OFF or xTeaching_cancel == OFF
        Set_offset();
        Movl Offset(P4_Down, PR[B_PR_num]),Speed[50],Fine,Tool[B_T_num],Wobj[B_W_num];
        If xTeaching_save
            Print "Up Pos saved (Origin pos :" + P4_Up + ")";
            Print "Down Pos saved (Origin pos :" + P4_Down + ")";
            P4_Up = Offset(P4_Up,PR[B_PR_num]);
            P4_Down = Offset(P4_Down,PR[B_PR_num]);
            Print "Saved Offset value : " + PR[B_PR_num];
            Print "Up Pos saved (Saved pos :" + P4_Up + ")";
            Print "Down Pos saved (Saved pos :" + P4_Down + ")";
            SavePoints;
            Break;
        EndIf;
    EndWhile;
    #================================================================================
    Set yTeaching_running,OFF;
    Print "P4 - Stage Put Teaching mode End";
EndFunc;
#====================================================================================
# Set Offset                  
#====================================================================================
Func Set_offset()
    PR[B_PR_num] = (xwP4_offset_X.Int/10000,xwP4_offset_Y.Int/10000,xwP4_offset_Z.Int/10000,xwP4_offset_A.Int/10000,0,0);
EndFunc;
