ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2025-11-16 오후 7:42:39"
    RobotName = "IR-R25-178S5-D1NH-INT_01741089"
EndProgramInfo
Func select() #Program Number 1003  
    Int cal_process = B_Bef_process * 100 + B_Cur_process;
    Switch cal_process
        Case 0 TO 20:
        Case 100 TO 120:
        Case 200 TO 220:
        Case 300 TO 320:
        Case 400 TO 420:
        Case 500 TO 520:
        Case 600 TO 620:
        Case 700 TO 720:
        Case 800 TO 820:
        Case 900 TO 920:
        Case 1000 TO 1020:
        Case 1100 TO 1120:
        Case 1200 TO 1220:
        Case 1300 TO 1320:
        Case 1400 TO 1420:
        Case 1500 TO 1520:
        Case 1600 TO 1620:
        Case 1700 TO 1720:
        Case 1800 TO 1820:
        Case 1900 TO 1920:
        Case 2000 TO 2020:
            If B_Skip_course == 255
                go_bef_approach();
                go_cur_approach();
            ElseIf abyCourse_from_wait[B_Bef_process][B_Cur_process] == 0
                go_bef_approach();
                go_cur_approach();
            ElseIf abyCourse_from_wait[B_Bef_process][B_Cur_process] == 1
                go_bef_approach();
            ElseIf abyCourse_from_wait[B_Bef_process][B_Cur_process] == 2
                go_cur_approach();
            ElseIf abyCourse_from_wait[B_Bef_process][B_Cur_process] == 3
                Break;
            Else 
                s05_error.set_log("Course Data Error");
            EndIf;
            Break;
        Default: 
            s05_error.set_log("Course Data Error");
            Pause;
            Break;
    EndSwitch;
EndFunc;

Func go_bef_approach() 
    Switch B_Bef_process 
        Case 0:
            Break;
        Case 1: #P1 End App
            R_Cur_pos = 199;
            Movj P[100],V[100],Z[4],Tool[1],Wobj[1];
            Break;
        Case 2: #P2 End App
            R_Cur_pos = 299;
            Movj P[200],V[100],Z[4],Tool[1],Wobj[2];
            Break;
        Case 3: #P3 End App
            R_Cur_pos = 399;
            Movj P[300],V[100],Z[4],Tool[1],Wobj[3];
            Break;
        Default:
            s05_error.set_log("Course Data Error");
            Pause;
            Break; 
    EndSwitch;
EndFunc;

Func go_cur_approach() 
    Switch B_Cur_process  
        Case 0:
            Break;
        Case 1: #P1 Start App
            R_Cur_pos = 100;
            Movj P[100],V[100],Z[4],Tool[1],Wobj[1];
            Break;
        Case 2: #P2 Start App
            R_Cur_pos = 200;
            Movj P[200],V[100],Z[4],Tool[1],Wobj[2];
            Break;
        Case 3: #P3 Start App
            R_Cur_pos = 300;
            Movj P[300],V[100],Z[4],Tool[1],Wobj[3];
            Break;
        Default:
            s05_error.set_log("Course Data Error");
            Pause;
            Break; 
    EndSwitch;
EndFunc;