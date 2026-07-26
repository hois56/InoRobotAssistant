ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2025-11-15 오전 2:45:28"
    RobotName = "IR-R25-178S5-D1NH-INT_01741089"
EndProgramInfo
Func set_log(String cur_error) 
    #================================#
    #  Reset Output (Tool select sts)       
    #================================#
    Set yTool1_sts,OFF;
    Set yTool2_sts,OFF;
    Set yTool3_sts,OFF;
    #================================#
    #  Get Controller time       
    #================================#
    GetLocalSysTime(LR[0]); #Read current controller time (LR[0] ~ LR[05])
    String cur_data = RToStr(LR[0])+"/"+RToStr(LR[1])+"/"+RToStr(LR[2])+" "; 
    String cur_time = RToStr(LR[3])+":"+RToStr(LR[4])+":"+RToStr(LR[5]); 
    #================================#
    #  Set Erorr Log          
    #================================#
    #Shift Error Log
    Int i; #Str[20]~Str[39]
    For i=40,i>20,Step[-1] 
        Str[i] = Str[i-1]; 
    EndFor;
    #================================#
    # Set latest Error log to Str[20]
    Str[20] = cur_error + " " + cur_data + cur_time;
    #================================#
    Print "Error! : " + Str[20];
    set_code(cur_error);
    Wait xError_return == ON ; 
    ybError_code = 0;
EndFunc;
#================================#
#  Set Error code        
#================================#
Func set_code(String cur_error) #Program Number 9999
    Switch cur_error
        Case "Origin Return Error":
            ybError_code = 1;
            Break;
        Case "Course Data Error":
            ybError_code = 2;
            Break;
        Case "Offset Program Error":
            ybError_code = 3;
            Break;
        Case "Receive Scoket Error":
            ybError_code = 7;
            Break;
        Case "Send Scoket Error":
            ybError_code = 7;
            Break;
        Case "Process 1 Error":
            ybError_code = 10;
            Break;
        Case "Process 1 Tool1 Start Error":
            ybError_code = 11;
            Break;
        Case "Process 1 Tool2 Start Error":
            ybError_code = 12;
            Break;
        Case "Process 1 Tool3 Start Error":
            ybError_code = 13;
            Break;
        Case "Process 2 Error":
            ybError_code = 20;
            Break;
        Case "Process 2 Tool1 Start Error":
            ybError_code = 21;
            Break;
        Case "Process 2 Tool2 Start Error":
            ybError_code = 22;
            Break;
        Case "Process 2 Tool3 Start Error":
            ybError_code = 23;
            Break;
        Case "Process 3 Error":
            ybError_code = 30;
            Break;
        Case "Process 3 Tool1 Start Error":
            ybError_code = 31;
            Break;
        Case "Process 3 Tool2 Start Error":
            ybError_code = 32;
            Break;
        Case "Process 3 Tool3 Start Error":
            ybError_code = 33;
            Break;
        Case "Process 4 Error":
            ybError_code = 40;
            Break;
        Case "Process 4 Tool1 Start Error":
            ybError_code = 41;
            Break;
        Case "Process 4 Tool2 Start Error":
            ybError_code = 42;
            Break;
        Case "Process 4 Tool3 Start Error":
            ybError_code = 43;
            Break;
        Case "Process 5 Error":
            ybError_code = 50;
            Break;
        Case "Process 5 Tool1 Start Error":
            ybError_code = 51;
            Break;
        Case "Process 5 Tool2 Start Error":
            ybError_code = 52;
            Break;
        Case "Process 5 Tool3 Start Error":
            ybError_code = 53;
            Break;
        Case "Process 6 Error":
            ybError_code = 70;
            Break;
        Case "Process 6 Tool1 Start Error":
            ybError_code = 71;
            Break;
        Case "Process 6 Tool2 Start Error":
            ybError_code = 72;
            Break;
        Case "Process 6 Tool3 Start Error":
            ybError_code = 73;
            Break;
        Case "Process 7 Error":
            ybError_code = 70;
            Break;
        Case "Process 7 Tool1 Start Error":
            ybError_code = 71;
            Break;
        Case "Process 7 Tool2 Start Error":
            ybError_code = 72;
            Break;
        Case "Process 7 Tool3 Start Error":
            ybError_code = 73;
            Break;
        Case "Process 8 Error":
            ybError_code = 80;
            Break;
        Case "Process 8 Tool1 Start Error":
            ybError_code = 81;
            Break;
        Case "Process 8 Tool2 Start Error":
            ybError_code = 82;
            Break;
        Case "Process 8 Tool3 Start Error":
            ybError_code = 83;
            Break;
        Case "Process 9 Error":
            ybError_code = 90;
            Break;
        Case "Process 9 Tool1 Start Error":
            ybError_code = 91;
            Break;
        Case "Process 9 Tool2 Start Error":
            ybError_code = 92;
            Break;
        Case "Process 9 Tool3 Start Error":
            ybError_code = 93;
            Break;
        Case "Process 10 Error":
            ybError_code = 100;
            Break;
        Case "Process 10 Tool1 Start Error":
            ybError_code = 101;
            Break;
        Case "Process 10 Tool2 Start Error":
            ybError_code = 102;
            Break;
        Case "Process 10 Tool3 Start Error":
            ybError_code = 103;
            Break;
        Case "Process 11 Error":
            ybError_code = 110;
            Break;
        Case "Process 11 Tool1 Start Error":
            ybError_code = 111;
            Break;
        Case "Process 11 Tool2 Start Error":
            ybError_code = 112;
            Break;
        Case "Process 11 Tool3 Start Error":
            ybError_code = 113;
            Break;
        Case "Process 12 Error":
            ybError_code = 120;
            Break;
        Case "Process 12 Tool1 Start Error":
            ybError_code = 121;
            Break;
        Case "Process 12 Tool2 Start Error":
            ybError_code = 122;
            Break;
        Case "Process 12 Tool3 Start Error":
            ybError_code = 123;
            Break;
        Case "Process 13 Error":
            ybError_code = 130;
            Break;
        Case "Process 13 Tool1 Start Error":
            ybError_code = 131;
            Break;
        Case "Process 13 Tool2 Start Error":
            ybError_code = 132;
            Break;
        Case "Process 13 Tool3 Start Error":
            ybError_code = 133;
            Break;
        Case "Process 14 Error":
            ybError_code = 140;
            Break;
        Case "Process 14 Tool1 Start Error":
            ybError_code = 141;
            Break;
        Case "Process 14 Tool2 Start Error":
            ybError_code = 142;
            Break;
        Case "Process 14 Tool3 Start Error":
            ybError_code = 143;
            Break;
        Case "Process 15 Error":
            ybError_code = 150;
            Break;
        Case "Process 15 Tool1 Start Error":
            ybError_code = 151;
            Break;
        Case "Process 15 Tool2 Start Error":
            ybError_code = 152;
            Break;
        Case "Process 15 Tool3 Start Error":
            ybError_code = 153;
            Break;
        Case "Process 16 Error":
            ybError_code = 160;
            Break;
        Case "Process 16 Tool1 Start Error":
            ybError_code = 161;
            Break;
        Case "Process 16 Tool2 Start Error":
            ybError_code = 162;
            Break;
        Case "Process 16 Tool3 Start Error":
            ybError_code = 163;
            Break;
        Case "Process 17 Error":
            ybError_code = 170;
            Break;
        Case "Process 17 Tool1 Start Error":
            ybError_code = 171;
            Break;
        Case "Process 17 Tool2 Start Error":
            ybError_code = 172;
            Break;
        Case "Process 17 Tool3 Start Error":
            ybError_code = 173;
            Break;
        Case "Process 18 Error":
            ybError_code = 180;
            Break;
        Case "Process 18 Tool1 Start Error":
            ybError_code = 181;
            Break;
        Case "Process 18 Tool2 Start Error":
            ybError_code = 182;
            Break;
        Case "Process 18 Tool3 Start Error":
            ybError_code = 183;
            Break;
        Case "Process 19 Error":
            ybError_code = 190;
            Break;
        Case "Process 19 Tool1 Start Error":
            ybError_code = 191;
            Break;
        Case "Process 19 Tool2 Start Error":
            ybError_code = 192;
            Break;
        Case "Process 19 Tool3 Start Error":
            ybError_code = 193;
            Break;
        Case "Process 20 Error":
            ybError_code = 200;
            Break;
        Case "Process 20 Tool1 Start Error":
            ybError_code = 201;
            Break;
        Case "Process 20 Tool2 Start Error":
            ybError_code = 202;
            Break;
        Case "Process 20 Tool3 Start Error":
            ybError_code = 203;
            Break;
        Default:
            Print "Unknown error";
            ybError_code = 255;
            Break;
    EndSwitch;
EndFunc;
