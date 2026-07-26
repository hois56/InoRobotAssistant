ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2025-11-18 오후 5:39:24"
    RobotName = "IR-R25-178S5-D1NH-INT_01741089"
EndProgramInfo
#================================# 
#  Manual Origin Return                
#================================# 
Func go_manu_home() 
    s08_multi_recipe.set_recipe(B_Cur_recipe);
    B_Bef_process = B_Cur_process;
    B_Cur_process = 0;
    ybCur_process = 0;
    s04_course_move.select();
    R_Cur_pos = 1;
    Home[0],V[30];
    #================================# 
    Set yTool_P1_cap_turn,OFF;
    Set yTool_cup_turn,OFF;
    Set yTool_cap_turn,ON;
    wait xTool_cap_turn == ON; #T1 turn Error 
    Set yTool_cap_turn,OFF;
    #================================# 
EndFunc;
#================================# 
#  Origin Return 
#================================# 
Func go_home() #Program Number 255 
    #Origin Return 
    Set yHoming, ON;
    s08_multi_recipe.set_recipe(B_Cur_recipe);
    If yHome_position 
        # Home Arrived 
        R_Cur_pos = 1;
    EndIf;
    #================================#   
    # If switched to manual mode and not home position 
    If bManu_move And yHMI_JCM_main_Ack == OFF
        s05_error.set_log("Origin Return Error");
        Pause;
    EndIf;
    #================================# 
    Switch R_Cur_pos
    Case 1: # Home position 
        Break;
    #================================# 
    #  P1                            
    #================================# 
    Case 111 To 113: #Move Pre Up pos 
        #Up ->(Stopped)-> Pre Up  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 111;
        Movl Offset(P[110],PR[1]),V[10],Z[1],Tool[1],Wobj[1];
    Case 198: #Move Out Wait pos 
        #Pre Up ->(Stopped)-> Out Wait  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 198;
        Movl P[102],V[10],Z[CP],Tool[1],Wobj[1];
        #================================# 
        Set yTool_P1_cap_turn,OFF;
        Set yTool_cup_turn,OFF;
        Set yTool_cap_turn,ON;
        wait xTool_cap_turn == ON; #T1 turn Error 
        Set yTool_cap_turn,OFF;
        #================================# 
    Case 199: #Move Out Approach pos 
        #Out Wait ->(Stopped)-> Out Approach  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 199;
        Movj P[100],V[10],Z[CP],Tool[1],Wobj[1];
        Break;
    #================================# 
    Case 110: #In Wait ->(Stopped)-> Up 
    Case 197: #Up ->(Stopped)-> In Wait(Error Stop) 
        #Move In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 110;
        Movl P[101],V[10],Z[CP],Tool[1],Wobj[1];
    Case 101: #Move In Wait 
        #Diffrent Process ->(Stop)-> In Wait 
        #Same Process Approach ->(Stop)-> In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 101;
        Movl P[101],V[10],Z[CP],Tool[1],Wobj[1];
        #================================# 
        Set yTool_P1_cap_turn,OFF;
        Set yTool_cup_turn,OFF;
        Set yTool_cap_turn,ON;
        wait xTool_cap_turn == ON; #T1 turn Error 
        Set yTool_cap_turn,OFF;
        #================================# 
    Case 196: #Move In Approach 
        #Same Process In Wait ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 196;
        Movj P[100],V[10],Z[CP],Tool[1],Wobj[1];
    Case 100: #Move In Approach 
        #Diffrent Process ->(Stop)-> In Apporach 
        #Home ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 100;
        Movj P[100],V[10],Z[CP],Tool[1],Wobj[1];
        Break;
    #================================# 
    #  P2                            
    #================================# 
    Case 211 To 213: #Move Up pos 
        #Down ->(Stopped)-> Up  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 211;
        Movl Offset(P[210],PR[1]),V[10],Z[1],Tool[1],Wobj[2];
    Case 298: #Move Out Wait pos 
        #Up ->(Stopped)-> Out Wait  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 298;
        Movl P[202],V[10],Z[CP],Tool[1],Wobj[2];
    Case 299: #Move Out Approach pos 
        #Out Wait ->(Stopped)-> Out Approach  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 299;
        Movj P[200],V[10],Z[CP],Tool[1],Wobj[2];
        Break;
    #================================# 
    Case 210: #In Wait ->(Stopped)-> Up 
    Case 297: #Up ->(Stopped)-> In Wait(Error Stop) 
        #Move In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 210;
        Movl P[201],V[10],Z[CP],Tool[1],Wobj[2];
    Case 201: #Move In Wait 
        #Diffrent Process ->(Stop)-> In Wait 
        #Same Process Approach ->(Stop)-> In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 201;
        Movl P[201],V[10],Z[CP],Tool[1],Wobj[2];
    Case 296: #Move In Approach 
        #Same Process In Wait ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 296;
        Movj P[200],V[10],Z[CP],Tool[1],Wobj[2];
    Case 200: #Move In Approach 
        #Diffrent Process ->(Stop)-> In Apporach 
        #Home ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 200;
        Movj P[200],V[10],Z[CP],Tool[1],Wobj[2];
        Break;
    #================================# 
    #  P3                            
    #================================# 
    Case 311 To 313: #Move Up pos 
        #Down ->(Stopped)-> Up  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 311;
        Movl Offset(P[310],PR[1]),V[10],Z[1],Tool[1],Wobj[3];
    Case 398: #Move Out Wait pos 
        #Up ->(Stopped)-> Out Wait  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 398;
        Movl P[302],V[10],Z[CP],Tool[1],Wobj[3];
    Case 399: #Move Out Approach pos 
        #Out Wait ->(Stopped)-> Out Approach  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 399;
        Movj P[300],V[10],Z[CP],Tool[1],Wobj[3];
        Break;
    #================================# 
    Case 310: #In Wait ->(Stopped)-> Up 
    Case 397: #Up ->(Stopped)-> In Wait(Error Stop) 
        #Move In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 310;
        Movl P[301],V[10],Z[CP],Tool[1],Wobj[3];
    Case 301: #Move In Wait 
        #Diffrent Process ->(Stop)-> In Wait 
        #Same Process Approach ->(Stop)-> In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 301;
        Movl P[301],V[10],Z[CP],Tool[1],Wobj[3];
    Case 396: #Move In Approach 
        #Same Process In Wait ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 396;
        Movj P[300],V[10],Z[CP],Tool[1],Wobj[3];
    Case 300: #Move In Approach 
        #Diffrent Process ->(Stop)-> In Apporach 
        #Home ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 300;
        Movj P[300],V[10],Z[CP],Tool[1],Wobj[3];
        Break;
    #================================# 
    #  P4                            
    #================================# 
    Case 411 To 413: #Move Up pos 
        #Down ->(Stopped)-> Up  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 411;
        Movl Offset(P[410],PR[1]),V[10],Z[1],Tool[1],Wobj[4];
    Case 498: #Move Out Wait pos 
        #Up ->(Stopped)-> Out Wait  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 498;
        Movl P[402],V[10],Z[CP],Tool[1],Wobj[4];
    Case 499: #Move Out Approach pos 
        #Out Wait ->(Stopped)-> Out Approach  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 499;
        Movj P[400],V[10],Z[CP],Tool[1],Wobj[4];
        Break;
    #================================# 
    Case 410: #In Wait ->(Stopped)-> Up 
    Case 497: #Up ->(Stopped)-> In Wait(Error Stop) 
        #Move In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 410;
        Movl P[401],V[10],Z[CP],Tool[1],Wobj[4];
    Case 401: #Move In Wait 
        #Diffrent Process ->(Stop)-> In Wait 
        #Same Process Approach ->(Stop)-> In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 401;
        Movl P[401],V[10],Z[CP],Tool[1],Wobj[4];
    Case 496: #Move In Approach 
        #Same Process In Wait ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 496;
        Movj P[400],V[10],Z[CP],Tool[1],Wobj[4];
    Case 400: #Move In Approach 
        #Diffrent Process ->(Stop)-> In Apporach 
        #Home ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 400;
        Movj P[400],V[10],Z[CP],Tool[1],Wobj[4];
        Break;
    #================================# 
    #  P5                            
    #================================# 
    Case 521 To 523: #Move Up pos 
        #Down ->(Stopped)-> Up  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 521;
        Movl Offset(P[520],PR[1]),V[10],Z[0],Tool[1],Wobj[5];
    Case 511 To 513: #Move Pre Up pos 
        #Up ->(Stopped)-> Pre Up  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 511;
        Movl Offset(P[510],PR[1]),V[10],Z[1],Tool[1],Wobj[5];
    Case 598: #Move Out Wait pos 
        #Pre Up ->(Stopped)-> Out Wait  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 598;
        Movl P[502],V[10],Z[CP],Tool[1],Wobj[5];
    Case 599: #Move Out Approach pos 
        #Out Wait ->(Stopped)-> Out Approach  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 599;
        Movj P[500],V[10],Z[CP],Tool[1],Wobj[5];
        Break;
    #================================# 
    Case 510: #In Wait ->(Stopped)-> Up 
    Case 597: #Up ->(Stopped)-> In Wait(Error Stop) 
        #Move In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 510;
        Movl P[501],V[10],Z[CP],Tool[1],Wobj[5];
    Case 501: #Move In Wait 
        #Diffrent Process ->(Stop)-> In Wait 
        #Same Process Approach ->(Stop)-> In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 501;
        Movl P[501],V[10],Z[CP],Tool[1],Wobj[5];
    Case 596: #Move In Approach 
        #Same Process In Wait ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 596;
        Movj P[500],V[10],Z[CP],Tool[1],Wobj[5];
    Case 500: #Move In Approach 
        #Diffrent Process ->(Stop)-> In Apporach 
        #Home ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 500;
        Movj P[500],V[10],Z[CP],Tool[1],Wobj[5];
        Break;
    #================================# 
    #  P6                            
    #================================# 
    Case 611 To 613: #Move Up pos 
        #Down ->(Stopped)-> Up  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 611;
        Movl Offset(P[610],PR[1]),V[10],Z[1],Tool[1],wobj[6];
    Case 698: #Move Out Wait pos 
        #Up ->(Stopped)-> Out Wait  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 698;
        Movl P[602],V[10],Z[CP],Tool[1],wobj[6];
    Case 699: #Move Out Approach pos 
        #Out Wait ->(Stopped)-> Out Approach  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 699;
        Movj P[600],V[10],Z[CP],Tool[1],wobj[6];
        Break;
    #================================# 
    Case 610: #In Wait ->(Stopped)-> Up 
    Case 697: #Up ->(Stopped)-> In Wait(Error Stop) 
        #Move In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 610;
        Movl P[601],V[10],Z[CP],Tool[1],wobj[6];
    Case 601: #Move In Wait 
        #Diffrent Process ->(Stop)-> In Wait 
        #Same Process Approach ->(Stop)-> In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 601;
        Movl P[601],V[10],Z[CP],Tool[1],wobj[6];
    Case 696: #Move In Approach 
        #Same Process In Wait ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 696;
        Movj P[600],V[10],Z[CP],Tool[1],wobj[6];
    Case 600: #Move In Approach 
        #Diffrent Process ->(Stop)-> In Apporach 
        #Home ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 600;
        Movj P[600],V[10],Z[CP],Tool[1],wobj[6];
        Break;
    #================================# 
    #  P7                            
    #================================# 
    Case 711 To 713: #Move Up pos 
        #Down ->(Stopped)-> Up  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 711;
        Movl Offset(P[710],PR[1]),V[10],Z[1],Tool[1],wobj[7];
    Case 798: #Move Out Wait pos 
        #Up ->(Stopped)-> Out Wait  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 798;
        Movl P[702],V[10],Z[CP],Tool[1],wobj[7];
    Case 799: #Move Out Approach pos 
        #Out Wait ->(Stopped)-> Out Approach  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 799;
        Movj P[700],V[10],Z[CP],Tool[1],wobj[7];
        Break;
    #================================# 
    Case 710: #In Wait ->(Stopped)-> Up 
    Case 797: #Up ->(Stopped)-> In Wait(Error Stop) 
        #Move In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 710;
        Movl P[701],V[10],Z[CP],Tool[1],wobj[7];
    Case 701: #Move In Wait 
        #Diffrent Process ->(Stop)-> In Wait 
        #Same Process Approach ->(Stop)-> In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 701;
        Movl P[701],V[10],Z[CP],Tool[1],wobj[7];
    Case 796: #Move In Approach 
        #Same Process In Wait ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 796;
        Movj P[700],V[10],Z[CP],Tool[1],wobj[7];
    Case 700: #Move In Approach 
        #Diffrent Process ->(Stop)-> In Apporach 
        #Home ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 700;
        Movj P[700],V[10],Z[CP],Tool[1],wobj[7];
        Break;
    #================================# 
    #  P8                            
    #================================# 
    Case 821 To 823: #Move Up pos 
        #Down ->(Stopped)-> Up  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 821;
        Movl Offset(P[820],PR[1]),V[10],Z[0],Tool[1],wobj[8];
    Case 811 To 813: #Move Pre Up pos 
        #Up ->(Stopped)-> Pre Up  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 811;
        Movl Offset(P[810],PR[1]),V[10],Z[0],Tool[1],wobj[8];
    Case 898: #Move Out Wait pos 
        #Pre Up ->(Stopped)-> Out Wait  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 898;
        Movl P[802],V[10],Z[CP],Tool[1],wobj[8];
    Case 899: #Move Out Approach pos 
        #Out Wait ->(Stopped)-> Out Approach  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 899;
        Movj P[800],V[10],Z[CP],Tool[1],wobj[8];
        Break;
    #================================# 
    Case 810: #In Wait ->(Stopped)-> Up 
    Case 897: #Up ->(Stopped)-> In Wait(Error Stop) 
        #Move In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 810;
        Movl P[801],V[10],Z[CP],Tool[1],wobj[8];
    Case 801: #Move In Wait 
        #Diffrent Process ->(Stop)-> In Wait 
        #Same Process Approach ->(Stop)-> In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 801;
        Movl P[801],V[10],Z[CP],Tool[1],wobj[8];
    Case 896: #Move In Approach 
        #Same Process In Wait ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 896;
        Movj P[800],V[10],Z[CP],Tool[1],wobj[8];
    Case 800: #Move In Approach 
        #Diffrent Process ->(Stop)-> In Apporach 
        #Home ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 800;
        Movj P[800],V[10],Z[CP],Tool[1],wobj[8];
        Break;
    #================================# 
    #  P9                            
    #================================# 
    Case 911 To 913: #Move Up pos 
        #Down ->(Stopped)-> Up  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 911;
        Movl Offset(P[910],PR[1]),V[10],Z[1],Tool[1],wobj[9];
    Case 998: #Move Out Wait pos 
        #Up ->(Stopped)-> Out Wait  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 998;
        Movj P[902],V[10],Z[CP],Tool[1],wobj[9];
    Case 999: #Move Out Approach pos 
        #Out Wait ->(Stopped)-> Out Approach  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 999;
        Movj P[900],V[10],Z[CP],Tool[1],wobj[9];
        Break;
    #================================# 
    Case 910: #In Wait ->(Stopped)-> Up 
    Case 997: #Up ->(Stopped)-> In Wait(Error Stop) 
        #Move In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 910;
        Movj P[901],V[10],Z[CP],Tool[1],wobj[9];
    Case 901: #Move In Wait 
        #Diffrent Process ->(Stop)-> In Wait 
        #Same Process Approach ->(Stop)-> In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 901;
        Movj P[901],V[10],Z[CP],Tool[1],wobj[9];
    Case 996: #Move In Approach 
        #Same Process In Wait ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 996;
        Movj P[900],V[10],Z[CP],Tool[1],wobj[9];
    Case 900: #Move In Approach 
        #Diffrent Process ->(Stop)-> In Apporach 
        #Home ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 900;
        Movj P[900],V[10],Z[CP],Tool[1],wobj[9];
        Break;
    #================================# 
    #  P10                            
    #================================# 
    Case 1011 To 1013: #Move Up pos 
        #Down ->(Stopped)-> Up  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 1011;
        Movl Offset(P[1010],PR[1]),V[10],Z[1],Tool[1],wobj[10];
    Case 1098: #Move Out Wait pos 
        #Up ->(Stopped)-> Out Wait  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 1098;
        Movj P[1002],V[10],Z[CP],Tool[1],wobj[10];
    Case 1099: #Move Out Approach pos 
        #Out Wait ->(Stopped)-> Out Approach  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 1099;
        Movj P[1000],V[10],Z[CP],Tool[1],wobj[10];
        Break;
    #================================# 
    Case 1010: #In Wait ->(Stopped)-> Up 
    Case 1097: #Up ->(Stopped)-> In Wait(Error Stop) 
        #Move In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 1010;
        Movj P[1001],V[10],Z[CP],Tool[1],wobj[10];
    Case 1001: #Move In Wait 
        #Diffrent Process ->(Stop)-> In Wait 
        #Same Process Approach ->(Stop)-> In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 1001;
        Movj P[1001],V[10],Z[CP],Tool[1],wobj[10];
    Case 1096: #Move In Approach 
        #Same Process In Wait ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 1096;
        Movj P[1000],V[10],Z[CP],Tool[1],wobj[10];
    Case 1000: #Move In Approach 
        #Diffrent Process ->(Stop)-> In Apporach 
        #Home ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 1000;
        Movj P[1000],V[10],Z[CP],Tool[1],wobj[10];
        Break;
    #================================# 
    #  P11                            
    #================================# 
    Case 1111 To 1113: #Move Up pos 
        #Down ->(Stopped)-> Up  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 1111;
        Movl Offset(P[1110],PR[1]),V[10],Z[1],Tool[1],wobj[11];
    Case 1198: #Move Out Wait pos 
        #Up ->(Stopped)-> Out Wait  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 1198;
        Movj P[1102],V[10],Z[CP],Tool[1],wobj[11];
    Case 1199: #Move Out Approach pos 
        #Out Wait ->(Stopped)-> Out Approach  
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 1199;
        Movj P[1100],V[10],Z[CP],Tool[1],wobj[11];
        Break;
    #================================# 
    Case 1110: #In Wait ->(Stopped)-> Up 
    Case 1197: #Up ->(Stopped)-> In Wait(Error Stop) 
        #Move In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 1110;
        Movj P[1101],V[10],Z[CP],Tool[1],wobj[11];
    Case 1101: #Move In Wait 
        #Diffrent Process ->(Stop)-> In Wait 
        #Same Process Approach ->(Stop)-> In Wait 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 1101;
        Movj P[1101],V[10],Z[CP],Tool[1],wobj[11];
    Case 1196: #Move In Approach 
        #Same Process In Wait ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 1196;
        Movj P[1100],V[10],Z[CP],Tool[1],wobj[11];
    Case 1100: #Move In Approach 
        #Diffrent Process ->(Stop)-> In Apporach 
        #Home ->(Stop)-> In Approach 
        s08_multi_recipe.set_recipe(B_Cur_recipe);
        R_Cur_pos = 1100;
        Movj P[1100],V[10],Z[CP],Tool[1],wobj[11];
        Break;
    #================================# 
    #  Other Case Error               
    #================================# 
    Default:
        s05_error.set_log("Origin Return Error");
        Pause;
        Break;
    EndSwitch;
    #================================# 
    #  Move Home                      
    #================================# 
    #Home position 
    R_Cur_pos = 1;
    Home[0],V[10];
    ybCur_process = 0;
    B_Cur_process = 0;
    #================================# 
    Set yTool_P1_cap_turn,OFF;
    Set yTool_cup_turn,OFF;
    Set yTool_cap_turn,ON;
    wait xTool_cap_turn == ON; #T1 turn Error 
    Set yTool_cap_turn,OFF;
    Set yHoming, OFF;
    #================================# 
EndFunc;
