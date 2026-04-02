ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2026-04-02 오후 12:51:18"
    RobotName = "IR-R7H-90S5-C2H-INT_01741200"
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
        LP[1] = LP[0];
        ywCur_TCP_speed = D_TCP_speed;
    EndWhile;
End;