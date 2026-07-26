ProgramInfo
    Version = "S4.24"
    VRC = "V4R24"
    Time = "2025-11-18 오후 6:08:40"
    RobotName = "IR-R25-178S5-D1NH-INT_01741089"
EndProgramInfo

Func data_set() #Program Number 1002
    #Course Data from Wait position
    #Before[Wait->App] -> Current[App->Wait] = 0;     
    #Before[Wait->App] -> Current[App->Wait] = 1;     
    #Before[Wait]      -> Current[App->Wait] = 2;     
    #Before[Wait]      -> Current[Wait] = 3;     
    #abyCourse_from_wait[Before Pos][Current Pos]
    #================================#
    L[0]: #Same Process Course 
    abyCourse_from_wait[0][0] = 0;  #Home -> Home
    abyCourse_from_wait[1][1] = 0;
    abyCourse_from_wait[2][2] = 0;
    abyCourse_from_wait[3][3] = 0;
    abyCourse_from_wait[4][4] = 0;
    abyCourse_from_wait[5][5] = 0;
    abyCourse_from_wait[6][6] = 0;
    abyCourse_from_wait[7][7] = 0;
    abyCourse_from_wait[8][8] = 0;
    abyCourse_from_wait[9][9] = 0;
    abyCourse_from_wait[10][10] = 0;
    abyCourse_from_wait[11][11] = 0;
    abyCourse_from_wait[12][12] = 0;
    abyCourse_from_wait[13][13] = 0;
    abyCourse_from_wait[14][14] = 0;
    abyCourse_from_wait[15][15] = 0;
    abyCourse_from_wait[16][16] = 0;
    abyCourse_from_wait[17][17] = 0;
    abyCourse_from_wait[18][18] = 0;
    abyCourse_from_wait[19][19] = 0;
    abyCourse_from_wait[20][20] = 0;
    #================================#
    L[1]: #Process 1 Course
    abyCourse_from_wait[1][0] = 0; #P1 -> Home
    abyCourse_from_wait[1][2] = 0;
    abyCourse_from_wait[1][3] = 0;
    abyCourse_from_wait[1][4] = 0;
    abyCourse_from_wait[1][5] = 0;
    abyCourse_from_wait[1][6] = 0;
    abyCourse_from_wait[1][7] = 0;
    abyCourse_from_wait[1][8] = 0;
    abyCourse_from_wait[1][9] = 0;
    abyCourse_from_wait[1][10] = 0;
    abyCourse_from_wait[1][11] = 0;
    abyCourse_from_wait[1][12] = 0;
    abyCourse_from_wait[1][13] = 0;
    abyCourse_from_wait[1][14] = 0;
    abyCourse_from_wait[1][15] = 0;
    abyCourse_from_wait[1][16] = 0;
    abyCourse_from_wait[1][17] = 0;
    abyCourse_from_wait[1][18] = 0;
    abyCourse_from_wait[1][19] = 0;
    abyCourse_from_wait[1][20] = 0;  
    #================================#
    L[2]: #Process 2 Course
    abyCourse_from_wait[2][0] = 0; #P2 -> Home
    abyCourse_from_wait[2][1] = 0;
    abyCourse_from_wait[2][3] = 0;
    abyCourse_from_wait[2][4] = 0;
    abyCourse_from_wait[2][5] = 0;
    abyCourse_from_wait[2][6] = 0;
    abyCourse_from_wait[2][7] = 0;
    abyCourse_from_wait[2][8] = 0;
    abyCourse_from_wait[2][9] = 0;
    abyCourse_from_wait[2][10] = 0;
    abyCourse_from_wait[2][11] = 0;
    abyCourse_from_wait[2][12] = 0;
    abyCourse_from_wait[2][13] = 0;
    abyCourse_from_wait[2][14] = 0;
    abyCourse_from_wait[2][15] = 0;
    abyCourse_from_wait[2][16] = 0;
    abyCourse_from_wait[2][17] = 0;
    abyCourse_from_wait[2][18] = 0;
    abyCourse_from_wait[2][19] = 0;
    abyCourse_from_wait[2][20] = 0;
    #================================#
    L[3]: #Process 3 Course
    abyCourse_from_wait[3][0] = 0; #P3 -> Home
    abyCourse_from_wait[3][1] = 0;
    abyCourse_from_wait[3][3] = 0;
    abyCourse_from_wait[3][4] = 0;
    abyCourse_from_wait[3][5] = 0;
    abyCourse_from_wait[3][6] = 0;
    abyCourse_from_wait[3][7] = 0;
    abyCourse_from_wait[3][8] = 0;
    abyCourse_from_wait[3][9] = 0;
    abyCourse_from_wait[3][10] = 0;
    abyCourse_from_wait[3][11] = 0;
    abyCourse_from_wait[3][12] = 0;
    abyCourse_from_wait[3][13] = 0;
    abyCourse_from_wait[3][14] = 0;
    abyCourse_from_wait[3][15] = 0;
    abyCourse_from_wait[3][16] = 0;
    abyCourse_from_wait[3][17] = 0;
    abyCourse_from_wait[3][18] = 0;
    abyCourse_from_wait[3][19] = 0;
    abyCourse_from_wait[3][20] = 0;
    #================================#
    L[4]: #Process 4 Course
    abyCourse_from_wait[4][0] = 0; #P4 -> Home
    abyCourse_from_wait[4][1] = 0;
    abyCourse_from_wait[4][2] = 0;
    abyCourse_from_wait[4][3] = 0;
    abyCourse_from_wait[4][5] = 0;
    abyCourse_from_wait[4][6] = 0;
    abyCourse_from_wait[4][7] = 0;
    abyCourse_from_wait[4][8] = 0;
    abyCourse_from_wait[4][9] = 0;
    abyCourse_from_wait[4][10] = 0;
    abyCourse_from_wait[4][11] = 0;
    abyCourse_from_wait[4][12] = 0;
    abyCourse_from_wait[4][13] = 0;
    abyCourse_from_wait[4][14] = 0;
    abyCourse_from_wait[4][15] = 0;
    abyCourse_from_wait[4][16] = 0;
    abyCourse_from_wait[4][17] = 0;
    abyCourse_from_wait[4][18] = 0;
    abyCourse_from_wait[4][19] = 0;
    abyCourse_from_wait[4][20] = 0;
    #================================#
    L[5]: #Process 5 Course
    abyCourse_from_wait[5][0] = 0; #P5 -> Home
    abyCourse_from_wait[5][1] = 0;
    abyCourse_from_wait[5][2] = 0;
    abyCourse_from_wait[5][3] = 0;
    abyCourse_from_wait[5][4] = 0;
    abyCourse_from_wait[5][6] = 0;
    abyCourse_from_wait[5][7] = 0;
    abyCourse_from_wait[5][8] = 0;
    abyCourse_from_wait[5][9] = 0;
    abyCourse_from_wait[5][10] = 0;
    abyCourse_from_wait[5][11] = 0;
    abyCourse_from_wait[5][12] = 0;
    abyCourse_from_wait[5][13] = 0;
    abyCourse_from_wait[5][14] = 0;
    abyCourse_from_wait[5][15] = 0;
    abyCourse_from_wait[5][16] = 0;
    abyCourse_from_wait[5][17] = 0;
    abyCourse_from_wait[5][18] = 0;
    abyCourse_from_wait[5][19] = 0;
    abyCourse_from_wait[5][20] = 0;
    #================================#
    L[6]: #Process 6 Course
    abyCourse_from_wait[6][0] = 0; #P6 -> Home
    abyCourse_from_wait[6][1] = 0;
    abyCourse_from_wait[6][2] = 0;
    abyCourse_from_wait[6][3] = 0;
    abyCourse_from_wait[6][4] = 0;
    abyCourse_from_wait[6][5] = 0;
    abyCourse_from_wait[6][7] = 0;
    abyCourse_from_wait[6][8] = 0;
    abyCourse_from_wait[6][9] = 0;
    abyCourse_from_wait[6][10] = 0;
    abyCourse_from_wait[6][11] = 0;
    abyCourse_from_wait[6][12] = 0;
    abyCourse_from_wait[6][13] = 0;
    abyCourse_from_wait[6][14] = 0;
    abyCourse_from_wait[6][15] = 0;
    abyCourse_from_wait[6][16] = 0;
    abyCourse_from_wait[6][17] = 0;
    abyCourse_from_wait[6][18] = 0;
    abyCourse_from_wait[6][19] = 0;
    abyCourse_from_wait[6][20] = 0;
    #================================#
    L[7]: #Process 7 Course
    abyCourse_from_wait[7][0] = 0; #P7 -> Home
    abyCourse_from_wait[7][1] = 0;
    abyCourse_from_wait[7][2] = 0;
    abyCourse_from_wait[7][3] = 0;
    abyCourse_from_wait[7][4] = 0;
    abyCourse_from_wait[7][5] = 0;
    abyCourse_from_wait[7][6] = 3;
    abyCourse_from_wait[7][8] = 0;
    abyCourse_from_wait[7][9] = 0;
    abyCourse_from_wait[7][10] = 0;
    abyCourse_from_wait[7][11] = 0;
    abyCourse_from_wait[7][12] = 0;
    abyCourse_from_wait[7][13] = 0;
    abyCourse_from_wait[7][14] = 0;
    abyCourse_from_wait[7][15] = 0;
    abyCourse_from_wait[7][16] = 0;
    abyCourse_from_wait[7][17] = 0;
    abyCourse_from_wait[7][18] = 0;
    abyCourse_from_wait[7][19] = 0;
    abyCourse_from_wait[7][20] = 0;
    #================================#
    L[8]: #Process 8 Course
    abyCourse_from_wait[8][0] = 0; #P8 -> Home
    abyCourse_from_wait[8][1] = 0;
    abyCourse_from_wait[8][2] = 0;
    abyCourse_from_wait[8][3] = 0;
    abyCourse_from_wait[8][4] = 0;
    abyCourse_from_wait[8][5] = 0;
    abyCourse_from_wait[8][6] = 0;
    abyCourse_from_wait[8][7] = 0;
    abyCourse_from_wait[8][9] = 0;
    abyCourse_from_wait[8][10] = 0;
    abyCourse_from_wait[8][11] = 0;
    abyCourse_from_wait[8][12] = 0;
    abyCourse_from_wait[8][13] = 0;
    abyCourse_from_wait[8][14] = 0;
    abyCourse_from_wait[8][15] = 0;
    abyCourse_from_wait[8][16] = 0;
    abyCourse_from_wait[8][17] = 0;
    abyCourse_from_wait[8][18] = 0;
    abyCourse_from_wait[8][19] = 0;
    abyCourse_from_wait[8][20] = 0;
    #================================#
    L[9]: #Process 9 Course
    abyCourse_from_wait[9][0] = 0; #P9 -> Home
    abyCourse_from_wait[9][1] = 0;
    abyCourse_from_wait[9][2] = 0;
    abyCourse_from_wait[9][3] = 0;
    abyCourse_from_wait[9][4] = 0;
    abyCourse_from_wait[9][5] = 0;
    abyCourse_from_wait[9][6] = 0;
    abyCourse_from_wait[9][7] = 0;
    abyCourse_from_wait[9][8] = 0;
    abyCourse_from_wait[9][10] = 0;
    abyCourse_from_wait[9][11] = 0;
    abyCourse_from_wait[9][12] = 0;
    abyCourse_from_wait[9][13] = 0;
    abyCourse_from_wait[9][14] = 0;
    abyCourse_from_wait[9][15] = 0;
    abyCourse_from_wait[9][16] = 0;
    abyCourse_from_wait[9][17] = 0;
    abyCourse_from_wait[9][18] = 0;
    abyCourse_from_wait[9][19] = 0;
    abyCourse_from_wait[9][20] = 0;
    #================================#
    L[10]: #Process 10 Course
    abyCourse_from_wait[10][0] = 0; #P10 -> Home
    abyCourse_from_wait[10][1] = 0;
    abyCourse_from_wait[10][2] = 0;
    abyCourse_from_wait[10][3] = 0;
    abyCourse_from_wait[10][4] = 0;
    abyCourse_from_wait[10][5] = 0;
    abyCourse_from_wait[10][6] = 0;
    abyCourse_from_wait[10][7] = 0;
    abyCourse_from_wait[10][8] = 0;
    abyCourse_from_wait[10][9] = 0;
    abyCourse_from_wait[10][11] = 0;
    abyCourse_from_wait[10][12] = 0;
    abyCourse_from_wait[10][13] = 0;
    abyCourse_from_wait[10][14] = 0;
    abyCourse_from_wait[10][15] = 0;
    abyCourse_from_wait[10][16] = 0;
    abyCourse_from_wait[10][17] = 0;
    abyCourse_from_wait[10][18] = 0;
    abyCourse_from_wait[10][19] = 0;
    abyCourse_from_wait[10][20] = 0;
    #================================#
    L[11]: #Process 11 Course
    abyCourse_from_wait[11][0] = 0; #P11 -> Home
    abyCourse_from_wait[11][1] = 0;
    abyCourse_from_wait[11][2] = 0;
    abyCourse_from_wait[11][3] = 0;
    abyCourse_from_wait[11][4] = 0;
    abyCourse_from_wait[11][5] = 0;
    abyCourse_from_wait[11][6] = 0;
    abyCourse_from_wait[11][7] = 0;
    abyCourse_from_wait[11][8] = 0;
    abyCourse_from_wait[11][9] = 0;
    abyCourse_from_wait[11][10] = 0;
    abyCourse_from_wait[11][12] = 0;
    abyCourse_from_wait[11][13] = 0;
    abyCourse_from_wait[11][14] = 0;
    abyCourse_from_wait[11][15] = 0;
    abyCourse_from_wait[11][16] = 0;
    abyCourse_from_wait[11][17] = 0;
    abyCourse_from_wait[11][18] = 0;
    abyCourse_from_wait[11][19] = 0;
    abyCourse_from_wait[11][20] = 0;
    #================================#
    L[12]: #Process 12 Course
    abyCourse_from_wait[12][0] = 0; #P12 -> Home
    abyCourse_from_wait[12][1] = 0;
    abyCourse_from_wait[12][2] = 0;
    abyCourse_from_wait[12][3] = 0;
    abyCourse_from_wait[12][4] = 0;
    abyCourse_from_wait[12][5] = 0;
    abyCourse_from_wait[12][6] = 0;
    abyCourse_from_wait[12][7] = 0;
    abyCourse_from_wait[12][8] = 0;
    abyCourse_from_wait[12][9] = 0;
    abyCourse_from_wait[12][10] = 0;
    abyCourse_from_wait[12][11] = 0;
    abyCourse_from_wait[12][13] = 0;
    abyCourse_from_wait[12][14] = 0;
    abyCourse_from_wait[12][15] = 0;
    abyCourse_from_wait[12][16] = 0;
    abyCourse_from_wait[12][17] = 0;
    abyCourse_from_wait[12][18] = 0;
    abyCourse_from_wait[12][19] = 0;
    abyCourse_from_wait[12][20] = 0;
    #================================#
    L[13]: #Process 13 Course
    abyCourse_from_wait[13][0] = 0; #P13 -> Home
    abyCourse_from_wait[13][1] = 0;
    abyCourse_from_wait[13][2] = 0;
    abyCourse_from_wait[13][3] = 0;
    abyCourse_from_wait[13][4] = 0;
    abyCourse_from_wait[13][5] = 0;
    abyCourse_from_wait[13][6] = 0;
    abyCourse_from_wait[13][7] = 0;
    abyCourse_from_wait[13][8] = 0;
    abyCourse_from_wait[13][9] = 0;
    abyCourse_from_wait[13][10] = 0;
    abyCourse_from_wait[13][11] = 0;
    abyCourse_from_wait[13][12] = 0;
    abyCourse_from_wait[13][14] = 0;
    abyCourse_from_wait[13][15] = 0;
    abyCourse_from_wait[13][16] = 0;
    abyCourse_from_wait[13][17] = 0;
    abyCourse_from_wait[13][18] = 0;
    abyCourse_from_wait[13][19] = 0;
    abyCourse_from_wait[13][20] = 0;
    #================================#
    L[14]: #Process 14 Course
    abyCourse_from_wait[14][0] = 0; #P14 -> Home
    abyCourse_from_wait[14][1] = 0;
    abyCourse_from_wait[14][2] = 0;
    abyCourse_from_wait[14][3] = 0;
    abyCourse_from_wait[14][4] = 0;
    abyCourse_from_wait[14][5] = 0;
    abyCourse_from_wait[14][6] = 0;
    abyCourse_from_wait[14][7] = 0;
    abyCourse_from_wait[14][8] = 0;
    abyCourse_from_wait[14][9] = 0;
    abyCourse_from_wait[14][10] = 0;
    abyCourse_from_wait[14][11] = 0;
    abyCourse_from_wait[14][12] = 0;
    abyCourse_from_wait[14][13] = 0;
    abyCourse_from_wait[14][15] = 0;
    abyCourse_from_wait[14][16] = 0;
    abyCourse_from_wait[14][17] = 0;
    abyCourse_from_wait[14][18] = 0;
    abyCourse_from_wait[14][19] = 0;
    abyCourse_from_wait[14][20] = 0;
    #================================#
    L[15]: #Process 15 Course
    abyCourse_from_wait[15][0] = 0; #P15 -> Home
    abyCourse_from_wait[15][1] = 0;
    abyCourse_from_wait[15][2] = 0;
    abyCourse_from_wait[15][3] = 0;
    abyCourse_from_wait[15][4] = 0;
    abyCourse_from_wait[15][5] = 0;
    abyCourse_from_wait[15][6] = 0;
    abyCourse_from_wait[15][7] = 0;
    abyCourse_from_wait[15][8] = 0;
    abyCourse_from_wait[15][9] = 0;
    abyCourse_from_wait[15][10] = 0;
    abyCourse_from_wait[15][11] = 0;
    abyCourse_from_wait[15][12] = 0;
    abyCourse_from_wait[15][13] = 0;
    abyCourse_from_wait[15][14] = 0;
    abyCourse_from_wait[15][16] = 0;
    abyCourse_from_wait[15][17] = 0;
    abyCourse_from_wait[15][18] = 0;
    abyCourse_from_wait[15][19] = 0;
    abyCourse_from_wait[15][20] = 0;
    #================================#
    L[16]: #Process 16 Course
    abyCourse_from_wait[16][0] = 0; #P16 -> Home
    abyCourse_from_wait[16][1] = 0;
    abyCourse_from_wait[16][2] = 0;
    abyCourse_from_wait[16][3] = 0;
    abyCourse_from_wait[16][4] = 0;
    abyCourse_from_wait[16][5] = 0;
    abyCourse_from_wait[16][6] = 0;
    abyCourse_from_wait[16][7] = 0;
    abyCourse_from_wait[16][8] = 0;
    abyCourse_from_wait[16][9] = 0;
    abyCourse_from_wait[16][10] = 0;
    abyCourse_from_wait[16][11] = 0;
    abyCourse_from_wait[16][12] = 0;
    abyCourse_from_wait[16][13] = 0;
    abyCourse_from_wait[16][14] = 0;
    abyCourse_from_wait[16][15] = 0;
    abyCourse_from_wait[16][17] = 0;
    abyCourse_from_wait[16][18] = 0;
    abyCourse_from_wait[16][19] = 0;
    abyCourse_from_wait[16][20] = 0;
    #================================#
    L[17]: #Process 17 Course
    abyCourse_from_wait[17][0] = 0; #P17 -> Home
    abyCourse_from_wait[17][1] = 0;
    abyCourse_from_wait[17][2] = 0;
    abyCourse_from_wait[17][3] = 0;
    abyCourse_from_wait[17][4] = 0;
    abyCourse_from_wait[17][5] = 0;
    abyCourse_from_wait[17][6] = 0;
    abyCourse_from_wait[17][7] = 0;
    abyCourse_from_wait[17][8] = 0;
    abyCourse_from_wait[17][9] = 0;
    abyCourse_from_wait[17][10] = 0;
    abyCourse_from_wait[17][11] = 0;
    abyCourse_from_wait[17][12] = 0;
    abyCourse_from_wait[17][13] = 0;
    abyCourse_from_wait[17][14] = 0;
    abyCourse_from_wait[17][15] = 0;
    abyCourse_from_wait[17][16] = 0;
    abyCourse_from_wait[17][18] = 0;
    abyCourse_from_wait[17][19] = 0;
    abyCourse_from_wait[17][20] = 0;
    #================================#
    L[18]: #Process 18 Course
    abyCourse_from_wait[18][0] = 0; #P18 -> Home
    abyCourse_from_wait[18][1] = 0;
    abyCourse_from_wait[18][2] = 0;
    abyCourse_from_wait[18][3] = 0;
    abyCourse_from_wait[18][4] = 0;
    abyCourse_from_wait[18][5] = 0;
    abyCourse_from_wait[18][6] = 0;
    abyCourse_from_wait[18][7] = 0;
    abyCourse_from_wait[18][8] = 0;
    abyCourse_from_wait[18][9] = 0;
    abyCourse_from_wait[18][10] = 0;
    abyCourse_from_wait[18][11] = 0;
    abyCourse_from_wait[18][12] = 0;
    abyCourse_from_wait[18][13] = 0;
    abyCourse_from_wait[18][14] = 0;
    abyCourse_from_wait[18][15] = 0;
    abyCourse_from_wait[18][16] = 0;
    abyCourse_from_wait[18][17] = 0;
    abyCourse_from_wait[18][19] = 0;
    abyCourse_from_wait[18][20] = 0;
    #================================#
    L[19]: #Process 19 Course
    abyCourse_from_wait[19][0] = 0; #P19 -> Home
    abyCourse_from_wait[19][1] = 0;
    abyCourse_from_wait[19][2] = 0;
    abyCourse_from_wait[19][3] = 0;
    abyCourse_from_wait[19][4] = 0;
    abyCourse_from_wait[19][5] = 0;
    abyCourse_from_wait[19][6] = 0;
    abyCourse_from_wait[19][7] = 0;
    abyCourse_from_wait[19][8] = 0;
    abyCourse_from_wait[19][9] = 0;
    abyCourse_from_wait[19][10] = 0;
    abyCourse_from_wait[19][11] = 0;
    abyCourse_from_wait[19][12] = 0;
    abyCourse_from_wait[19][13] = 0;
    abyCourse_from_wait[19][14] = 0;
    abyCourse_from_wait[19][15] = 0;
    abyCourse_from_wait[19][16] = 0;
    abyCourse_from_wait[19][17] = 0;
    abyCourse_from_wait[19][18] = 0;
    abyCourse_from_wait[19][20] = 0;
    #================================#
    L[20]: #Process 20 Course
    abyCourse_from_wait[20][0] = 0; #P20 -> Home
    abyCourse_from_wait[20][1] = 0;
    abyCourse_from_wait[20][2] = 0;
    abyCourse_from_wait[20][3] = 0;
    abyCourse_from_wait[20][4] = 0;
    abyCourse_from_wait[20][5] = 0;
    abyCourse_from_wait[20][6] = 0;
    abyCourse_from_wait[20][7] = 0;
    abyCourse_from_wait[20][8] = 0;
    abyCourse_from_wait[20][9] = 0;
    abyCourse_from_wait[20][10] = 0;
    abyCourse_from_wait[20][11] = 0;
    abyCourse_from_wait[20][12] = 0;
    abyCourse_from_wait[20][13] = 0;
    abyCourse_from_wait[20][14] = 0;
    abyCourse_from_wait[20][15] = 0;
    abyCourse_from_wait[20][16] = 0;
    abyCourse_from_wait[20][17] = 0;
    abyCourse_from_wait[20][18] = 0;
    abyCourse_from_wait[20][19] = 0;
EndFunc;
