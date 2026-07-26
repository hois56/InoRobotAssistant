ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2025-11-10 오전 5:30:46"
    RobotName = "IR-R25-178S5-D1NH-INT_01741089"
EndProgramInfo
Func send_socket()
    #Robot act as Client   
    #================================#   
    #  Set up                           
    #================================#   
    Str[14] = "Send Socket : Define";
    Int Sev_port = 9001;
    String Sev_IP = "193.168.1.1";  
    Int retry_count = 10;
    Int retry_delay = 0.5;#sec
    Int buf_start_addr = 0; # 0 ~ 1030 byte   
    #================================#   
    #  Open socket                   #   
    #================================#   
    Str[14] = "Send Socket : Opening";
    L[0]:
    Open Socket(Sev_IP,Sev_port,3,Single,LB[0]);
    If LB[0] == 0
        If LB[1] >= retry_count
            Goto L[999]; #Error    
            Print "Send Socket Comm error! Retry count : " + LB[1];
        EndIf;
        Incr LB[1];
        Delay T[retry_delay];
        Goto L[0];
    EndIf;
    #================================#   
    #  Set Buffer                    #   
    #================================#   
    Set ySocket_send_Ack, ON;
    Print "ySocket_send_Ack = ON!";
    SetPortBufInt(3, aiEnd_pos[0], iEnd_pos_num, buf_start_addr);
    Str[15] = "Send Socket : Type converting is complete";
    Print "Converting INT data size : " + iEnd_pos_num;
    #================================#   
    #  Send                          #   
    #================================#   
    Str[15] = "Send Socket : Sending";
    Send Port[3],IntArrayData,iEnd_pos_num * 4;
    Print "Socket Send complete!";
    Delay T[0.5];
    #================================#   
    #  Exit                             
    #================================#   
    Str[15] = "Send Socket : Exit";
    Print "ySocket_send_Ack = OFF!";
    Set ySocket_send_Ack,OFF;
    Close Socket,3;
    Ret;
    #================================#   
    #  Error                         #   
    #================================#   
    L[999]:
    Str[3] = "Socker Send Communication Error";
    Print "Error! :" + Str[3];
    Set ySocket_send_Ack,OFF;
    Close Socket,3;
EndFunc;
Func origin_pos_socket()
    #================================#
    #  Set up                        
    #================================#
    int i; #반복문 반복 현재 값
    int j = 0; # aiEnd_pos 배열의 현재 배열 번호
    int pos_num; 
    int pos_num_end; # 반복 마지막 인덱스값 백업
    # 전송할 포인트 번호 입력 (각 프로세스의 T1 Up, Down 위치)
    int pos_idx[50] = {120, 121, 210, 211, 310, 311, 410, 411, 520, 521, 610, 611, 710, 711, 820, 821, 910, 911, 1010, 1011, 1120, 1121} ; 
    #==================================#
    #  Type conversion (Float -> Int)  
    #  Set Send Socket data 
    #==================================#
    #각 프로세스 Up/Down 위치 (소수점 2자리)를 버퍼(aiEnd_pos)에 저장
    pos_num = 22; #22개의 위치 값 송신 
    For i=0,i<pos_num,Step[1]
        aiEnd_pos[j] = P[pos_idx[i]].X * 10000;
        aiEnd_pos[j+1] = P[pos_idx[i]].Y * 10000;
        aiEnd_pos[j+2] = P[pos_idx[i]].Z * 10000;
        aiEnd_pos[j+3] = P[pos_idx[i]].C * 10000;
        aiEnd_pos[j+4] = P[pos_idx[i]].B * 10000;
        aiEnd_pos[j+5] = P[pos_idx[i]].A * 10000;
        j = j + 6;
    EndFor;
#    #== Spare ==========================#
#    pos_num = 9 * 6; #Spare size x 6
#    For i=0,i<pos_num,Step[1]
#        aiEnd_pos[j] = 0;
#    EndFor;
#    #== Z gap ==========================#
#    aiEnd_pos[j] = P[111].Z - P[110].Z;
#    aiEnd_pos[j+1] = P[211].Z - P[210].Z;
#    aiEnd_pos[j+2] = P[311].Z - P[310].Z;
#    aiEnd_pos[j+3] = 0;
#    aiEnd_pos[j+4] = 0;
#    aiEnd_pos[j+5] = 0;
#    aiEnd_pos[j+6] = 0;
#    aiEnd_pos[j+7] = P[811].Z - P[810].Z;
#    aiEnd_pos[j+8] = P[911].Z - P[810].Z;
#    aiEnd_pos[j+9] = P[1011].Z - P[1010].Z;
#    #== Down speed =====================#
#    #R[180] ~ R[189] == P1 ~ P10 Down speed
#    R_P1_down_speed = 500;
#    R_P2_down_speed = 500;
#    R_P3_down_speed = 500;
#    R_P4_down_speed = 0;
#    R_P5_down_speed = 0;
#    R_P6_down_speed = 0;
#    R_P7_down_speed = 0;
#    R_P8_down_speed = 500;
#    R_P9_down_speed = 500;
#    R_P10_down_speed = 500;
#    aiEnd_pos[j] = R_P1_down_speed;
#    aiEnd_pos[j+1] = R_P2_down_speed;
#    aiEnd_pos[j+2] = R_P3_down_speed;
#    aiEnd_pos[j+3] = R_P4_down_speed;
#    aiEnd_pos[j+4] = R_P5_down_speed;
#    aiEnd_pos[j+5] = R_P6_down_speed;
#    aiEnd_pos[j+6] = R_P7_down_speed;
#    aiEnd_pos[j+7] = R_P8_down_speed;
#    aiEnd_pos[j+8] = R_P9_down_speed;
#    aiEnd_pos[j+9] = R_P10_down_speed;
#    j = j + 10;
#    #== last Spare ====================#
#    pos_num = 256 - j;
#    For i=0,i<pos_num,Step[1]
#        aiEnd_pos[j] = 0;
#        j = j + 1;
#    EndFor;
    #== Get Send Data Int num ====================#
    iEnd_pos_num = j - 1; #Subtract last j num
EndFunc;

