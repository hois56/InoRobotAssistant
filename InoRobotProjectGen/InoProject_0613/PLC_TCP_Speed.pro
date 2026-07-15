ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2026-06-14 오후 11:49:21"
    RobotName = "IR-R10-140S5-D1NH-INT_01741041"
EndProgramInfo
Start;
    Double TCP_dist;
    LP[0] = GetCurPos();
    #================================================================================
    While True
        Delay T[0.1];
        LP[1] = GetCurPos();
        TCP_dist = Dist(LP[0],LP[1]);
        D_TCP_speed = TCP_dist / 0.1;
        LP[0] = LP[1];
        ywCur_TCP_speed = D_TCP_speed;
    EndWhile;
End;