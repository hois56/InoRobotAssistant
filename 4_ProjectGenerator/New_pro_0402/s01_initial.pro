ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2026-04-02 오후 12:51:18"
    RobotName = "IR-R7H-90S5-C2H-INT_01741200"
EndProgramInfo
#====================================================================================
#  Init Signal
#====================================================================================
Func Init_signal()
    Clear Out[528],192; #[528] ~ [719]
EndFunc;
#====================================================================================
#  Init Move Home
#====================================================================================
Func Init_move_home()
    #================================================================================
    #  Signal Set                  
    #================================================================================
    B_W_num = R_Cur_pos / 100;
    #================================================================================
    #  Find cur point number                  
    #================================================================================
    If yRobot_home_sts
        R_Cur_pos = 0;
    Else
        Find_cur_point_all();
    EndIf;
    #================================================================================
    Velset 50;
    Bool return_result = Return_move();
    If return_result == OFF
        Velset OFF;
        Print "Homing Fail! Incorrect value. R_Cur_pos :  " + R_Cur_pos;
        Alarm[14]; #Homing Error
    EndIf;
    #================================================================================
    R_Cur_pos = 0;
    Home[0],V[100];
    Velset OFF;
EndFunc;
#====================================================================================
#  Return Move
#====================================================================================
Func Bool Return_move()
    Int cur_proces = R_Cur_pos / 100;
    Print "Return move Process : " + cur_proces;
    #================================================================================
    Switch R_Cur_pos
        Case 0: #Home
            Break;
        #============================================================================
        #  P1 - Tray Get
        #============================================================================
        Case 111:
            Movl Offset(P1_Up, PR[B_PR_num]),V[100],Z[1],Tool[1],Wobj[B_W_num];
            R_Cur_pos = 110;
        Case 110:
            Movj P1_Wait,V[100],Z[1],Tool[1],Wobj[B_W_num];
            R_Cur_pos = 101;
        Case 100 To 101:
            Movj P1_App,V[100],Z[CP],Tool[1],Wobj[B_W_num];
            R_Cur_pos = 100;
            Break;
        #============================================================================
        #  P2 - Tray Put
        #============================================================================
        Case 211:
            Movl Offset(P2_Up, PR[B_PR_num]),V[100],Z[1],Tool[1],Wobj[B_W_num];
            R_Cur_pos = 210;
        Case 210:
            Movj P2_Wait,V[100],Z[1],Tool[1],Wobj[B_W_num];
            R_Cur_pos = 201;
        Case 200 To 201:
            Movj P2_App,V[100],Z[CP],Tool[1],Wobj[B_W_num];
            R_Cur_pos = 200;
            Break;
        #============================================================================
        #  P3 - Stage Get
        #============================================================================
        Case 311:
            Movl Offset(P3_Up, PR[B_PR_num]),V[100],Z[1],Tool[2],Wobj[B_W_num];
            R_Cur_pos = 310;
        Case 310:
            Movj P3_Wait,V[100],Z[1],Tool[2],Wobj[B_W_num];
            R_Cur_pos = 301;
        Case 300 To 301:
            Movj P3_App,V[100],Z[CP],Tool[2],Wobj[B_W_num];
            R_Cur_pos = 300;
            Break;
        #============================================================================
        #  P4 - Stage Put
        #============================================================================
        Case 411:
            Movl Offset(P4_Up, PR[B_PR_num]),V[100],Z[1],Tool[1],Wobj[B_W_num];
            R_Cur_pos = 410;
        Case 410:
            Movj P4_Wait,V[100],Z[1],Tool[1],Wobj[B_W_num];
            R_Cur_pos = 401;
        Case 400 To 401:
            Movj P4_App,V[100],Z[CP],Tool[1],Wobj[B_W_num];
            R_Cur_pos = 400;
            Break;
        #============================================================================
        #  Other
        #============================================================================
        Default:
            Return False;
            Break;
    EndSwitch;
    Return True;
EndFunc;
#====================================================================================
#  Find Current Point Number
#====================================================================================
Func Find_cur_point_all()
    Int min_index;
    Int PR_num;
    Int last_pos_num = 411; # Find range : P[0] ~ P[411]
    int i;    
    Double pos_dist[412];
    Double min_dist = 5000;
    #================================================================================
    LP[0] = GetCurPos();
    For i=0,i<=last_pos_num,Step[1]
        pos_dist[i] = Dist(P[i],LP[0]);
        If (i % 100) >= 10 And (i % 100) <= 11
            PR_num = i / 100;
            LP[1] = Offset(P[i],PR[PR_num]);
            pos_dist[i] = Dist(LP[1],LP[0]);
        EndIf;
        If pos_dist[i] < min_dist
            min_dist = pos_dist[i];
            min_index = i;
        EndIf;
    EndFor;
    #================================================================================
    If min_dist < 1 
        Print "Current pos : P[ " + min_index + " ]";
        R_Cur_pos = min_index;
    Else
        Print "Cannot find the correct point number. Proceeding to Home based on R_cur_pos.";
    EndIf;
EndFunc;
#====================================================================================
#  Manual Set Recipe                     
#====================================================================================
Func Manual_set_recipe() #Change recipe  
    Switch xwP_file_switch
        Case 0:
            LoadPoints("P.pts");
            Break;
        Case 1:
            LoadPoints("P01.pts");
            Break;
    EndSwitch;
    Print "Manual set recipe : " + GetCurPointsFileName();
EndFunc;
