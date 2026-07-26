ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2026-07-26 오전 11:12:02"
    RobotName = "IR-R25-178S5-D1NH-INT_01741089"
EndProgramInfo
Func P3() #sP03_Vision_Calibration
    #================================# 
    #  Set up                        
    #================================# 
    s08_multi_recipe.set_recipe(xbRecipe_select); #Use recipe
    B_Bef_process = B_Cur_process;
    B_Cur_process = 3;
    ybCur_process = B_Cur_process;
    #================================#
    #  Skip Course                      
    #================================#
    If B_Skip_course == 99 #Set to before process for Skip
        B_Skip_course = 0; #Reset Skip course
    Else
        s04_course_move.select();
    EndIf;
    #================================#
    Set yP3_interlock,ON;
    R_Cur_pos = 301;
    Movj P[301],V[100],Z[CP],Tool[1],Wobj[3];
    L[0]: #Loop
    If xProcess_exit
        Set yP3_interlock, ON;
        ybCur_process = 0;
        Ret;
    ElseIf xProcess_error
        Print "Process Error stop";
        Pause;
    EndIf;
    Goto L[0]; 
    #================================#
    #  Vision Calibration
    #================================#
    L[1]: #Vision Cali
    Set yP3_interlock, OFF;
    #================================#
    R_Cur_pos = 310;
    Movl P[310],V[100],Z[2],Tool[1],Wobj[3];
    R_Cur_pos = 311;
    Movl P[311],V[100],Fine,Tool[1],Wobj[3];
    #================================#
    L[2]:
    Set yVision_cali_shot,ON;
    #================================#
    While True
        If xVision_shot_Ack
            Set yVision_cali_shot,OFF;
            Wait xVision_shot_Ack == OFF;
            s06_offset.shift();
            R_Cur_pos = 311;
            Movl Offset(P[311],PR[2]),Speed[50],Z[0],Tool[1],Wobj[3];
            Delay T[0.5];
            Set yVision_cali_shot,ON;
        ElseIf xVision_cali_comp
            Set yVision_cali_shot,OFF;
            Wait xVision_cali_comp == OFF;
            Break;
        EndIf;
    EndWhile;
    #================================#
    Set yP3_comp,ON;
    R_Cur_pos = 312; 
    Movl P[310],V[100],Z[CP],Tool[1],Wobj[3];
    wait xComp_return == ON;
    Set yP3_comp,OFF;
    Goto L[0];
EndFunc;