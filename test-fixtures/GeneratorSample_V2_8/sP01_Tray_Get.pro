ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2026-07-26 오전 11:12:02"
    RobotName = "IR-R25-178S5-D1NH-INT_01741089"
EndProgramInfo
Func P1() #sP01_Tray_Get
    #================================#    
    #  Set up                           
    #================================#    
    SetAcc(25,25);
    SetAccRamp(15,15);
    s08_multi_recipe.set_recipe(B_Cur_recipe);
    B_Bef_process = B_Cur_process;
    B_Cur_process = 1;
    ybCur_process = B_Cur_process;
    #================================#    
    #  Skip Course                          
    #================================#    
    If B_Skip_course == 10 #Set to before process for Skip    
        B_Skip_course = 0; #Reset Skip course    
    Else
        s04_course_move.select();
    EndIf;
    #================================#    
    Set yP1_interlock,ON;
    #================================#    
    L[0]: #Loop    
    #================================#    
    If xProcess_exit
        Set yP1_interlock, ON;
        ybCur_process = 0;
        Ret;
    #================================#    
    ElseIf xProcess_error
        Print "Process Error stop";
        Pause;
    EndIf;
    Goto L[0]; #Goto Loop    
    #================================#    
    #  Process Action
    #================================#    
    L[1]: #Start    
    Set yTool1_sts,ON;
    Set yP1_interlock, OFF;
    B_Error_retry_count = 0;
    Wait xTool_vac_off == ON; #Start Error
    #================================#    
    #  Retry                     
    #================================#    
    L[2]: #Retry    
    s06_offset.shift(); 
    R_Cur_pos = 110; #Up    
    Movl Offset(P[110],PR[1]),V[100],Z[1],Tool[1],Wobj[1];
    R_Cur_pos = 111; #Down    
    Movl Offset(P[111],PR[2]),Speed[500],Z[0],Tool[1],Wobj[1];
    #================================#    
    Set yTool_vac_off_Req,OFF;
    Set yTool_vac_on_Req,ON;
    wait xTool_vac_on == ON, T[5], Goto L[901]; #Vac on Error    
    Set yTool_vac_on_Req,OFF;
    #================================#    
    Set yP1_comp,ON;
    LP[110] = Offset(P[111],Z[5]);
    R_Cur_pos = 112; #Return Up    
    Movl Offset(LP[110],PR[1]),Speed[10],Z[3],Tool[1],Wobj[1];
    Movl Offset(P[110],PR[1]),Speed[500],Z[CP],Tool[1],Wobj[1];
    #================================#    
    wait xComp_return == ON;
    Set yP1_comp,OFF;
    Set yTool1_sts,OFF;
    Goto L[0];
    #================================#
    #  Start Error               
    #================================#
    L[900]:
    s05_error.set_log("Process 1 Start Error");
    Goto L[0]; #Goto Loop
    L[901]:
    s05_error.set_log("Process 1 Tool Vacuum ON Error");
    Goto L[0];
EndFunc;