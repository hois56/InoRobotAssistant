ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2025-11-10 오전 5:30:46"
    RobotName = "IR-R25-178S5-D1NH-INT_01741089"
EndProgramInfo
Func receive_socket()
    #Robot act as Client   
    #================================#   
    #  Set up                           
    #================================#   
    Str[14] = "Rev Socket : Define";
    Int Sev_port = 9000;
    String Sev_IP = "192.168.1.1";  
    Int retry_count = 10;
    Int retry_delay = 0.5;#sec
    Int time_out = 10;#sec
    Int int_num = 250; #25 = Integer num = 1000byte   
    Int buf_start_addr = 0; # 0 ~ 1020 byte   
    #================================#   
    #  Open socket                   #   
    #================================#   
    Str[14] = "Rev Socket : Opening";
    L[0]:
    Open Socket(Sev_IP,Sev_port,2,Single,LB[0]);
    If LB[0] == 0
        If LB[1] >= retry_count
            Goto L[999]; #Error    
        EndIf;
        Print "Rev Socket Comm error! Retry count : " + LB[1];
        Incr LB[1];
        Delay T[retry_delay];
        Goto L[0];
    EndIf;
    #================================#   
    #  Receive                       #   
    #================================#   
    Set ySocket_receive_Ack, ON;
    Str[14] = "Rev Socket : Receiveing";
    Get Port[2],T[time_out],IntArrayData, Goto L[999];
    Print "Rev Socket : Data receive comp";
    Int byte_size = GetPortbufInt(2, aiSocket[0], int_num, buf_start_addr);
    Print "Receive comp! Data size :" + byte_size;
    #==================================#   
    #  Type conversion (Int -> Float)  #   
    #==================================#   
    int i;
    Str[14] = "Rev Socket : Type converting (Int -> Float)";
    For i=0,i<=int_num,Step[1]
        afSocket[i] = aiSocket[i] / 10000;
    EndFor;
    Str[14] = "Rev Socket : Type converting is complete";
    Print Str[14];
    #================================#   
    #  Exit                          #   
    #================================#   
    Str[14] = "Receive Socket Exit";
    Set ySocket_receive_Ack,OFF;
    Ret;
    #================================#   
    #  Error                         #   
    #================================#   
    L[999]:
    Str[3] = "Receive Scoket Error";
    Print "Error! :" + Str[14];
    Set ySocket_receive_Ack,OFF;
    Close Socket,2;
EndFunc;
#================================#
#  receive offset data wiht CC-Link or ECAT         
#================================#
Func receive_IO()
    #================================#
    #  Get position X, Y, Z, A       
    #================================#
    D_Offset_X = xwOffset_X.Int / 10000;
    D_Offset_Y = xwOffset_Y.Int / 10000;
    D_Offset_Z = xwOffset_Z.Int / 10000;
    D_Offset_A = xwOffset_A.Int / 10000;
EndFunc;
