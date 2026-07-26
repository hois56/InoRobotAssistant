ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2025-11-16 오후 10:11:39"
    RobotName = "IR-R25-178S5-D1NH-INT_01741089"
EndProgramInfo
#================================# 
#  shift                  
#================================# 
Func shift()
    #Shift Setting (Tray Program) 
    #================================# 
    #  Register Data Initial          
    #================================# 
    PR[1] = (0,0,0,0,0,0); #T1 Up pos
    PR[2] = (0,0,0,0,0,0); #BWD Down pos
    PR[10] = (0,0,0,0,0,0); #FWD Down pos 
    PR[11] = (0,0,0,0,0,0); #FWD Up pos 
    #================================#   
    Int i; #socket start address
    Switch B_Cur_process
    #================================# 
    #  Tray Get             
    #================================# 
    Case 1: #Tray Get
        #UI offset
        i = 20;
        PR[1] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        i = 26;
        PR[2] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        Break;
    #================================# 
    #  MCR      
    #================================# 
    Case 2: #MCR
        i = 32; 
        PR[1] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        i = 38; 
        PR[2] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        Break;
    #================================# 
    #  Vision check        
    #================================# 
    Case 3: #Vision check
        If xP3_offset_use
            s09_receive.receive_IO();
            #================================# 
            #Move Vision pos offset
            LPR[1] = (D_Offset_X,D_Offset_Y,D_Offset_Z,D_Offset_A,0,0); #Vision shot 2 pos offset(IO Comm)
            LPR[2] = (D_Offset_X,D_Offset_Y,D_Offset_Z,D_Offset_A,0,0); #Vision shot 2 pos offset(IO Comm)
            #UI offset
        EndIf;
            i = 44; 
            PR[1] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
            PR[1] = PR[1] + LPR[1];
            i = 50; 
            PR[2] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
            PR[2] = PR[2] + LPR[2];
        Break;
    #================================# 
    #  reverse stage Put  
    #================================# 
    Case 4: #reverse stage Put
        If xP4_offset_use
            #            s09_receive.receive_IO();
            #            #================================#
            #            #Tray pocket & Vision offset
            #            PR[1] = (D_Offset_X,D_Offset_Y,D_Offset_Z,D_Offset_A,0,0); #Vision offset(IO Comm)
            #            PR[2] = (D_Offset_X,D_Offset_Y,D_Offset_Z,D_Offset_A,0,0); #Vision offset(IO Comm)
            #UI offset
            i = 56;
            PR[1] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
#            PR[1] = PR[1] + LPR[1];
            i = 72;
            PR[2] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
#            PR[2] = PR[2] + LPR[2];
        EndIf;
        Break;
    #================================# 
    #  Stage get     
    #================================# 
    Case 5: #stage get
        If xP5_offset_use
            s09_receive.receive_IO();
            LPR[1] = (D_Offset_X,D_Offset_Y,D_Offset_Z,D_Offset_A,0,0); #Vision offset(IO Comm)
            LPR[2] = (D_Offset_X,D_Offset_Y,D_Offset_Z,D_Offset_A,0,0); #Vision offset(IO Comm)
        EndIf;
            i = 68; 
            PR[1] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
            PR[1] = PR[1] + LPR[1];
            i = 74; 
            PR[2] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
            PR[2] = PR[2] + LPR[2];
        Break;
    #================================# 
    #  Upper stage put     
    #================================# 
    Case 6: #Upper stage put
        i = 80; 
        PR[1] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        i = 86; 
        PR[2] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        Break;
    #================================# 
    #  Upper stage get     
    #================================# 
    Case 7: #Upper stage get
        i = 92; 
        PR[1] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        i = 98; 
        PR[2] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        Break;
    #================================# 
    #  ULD Buffer stage put    
    #================================# 
    Case 8: #ULD Buffer stage put
        i = 104; 
        PR[1] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        i = 110; 
        PR[2] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        Break;
    #================================# 
    #  LD Reverse get     
    #================================# 
    Case 9: #LD Reverse get
        i = 116; 
        PR[1] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        i = 122; 
        PR[2] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        Break;
    #================================# 
    #  OK put     
    #================================# 
    Case 10: #OK put
        i = 128; 
        PR[1] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        i = 134; 
        PR[2] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        Break;
    #================================# 
    #  NG put   
    #================================# 
    Case 11: #NG put
        i = 140; 
        PR[1] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        i = 146; 
        PR[2] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
        Break;
    #================================# 
    #  Vision cali 
    #================================# 
    Case 12: #Vision cali
        If xP5_offset_use
            s09_receive.receive_IO();
            #================================# 
            #Tray pocket & Vision offset
            LPR[1] = (D_Offset_X,D_Offset_Y,D_Offset_Z,D_Offset_A,0,0); #Vision offset(IO Comm)
            LPR[2] = (D_Offset_X,D_Offset_Y,D_Offset_Z,D_Offset_A,0,0); #Vision offset(IO Comm)
        EndIf;
            i = 152; 
            PR[1] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
            PR[1] = PR[1] + LPR[1];
            i = 158; 
            PR[2] = (afSocket[i],afSocket[i+1],afSocket[i+2],afSocket[i+5],afSocket[i+4],afSocket[i+3]);
            PR[2] = PR[2] + LPR[2];
        Break;
    Default:
        s05_error.set_log("Offset Program Error");
        Pause;
        Break;
    EndSwitch;
EndFunc;
#================================# 
#  shift Cancel         
#================================# 
Func shift_cancel() #Change & Save tray center pos
    #R_Cur_pos == Down position(x11)
    Int up = R_Cur_pos-1;
    Int down = R_Cur_pos;
    LPR[255] = (0,0,0,0,0,0);
    #================================# 
    #Tool select
    Int cur_tool = StrToR(left(right(RToStr(down), 2), 1));
    int PR_num;
    If cur_tool == 1
        PR_num = 1;
    ElseIf cur_tool == 2
        PR_num = 3;
    ElseIf cur_tool == 3
        PR_num = 5;
    EndIf;
    Print "[Shift cancel]Current Tool number : "+cur_tool;
    #================================# 
    LPR[0] = LPR[255] - PR[PR_num]; #Change sign
    LPR[1] = LPR[255] - PR[PR_num+1];
    LP[0] = GetCurPos();
    P[up] = Offset(LP[0],LPR[0]);
    P[down] = Offset(LP[0],LPR[1]);
    Print "[Shift cancel]Save point : P["+up+"] = "+P[up];
    Print "[Shift cancel]Save point : P["+down+"] = "+P[down];
    Delay T[1];
    Int UI_return = UIDialog("Tray Center pos Save", "Do you want save current position (Up/Down)?", 4);
    If UI_return == 7 #Click Yes
        SavePoints;
    Else
        Print "[Shift cancel] Tray center pos no save";
    EndIf;
EndFunc;