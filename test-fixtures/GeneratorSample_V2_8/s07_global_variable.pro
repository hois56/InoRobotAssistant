ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2025-10-25 오전 11:43:02"
    RobotName = "IR-R25-178S5-D1NH-INT_01741089"
EndProgramInfo
#================================# 
#  Internal          
#================================# 
Global Float fGuidance_ver; 
Global Int iYear; 
Global Byte byMonth; 
Global Byte byDay; 
Global Byte byHour; 
Global Byte byMinute; 
Global Bool bManu_move; #If the robot is moved in manual mode and not in home pos.
#================================# 
#  Course          
#================================# 
Global Byte abyCourse_from_wait[21][21]; #프로세스 경로 설정 
#================================# 
#  Socket Send 
#================================# 
Global Bool bSend_socket_start; # Socket, Send robot position 
Global Int iEnd_pos_num; #전송할 End_pos 데이터 갯수가 저장됨 
Global Int aiEnd_pos[256]; #데이터를 소켓 통신으로 송신하기 위해 
#================================# 
#  Socket Receive     
#================================# 
Global Int aiSocket[256]; #소켓 통신 시 정수 데이터로 가공한 데이터 
Global Float afSocket[256]; #소켓 통신 데이터