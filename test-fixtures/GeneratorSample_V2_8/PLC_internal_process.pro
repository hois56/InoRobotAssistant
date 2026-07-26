ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2025-11-16 오후 7:42:39"
    RobotName = "IR-R25-178S5-D1NH-INT_01741089"
EndProgramInfo
Start;
    Bool start_bit;
    Bool is_pause;
    #================================#
    #  Program start                
    #================================#
    #Program can only be started when program is in reset or pause state.
    If xProg_start And start_bit == OFF And (yReIO_prog_reset_sts Or is_pause)
        xReIO_prog_start = ON;
        start_bit = ON;
        is_pause = OFF;
    EndIf;
    If xProg_start == OFF 
        xReIO_prog_start = OFF;
        start_bit = OFF;
    EndIf;
    #================================#
    #  Program stop                
    #================================#
    If xProg_stop
        xReIO_prog_stop = ON;
        Clear Out[537],4; #Out[537] ~ Out[541]
        Clear Out[542],82; #Out[542] ~ Out[623]
        Clear Out[640],48; #Out[537] ~ Out[687]
    ElseIf xPause
        xReIO_prog_stop = ON;
        is_pause = ON;
    Else
        xReIO_prog_stop = OFF;
    EndIf;
    #================================#
    #  Program reset Output               
    #================================#
    If xProg_reset And yReIO_prog_reset_sts == ON
        yProg_reset_sts = ON;
        is_pause = OFF;
    ElseIf xProg_reset == OFF
        yProg_reset_sts = OFF;
    EndIf;
    #================================#
    #  Current control mode                
    #================================#
    #If Currnet Control mode == 3 is Remote IO control / other TP, API, ECT 
    If ywReIO_cur_control == 3
        Set yRemote_mode_sts,ON;
    Else
        Set yRemote_mode_sts,OFF;
        is_pause = OFF;
    EndIf;
    #================================#
    #  Current mode                
    #================================#
    #If Currnet mode = 2 is Auto mode  
    If ywReIO_cur_mode == 2 #Auto mode 
        Set yManu_mode_sts,OFF;
        Set yAuto_mode_sts,ON;
    Else #Manual mode (1 = Manual, 3 = Teaching Check, 5 = Continuous teching check) 
        Set yAuto_mode_sts,OFF;
        Set yManu_mode_sts,ON;
    EndIf;
    #================================#
    #  Set OR Speed        
    #================================#
    If yRemote_mode_sts
        If ywReIO_cur_speed <> xwReIO_speed_OR
            xwReIO_speed_OR = 1;
        EndIf;
        Int i; 
        For i=0,i<8,Step[1]
            ywSpeed_OR.bit[i] = In[524+i]; 
        EndFor;
        xwReIO_speed_OR = ywSpeed_OR; 
    Else 
        xwReIO_speed_OR = 1;
    EndIf;
    #================================# 
    #   Manual move check        
    #================================# 
    # If moved in manual mode without no home pos, can't run origin return program
    If yManu_mode_sts and yRobot_busy_sts and yHome_position == OFF
        bManu_move = ON;
    ElseIf yHome_position 
        bManu_move = OFF;
    EndIf;
    #================================# 
    #   Forbid / Start comfirm sts output
    #================================# 
    If yReIO_forbid_sts and xMove_lock_all
        Set yMove_lock_all_sts, ON;
    ElseIf yReIO_forbid_sts == OFF and xMove_lock_all and yRemote_mode_sts
        Set yMove_lock_all_sts, ON;
    Else
        Set yMove_lock_all_sts, OFF;
    EndIf;
    If yReIO_startconf_sts and xMove_only_jog
        Set yMove_only_jog_sts, ON;
    Else
        Set yMove_only_jog_sts, OFF;
    EndIf;
End;
