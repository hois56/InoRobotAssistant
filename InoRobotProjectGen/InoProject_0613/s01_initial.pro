ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2026-06-14 오후 11:49:21"
    RobotName = "IR-R10-140S5-D1NH-INT_01741041"
EndProgramInfo
#====================================================================================
#  Init Signal
#====================================================================================
Func Init_signal()
    Clear Out[520],200; #[520] ~ [719]
EndFunc;
#====================================================================================
#  Init Move Home
#====================================================================================
Func Init_move_home()
    #================================================================================
    #  Signal Set                  
    #================================================================================
    #B_Wobj = R_Cur_pos / 100;
    If yRobot_home_sts
        R_Cur_pos = 1;
    EndIf;
    #================================================================================
    #  Start Return                  
    #================================================================================
    Velset 50;
    Return_move(0);
    #================================================================================
    R_Cur_pos = 1;
    Home[0],V[100];
    Velset OFF;
EndFunc;
#====================================================================================
#  Return Move
#====================================================================================
Func Return_move(Int return_path)
    Int cur_proces = R_Cur_pos / 100;
    Print "Return move Process : " + cur_proces;
    Switch R_Cur_pos
        Case 1: #Home
            Break;
        #============================================================================
        #  P1 - Tray Get
        #============================================================================
        Case 111:
            Movl Offset(P1_Up, PR[B_PR]),V[100],Z[2],Tool[1],Wobj[B_Wobj],Acc[5];
            R_Cur_pos = 110;
            If return_path == 10
                Break;
            EndIf;
        Case 110:
            Movj P1_Wait,V[100],Z[CP],Tool[1],Wobj[B_Wobj];
            R_Cur_pos = 101;
            If return_path == 1
                Break;
            EndIf;
        Case 100 To 101:
            Movj P1_Safe,V[100],Z[CP],Tool[1],Wobj[B_Wobj];
            R_Cur_pos = 100;
            Break;
        #============================================================================
        #  P2 - Tray Put
        #============================================================================
        Case 211:
            Movl Offset(P2_Up, PR[B_PR]),V[100],Z[1],Tool[1],Wobj[B_Wobj];
            R_Cur_pos = 210;
            If return_path == 10
                Break;
            EndIf;
        Case 210:
            Movj P2_Wait,V[100],Z[1],Tool[1],Wobj[B_Wobj];
            R_Cur_pos = 201;
            If return_path == 1
                Break;
            EndIf;
        Case 200 To 201:
            Movj P2_Safe,V[100],Z[CP],Tool[1],Wobj[B_Wobj];
            R_Cur_pos = 200;
            Break;
        #============================================================================
        #  P3 - Tray Get
        #============================================================================
        Case 311:
            Movl Offset(P3_Up, PR[B_PR]),V[100],Z[1],Tool[1],Wobj[B_Wobj],Acc[5];
            R_Cur_pos = 310; 
            If return_path == 10
                Break;
            EndIf;
        Case 310:
            Movj P3_Wait,V[100],Z[1],Tool[1],Wobj[B_Wobj];
            R_Cur_pos = 301;
            If return_path == 1
                Break;
            EndIf;
        Case 300 To 301:
            Movj P3_Safe,V[100],Z[CP],Tool[1],Wobj[B_Wobj];
            R_Cur_pos = 300;
            Break;
        #============================================================================
        #  P4 - Tray Get
        #============================================================================
        Case 411:
            Movl Offset(P4_Up, PR[B_PR]),V[100],Z[1],Tool[1],Wobj[B_Wobj],Acc[5];
            R_Cur_pos = 410;
            If return_path == 10
                Break;
            EndIf;
        Case 410:
            Movj P4_Wait,V[100],Z[1],Tool[1],Wobj[B_Wobj];
            R_Cur_pos = 401;
            If return_path == 1
                Break;
            EndIf;
        Case 400 To 401:
            Movj P4_Safe,V[100],Z[CP],Tool[1],Wobj[B_Wobj];
            R_Cur_pos = 400;
            Break;
        #============================================================================
        #  Other
        #============================================================================
        Default:
            Print "Return move Fail! Incorrect value. R_Cur_pos :  " + R_Cur_pos;
            Alarm[14]; #Return move Error
            Break;
    EndSwitch;
EndFunc;
#====================================================================================
#  Manual Set Recipe                     
#====================================================================================
Func Manual_set_recipe() #Change recipe  
    If xwP_file_switch == ywCur_P_file
        ret;
    EndIf;
    #================================================================================
    Switch xwP_file_switch
        Case 0:
            LoadPoints("P.pts");
            Break;
        Case 1:
            LoadPoints("P01.pts");
            Break;
    EndSwitch;
    #================================================================================
    String P_name = GetCurPointsFileName();
    Print "Current Point file : " + P_name;
    P_name = StrRePlace(P_name,"P","");
    P_name = StrRePlace(P_name,".pts","");
    ywCur_P_file = StrToR(P_name);
EndFunc;
