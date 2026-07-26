ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2025-11-16 오후 7:42:39"
    RobotName = "IR-R25-178S5-D1NH-INT_01741089"
EndProgramInfo
Include "s00_prog_info.pro";
Include "s01_initial.pro";
Include "s02_origin_return.pro";
Include "s03_course_set.pro";
Include "s04_course_move.pro";
Include "s05_error.pro";
Include "s06_offset.pro";
Include "s07_global_variable.pro";
Include "s08_multi_recipe.pro";
Include "s09_receive.pro";
Include "s10_send.pro";
Include "s60_JCM.pro";
Include "s90_hardware_diagnosis.pro";
Include "sP01_Tray_Get.pro";
Include "sP02_Stage_Put.pro";
Include "sP03_Vision_Calibration.pro";
Start;
    #================================#            
    #  Recipe Change                             
    #================================#            
    s08_multi_recipe.set_recipe(xbRecipe_select); #Set recipe               
    B_Cur_recipe = s08_multi_recipe.get_recipe(); #Get cur recipe                 
    ybCur_recipe = B_Cur_recipe;                  #Output cur recipe to PLC            
    Wait xCur_recipe_OK == ON;                    #Wait recipe OK                 
    ybCur_recipe = 0;                             #Reset cur recipe            
    #================================#            
    #  Initial & Origin Return                   
    #================================#            
    If yHome_position 
        s01_initial.reset();
    Else
        s02_origin_return.go_home();
        s01_initial.reset();
    EndIf;
    #================================#            
    #  Main Loop                                 
    #================================#            
    L[0]:
    If xProcess_select_P1
        sP01_Tray_Get.P1();
    EndIf;
    If xProcess_select_P2
        sP02_Stage_Put.P2();
    EndIf;
    If xProcess_select_P3
        sP03_Vision_Calibration.P3();
    EndIf;
    #================================#            
    #  Other Function                                 
    #================================#            
    If xHMI_pos_check
        s90_hardware_diagnosis.pos_check(); 
    EndIf;
    If xHMI_JCM_main or (yTP_JCM_main and yRemote_mode_sts == OFF)
        s60_JCM.JCM_main(); 
    EndIf;
    Goto L[0];
End;