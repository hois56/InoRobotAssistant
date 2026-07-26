ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2025-10-20 오전 12:16:52"
    RobotName = "IR-R20-170S5-D1NH-INT_01741002"
EndProgramInfo
Func set_recipe(Int name_idx) #Change recipe  
    Switch name_idx
        Case 0:
            LoadPoints("P.pts");
            Break;
        Case 1:
            LoadPoints("P01.pts");
            Break;
        Case 91:
            LoadPoints("P01.pts");
            Break;
    EndSwitch;
EndFunc;
Func Byte get_recipe()
    String P_name = GetCurPointsFileName();
    Print "Current Point file : " + P_name;
    P_name = StrRePlace(P_name,"P","");
    P_name = StrRePlace(P_name,".pts","");
    Byte P_name_idx = StrToR(P_name);
    Return P_name_idx;
EndFunc ;