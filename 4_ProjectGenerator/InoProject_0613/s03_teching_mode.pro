ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2026-06-14 오후 11:49:21"
    RobotName = "IR-R10-140S5-D1NH-INT_01741041"
EndProgramInfo
Global Int aiP_num[16][30];
Global Int aiMove_type[16][30];
Global Int aiPos_count[16];
Global Int iCur_pos_idx;
#====================================================================================
#  Move Type
#====================================================================================
#    0 = MovJ, Not use Offset
#    1 = MovJ, Use Offset ON
#    2 = MovL, Not use Offset
#    3 = MovL, Use Offset ON
#====================================================================================
#  Teaching Config Init
#====================================================================================
Func Set_path()
    Int i;
    Switch B_Cur_process
        Case 1: # Process 1
            aiPos_count[1] = 4;
            Int P1_pos_num[30] = {100, 101, 110, 111};
            Int P1_move_type[30] = {0, 0, 1, 3};
            For i=0,i<aiPos_count[1],Step[1]
                aiP_num[1][i] = P1_pos_num[i];
                aiMove_type[1][i] = P1_move_type[i];    
            EndFor;
            Break;
        #============================================================================
        Case 2: # Process 2
            aiPos_count[2] = 4;
            Int P2_pos_num[30] = {200, 201, 210, 211};
            Int P2_move_type[30] = {0, 0, 1, 3};
            For i=0,i<aiPos_count[2],Step[1]
                aiP_num[2][i] = P2_pos_num[i];
                aiMove_type[2][i] = P2_move_type[i];    
            EndFor;
            Break;
        #============================================================================
        Case 3: # Process 3
            aiPos_count[3] = 4;
            Int P3_pos_num[30] = {300, 301, 310, 311};
            Int P3_move_type[30] = {0, 0, 1, 3};
            For i=0,i<aiPos_count[3],Step[1]
                aiP_num[3][i] = P3_pos_num[i];
                aiMove_type[3][i] = P3_move_type[i];    
            EndFor;
            Break;
        #============================================================================
        Case 4: # Process 4
            aiPos_count[4] = 4;
            Int P4_pos_num[30] = {400, 401, 410, 411};
            Int P4_move_type[30] = {0, 0, 1, 3};
            For i=0,i<aiPos_count[4],Step[1]
                aiP_num[4][i] = P4_pos_num[i];
                aiMove_type[4][i] = P4_move_type[i];    
            EndFor;
            Break;
        #============================================================================
        Case 5: # Process 5
            aiPos_count[5] = 6;
            Int P5_pos_num[30] = {500, 501, 510, 511, 512, 513};
            Int P5_move_type[30] = {0, 0, 1, 3, 3, 3};
            For i=0,i<aiPos_count[5],Step[1]
                aiP_num[5][i] = P5_pos_num[i];
                aiMove_type[5][i] = P5_move_type[i];    
            EndFor;
            Break;
    EndSwitch;
EndFunc;
#====================================================================================
#  Teaching Mode Start
#====================================================================================
Func Teaching_mode()
    Set yTeach_mode_sts,ON;
    Print "Teaching mode Start. Process : " + B_Cur_process;
    #================================================================================
    #  Set Position data
    #================================================================================
    Set_path();
    #============================================================================
    #  Teaching Loop
    #============================================================================
    iCur_pos_idx = 0;
    Teach_move(); # Go Safe of current process position
    #============================================================================
    While xTeach_mode == ON
        #========================================================================
        #  Move Next
        #========================================================================
        If xTeach_move_next And iCur_pos_idx >= aiPos_count[B_Cur_process] - 1 
            iCur_pos_idx = iCur_pos_idx + 1;
            Teach_move();
            Set yTeach_move_comp, ON;
            Wait xTeach_move_next == OFF or xTeach_mode == OFF;
            Set yTeach_move_comp, OFF;
        #========================================================================
        #  Move Previous
        #========================================================================
        ElseIf xTeach_move_prev And iCur_pos_idx > 0
            iCur_pos_idx = iCur_pos_idx - 1;
            Teach_move();
            Set yTeach_move_comp, ON;
            Wait xTeach_move_prev == OFF or xTeach_mode == OFF;
            Set yTeach_move_comp, OFF;
        #========================================================================
        #  Move Offset
        #========================================================================
        ElseIf xTeach_move_offset
            Teach_move();
            Set yTeach_move_comp, ON;
            Wait xTeach_move_offset == OFF or xTeach_mode == OFF;
            Set yTeach_move_comp, OFF;
        #========================================================================
        #  Save Points
        #========================================================================
        ElseIf xTeach_save And iCur_pos_idx >= 2 #Up, Down pos save
            Int cur_up_pos = B_Cur_process * 100 + 10;
            Int cur_down_pos = B_Cur_process * 100 + 11;
            P[cur_up_pos] = Offset(P[cur_up_pos],PR[5]);
            P[cur_down_pos] = Offset(P[cur_down_pos],PR[5]);
            SavePoints;
            Set yTeach_save_comp, ON;
            Wait xTeach_save == OFF or xTeach_mode == OFF;
            Set yTeach_save_comp, OFF;
        EndIf;
    EndWhile;
    Set yTeach_mode_sts,OFF;
    Print "Teaching mode End";
EndFunc;
#====================================================================================
#  Move Current Step
#====================================================================================
Func Teach_move()
    Int P_num = aiP_num[B_Cur_process][iCur_pos_idx];
    Int move_type = aiMove_type[B_Cur_process][iCur_pos_idx];
    If P_num < 100
        Print "Teach mode Pos num error";
        Alarm[13];
        ret;
    EndIf;
    #============================================================================
    s02_offset.Set_PR();
    R_Cur_pos = P_num;
    #============================================================================
    If move_type == 0 # MovJ, Offset OFF
        Movj P[P_num],V[30],Z[0],Tool[B_Tool],Wobj[B_Wobj];
    #============================================================================
    ElseIf move_type == 1 # MovJ, Offset ON
        Movj Offset(P[P_num], PR[6]),V[30],Z[0],Tool[B_Tool],Wobj[B_Wobj];
    #============================================================================
    ElseIf move_type == 2 # MovL, Offset OFF
        Movl P[P_num],V[30],Z[0],Tool[B_Tool],Wobj[B_Wobj];
    #============================================================================
    ElseIf move_type == 3 # MovL, Offset ON
        Movl Offset(P[P_num], PR[6]),V[30],Z[0],Tool[B_Tool],Wobj[B_Wobj];
    Else 
        Print "Teach mode move type error";
        Alarm[13];
        ret;
    EndIf;
EndFunc;
