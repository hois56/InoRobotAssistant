ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2026-07-26 오전 11:12:02"
    RobotName = "IR-R25-178S5-D1NH-INT_01741089"
EndProgramInfo
Func P2() #sP02_Stage_Put
    #================================#    
    #  Set up                           
    #================================#    
    SetAcc(25,25);
    SetAccRamp(15,15);
    s08_multi_recipe.set_recipe(B_Cur_recipe);
    B_Bef_process = B_Cur_process;
    B_Cur_process = 2;
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
    Set yP2_interlock,ON;
    #================================#    
    L[0]: #Loop    
    #================================#    
    If xProcess_exit
        Set yP2_interlock, ON;
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
    Set yP2_interlock, OFF;
    B_Error_retry_count = 0;
    Wait xTool_vac_on == ON and xUpper_STG_RDY == ON;
    #================================#    
    #  Retry                     
    #================================#    
    L[2]: #Retry    
    s06_offset.shift(); 
    R_Cur_pos = 210; #Up    
    Movl Offset(P[210],PR[1]),V[100],Z[1],Tool[1],Wobj[2];
    R_Cur_pos = 211; #Down    
    Movl Offset(P[211],PR[2]),Speed[250],Z[0],Tool[1],Wobj[2];
    #================================#    
    Set yTool_vac_on_Req,OFF;
    Set yTool_vac_off_Req,ON;
    wait xTool_vac_off == ON, T[5], Goto L[901]; #Vac off Error    
    Set yTool_vac_off_Req,OFF;
    #================================#    
    Set yP2_comp,ON;
    LP[210] = Offset(P[211],Z[5]);
    R_Cur_pos = 212; #Return Up    
    Movl Offset(LP[210],PR[1]),Speed[10],Z[3],Tool[1],Wobj[2];
    Movl Offset(P[210],PR[1]),Speed[500],Z[CP],Tool[1],Wobj[2];
    #================================#    
    wait xComp_return == ON;
    Set yP2_comp,OFF;
    Set yTool1_sts,OFF;
    Goto L[0];
    #================================#
    #  Start Error               
    #================================#
    L[900]:
    s05_error.set_log("Process 2 Start Error");
    Goto L[0]; #Goto Loop
    L[901]:
    s05_error.set_log("Process 2 Tool Vacuum OFF Error");
    Goto L[0];
EndFunc;