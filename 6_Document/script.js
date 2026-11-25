const manualData = [
    // 1. SCARA Hardware
    {
        id: "scara_s_guide",
        title: "IR-S4&S7&S10 Series User Guide - Manipulator.pdf",
        robotType: "scara",
        category: "hardware",
        date: "2026-05-14",
        lang: "EN",
        path: "Hardware_manual/SCARA/IR-S4&S7&S10 Series User Guide - Manipulator.pdf",
        description: "User Guide"
    },
    {
        id: "scara_s25_s35_guide",
        title: "IR-S25&S35-INT Series User Guide - Manipulator.pdf",
        robotType: "scara",
        category: "hardware",
        date: "2026-05-14",
        lang: "EN",
        path: "Hardware_manual/SCARA/IR-S25&S35-INT Series User Guide - Manipulator.pdf",
        description: "User Guide"
    },
    {
        id: "scara_s60_gs60_guide",
        title: "IR-S60&GS60 Series User Guide - Mechanical.pdf",
        robotType: "scara",
        category: "hardware",
        date: "2026-05-14",
        lang: "EN",
        path: "Hardware_manual/SCARA/IR-S60&GS60 Series User Guide - Mechanical.pdf",
        description: "User Guide"
    },
    {
        id: "scara_ts_guide",
        title: "IR-TS Series User Guide - Mechanical.pdf",
        robotType: "scara",
        category: "hardware",
        date: "2026-03-29",
        lang: "EN",
        path: "Hardware_manual/SCARA/IR-TS Series User Guide - Mechanical.pdf",
        description: "User Guide"
    },

    // 2. 6-Axis Hardware
    {
        id: "6axis_r4_guide",
        title: "IR-R4&R4H Series User Guide - Manipulator.pdf",
        robotType: "6axis",
        category: "hardware",
        date: "2026-03-29",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R4&R4H Series User Guide - Manipulator.pdf",
        description: "User Guide"
    },
    {
        id: "6axis_r7_guide",
        title: "IR-R7H Series User Guide - Manipulator.PDF",
        robotType: "6axis",
        category: "hardware",
        date: "2026-03-29",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R7H Series User Guide - Manipulator.PDF",
        description: "User Guide"
    },
    {
        id: "6axis_r10_r11_guide",
        title: "IR-R10-110&R10H&R11 Series User Guide - Manipulator.PDF",
        robotType: "6axis",
        category: "hardware",
        date: "2026-03-29",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R10-110&R10H&R11 Series User Guide - Manipulator.PDF",
        description: "User Guide"
    },
    {
        id: "6axis_r10_140_guide",
        title: "IR-R10-140 User Guide - Manipulator.pdf",
        robotType: "6axis",
        category: "hardware",
        date: "2026-03-29",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R10-140 User Guide - Manipulator.pdf",
        description: "User Guide"
    },
    {
        id: "6axis_r15h_r20h_guide",
        title: "IR-R15H&20H Series User Guide - Manipulator.pdf",
        robotType: "6axis",
        category: "hardware",
        date: "2026-05-14",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R15H&20H Series User Guide - Manipulator.pdf",
        description: "User Guide"
    },
    {
        id: "6axis_r25_r16_guide",
        title: "IR-R25&16 Series User Guide - Manipulator.PDF",
        robotType: "6axis",
        category: "hardware",
        date: "2026-04-26",
        lang: "EN",
        path: "Hardware_manual/6-axis/IR-R25&16 Series User Guide - Manipulator.PDF",
        description: "User Guide"
    },

    // 3. Controllers
    {
        id: "ctrl_501_guide",
        title: "IRCB501 User Guide.pdf",
        robotType: "controller",
        category: "hardware",
        date: "2026-03-29",
        lang: "EN",
        path: "Hardware_manual/Controller/IRCB501 User Guide.pdf",
        description: "User Guide"
    },
    {
        id: "ctrl_501_hp_guide",
        title: "IRCB501-High-Protection User Guide.pdf",
        robotType: "controller",
        category: "hardware",
        date: "2026-03-29",
        lang: "EN",
        path: "Hardware_manual/Controller/IRCB501-High-Protection User Guide.pdf",
        description: "User Guide"
    },

    // 4. Expansion Cards
    {
        id: "expansion_input_io_16ch_guide",
        title: "IRCB501 Series 16-Channel Input IO Expansion Card User Guide.pdf",
        robotType: "expansion",
        category: "expansion",
        date: "2026-05-14",
        lang: "EN",
        path: "Hardware_manual/ExpansionCard/IRCB501 Series 16-Channel Input IO Expansion Card User Guide.pdf",
        description: "Expansion Card User Guide"
    },
    {
        id: "expansion_npn_output_io_16ch_guide",
        title: "IRCB501 Series 16-Channel NPN Output IO Expansion Card User Guide.pdf",
        robotType: "expansion",
        category: "expansion",
        date: "2026-05-14",
        lang: "EN",
        path: "Hardware_manual/ExpansionCard/IRCB501 Series 16-Channel NPN Output IO Expansion Card User Guide.pdf",
        description: "Expansion Card User Guide"
    },
    {
        id: "expansion_incremental_encoder_2ch_guide",
        title: "IRCB501 Series 2-Channel Incremental Encoder Expansion Card User Guide.pdf",
        robotType: "expansion",
        category: "expansion",
        date: "2026-05-14",
        lang: "EN",
        path: "Hardware_manual/ExpansionCard/IRCB501 Series 2-Channel Incremental Encoder Expansion Card User Guide.pdf",
        description: "Expansion Card User Guide"
    },
    {
        id: "expansion_functional_safety_guide",
        title: "IRCB501 Series Functional Safety Expansion Card User Guide.pdf",
        robotType: "expansion",
        category: "expansion",
        date: "2026-05-14",
        lang: "EN",
        path: "Hardware_manual/ExpansionCard/IRCB501 Series Functional Safety Expansion Card User Guide.pdf",
        description: "Expansion Card User Guide"
    },
    {
        id: "expansion_ir_link_guide",
        title: "IRCB501 Series IR-LINK Expansion Card User Guide.pdf",
        robotType: "expansion",
        category: "expansion",
        date: "2026-05-14",
        lang: "EN",
        path: "Hardware_manual/ExpansionCard/IRCB501 Series IR-LINK Expansion Card User Guide.pdf",
        description: "Expansion Card User Guide"
    },
    {
        id: "expansion_profinet_guide",
        title: "IRCB501 Series PROFINET Expansion Card User Guide.pdf",
        robotType: "expansion",
        category: "expansion",
        date: "2026-05-14",
        lang: "EN",
        path: "Hardware_manual/ExpansionCard/IRCB501 Series PROFINET Expansion Card User Guide.pdf",
        description: "Expansion Card User Guide"
    },

    // 5. Safety Function
    {
        id: "safety_function_guide",
        title: "Robot System Safety Function Guide.PDF",
        robotType: "safetyFunction",
        category: "safetyFunction",
        date: "2026-06-23",
        lang: "EN",
        path: "Hardware_manual/Robot System Safety Function Guide.PDF",
        description: "Safety Function Guide"
    },

    // 6. Software & Operation
    {
        id: "lab_user_guide",
        title: "InoRobotLab User Guide.pdf",
        robotType: "none",
        category: "lab",
        date: "2026-03-29",
        lang: "EN",
        path: "Software_manual/InoRobotLab User Guide.pdf",
        description: "User Guide"
    },
    {
        id: "tp_user_guide",
        title: "Teach Pendant User Manual.pdf",
        robotType: "none",
        category: "pendant",
        date: "2026-03-29",
        lang: "EN",
        path: "Software_manual/Teach Pendant User Manual.pdf",
        description: "User Guide"
    },
    {
        id: "ins_guide",
        title: "Instructions Guide.pdf",
        robotType: "none",
        category: "api",
        date: "2026-03-29",
        lang: "EN",
        path: "Software_manual/Instructions Guide.pdf",
        description: "Instruction Guide"
    },
    {
        id: "api_guide",
        title: "Remote Ethernet Control Function User Guide.pdf",
        robotType: "none",
        category: ["api", "comm"],
        date: "2026-03-29",
        lang: "EN",
        path: "Software_manual/Remote Ethernet Control Function User Guide.pdf",
        description: "API Guide",
        tagLabel: "API"
    },
    {
        id: "fieldbus_guide",
        title: "Remote IO Control Function User Guide.pdf",
        robotType: "none",
        category: "comm",
        date: "2026-03-29",
        lang: "EN",
        path: "Software_manual/Remote IO Control Function User Guide.pdf",
        description: "Fieldbus Guide",
        tagLabel: "Remote IO"
    },
    {
        id: "remote_io_list",
        title: "Remote_IO_List.xlsx",
        robotType: "none",
        category: "comm",
        date: "2026-04-13",
        lang: "KR",
        path: "Software_manual/Remote_IO_List.xlsx",
        previewPath: "Software_manual/Remote_IO_List.html",
        description: "Remote IO Address List",
        tagLabel: "Remote IO"
    },
    {
        id: "communication_setting_guide",
        title: "Communication setting Guide.pdf",
        robotType: "none",
        category: "comm",
        date: "2026-07-15",
        lang: "EN",
        path: "Software_manual/Communication setting Guide.pdf",
        description: "Communication Setting Guide"
    },

    // 7. Selection Guides
    {
        id: "sel_guide",
        title: "INOVANCE ROBOT Selection Guide.pdf",
        robotType: "selection",
        category: "selection",
        date: "2026-06-23",
        lang: "EN",
        path: "Selection_manual/19120306-CY_A04_Inovance Robot Selection Guide_EN 20260603_Web.pdf",
        description: "Selection Guide"
    },
    {
        id: "sel_leaflet",
        title: "INOVANCE ROBOT Selection Leaflet.pdf",
        robotType: "selection",
        category: "selection",
        date: "2026-06-23",
        lang: "EN",
        path: "Selection_manual/19120415-CY_A03_Inovance Robot Selection Leaflet-EN_20260603.pdf",
        description: "Product Leaflet"
    },
    {
        id: "sel_leaflet_display",
        title: "INOVANCE ROBOT Selection Leaflet_Special Robot of Display.pdf",
        robotType: "selection",
        category: "selection",
        date: "2026-03-29",
        lang: "EN",
        path: "Selection_manual/INOVANCE ROBOT Selection Leaflet_Special Robot of Display.pdf",
        description: "Special Robot Leaflet"
    },

    // 8. Education Material
    {
        id: "edu_intro_1",
        title: "1.로봇 소개(INT).pdf",
        robotType: "none",
        category: "entry",
        date: "2026-03-29",
        lang: "KR",
        path: "교육 자료/입문과정/1.로봇 소개(INT).pdf",
        description: "Education Item"
    },
    {
        id: "edu_intro_2",
        title: "2.로봇 기초(INT).pdf",
        robotType: "none",
        category: "entry",
        date: "2026-06-01",
        lang: "KR",
        path: "교육 자료/입문과정/2.로봇 기초(INT).pdf",
        description: "Education Item"
    },
    {
        id: "edu_intro_3",
        title: "3.로봇 구조 및 초기 배선(INT).pdf",
        robotType: "none",
        category: "entry",
        date: "2026-03-29",
        lang: "KR",
        path: "교육 자료/입문과정/3.로봇 구조 및 초기 배선(INT).pdf",
        description: "Education Item"
    },
    {
        id: "edu_intro_4",
        title: "4. 펜던트 기본 조작(INT).pdf",
        robotType: "none",
        category: "entry",
        date: "2026-03-29",
        lang: "KR",
        path: "교육 자료/입문과정/4. 펜던트 기본 조작(INT).pdf",
        description: "Education Item"
    },
    // 6-1. Basic Level Education
    {
        id: "edu_basic_1",
        title: "1. InoRobotLab 소프트웨어(INT).pdf",
        robotType: "none",
        category: "basic",
        date: "2026-04-07",
        lang: "KR",
        path: "교육 자료/초급과정/1. InoRobotLab 소프트웨어(INT).pdf",
        description: "Education Item"
    },
    {
        id: "edu_basic_2",
        title: "2. 프로그램 기초 - 변수.pdf",
        robotType: "none",
        category: "basic",
        date: "2026-04-07",
        lang: "KR",
        path: "교육 자료/초급과정/2. 프로그램 기초 - 변수.pdf",
        description: "Education Item"
    },
    {
        id: "edu_basic_3",
        title: "3. 프로그램 기초 - 주요 명령어.pdf",
        robotType: "none",
        category: "basic",
        date: "2026-04-07",
        lang: "KR",
        path: "교육 자료/초급과정/3. 프로그램 기초 - 주요 명령어.pdf",
        description: "Education Item"
    },
    {
        id: "edu_basic_4",
        title: "4. 주요 설정.pdf",
        robotType: "none",
        category: "basic",
        date: "2026-04-07",
        lang: "KR",
        path: "교육 자료/초급과정/4. 주요 설정.pdf",
        description: "Education Item"
    },
    {
        id: "edu_basic_5",
        title: "6. Socket 통신.pdf",
        robotType: "none",
        category: "basic",
        date: "2026-04-07",
        lang: "KR",
        path: "교육 자료/초급과정/6. Socket 통신.pdf",
        description: "Education Item"
    },
    {
        id: "edu_basic_6",
        title: "7. Fieldbus 통신.pdf",
        robotType: "none",
        category: "basic",
        date: "2026-04-07",
        lang: "KR",
        path: "교육 자료/초급과정/7. Fieldbus 통신.pdf",
        description: "Education Item"
    },
    // 6-2. Application Level Education
    {
        id: "edu_advanced_api",
        title: "API 교육 자료",
        robotType: "none",
        category: "advanced",
        date: "2026-04-10",
        lang: "KR",
        path: "교육 자료/응용과정/API 교육 자료.pdf",
        downloadPath: "https://github.com/hois56/InoRobotAssistant/releases/download/downloads-2026-10-30/API.zip",
        description: "Application Level - API"
    },
    {
        id: "edu_advanced_string_api",
        title: "문자열 API 예제",
        downloadOnly: true,
        robotType: "none",
        category: "advanced",
        date: "2026-11-05",
        lang: "KR",
        path: "https://github.com/hois56/InoRobotAssistant/releases/download/downloads-2026-10-30/String_API_Example.zip",
        description: "Application Level - String API"
    },
    // 6-3. For Display Education
    {
        id: "edu_disp_1",
        title: "1.로봇 소개(Display).pdf",
        robotType: "none",
        category: "display",
        date: "2026-04-07",
        lang: "KR",

        path: "교육 자료/입문과정/Display/1.로봇 소개(Display).pdf",
        description: "Education Item"
    },
    {
        id: "edu_disp_2",
        title: "2.로봇 기초(Display).pdf",
        robotType: "none",
        category: "display",
        date: "2026-06-01",
        lang: "KR",

        path: "교육 자료/입문과정/Display/2.로봇 기초(Display).pdf",
        description: "Education Item"
    },
    {
        id: "edu_disp_3",
        title: "3.로봇 구조 및 초기 배선(Display).pdf",
        robotType: "none",
        category: "display",
        date: "2026-04-07",
        lang: "KR",

        path: "교육 자료/입문과정/Display/3.로봇 구조 및 초기 배선(Display).pdf",
        description: "Education Item"
    }
];

const communicationProfileData = [
    {
        id: "profile_ethercat_ircb501",
        title: "IRCB50X_SERIES_ECAT_V1.05.xml",
        robotType: "profile",
        category: ["commProfile", "profile-ethercat"],
        date: "2026-07-15",
        lang: "XML",
        path: "Comm_profile/IRCB50X_SERIES_ECAT_V1.05.xml",
        description: "EtherCAT Communication Profile"
    },
    {
        id: "profile_ethercat_ircb50x_display",
        title: "IRCB50X_SERIES_ECAT_V1.07.xml",
        robotType: "profile",
        category: ["commProfile", "profile-ethercat"],
        date: "2026-07-15",
        lang: "XML",
        path: "Comm_profile/IRCB50X_SERIES_ECAT_V1.07.xml",
        description: "EtherCAT Communication Profile",
        additionalTag: "For Display"
    },
    {
        id: "profile_profinet_ircb501",
        title: "PROFINET_IRCB501_V2.35(GSDML).xml",
        robotType: "profile",
        category: ["commProfile", "profile-profinet"],
        date: "2026-06-15",
        lang: "XML",
        path: "Comm_profile/PROFINET_IRCB501_V2.35(GSDML).xml",
        description: "PROFINET Communication Profile"
    },
    {
        id: "profile_ethernetip_ircb501",
        title: "EthernetIP_IRCB501_V4.5.EDS",
        robotType: "profile",
        category: ["commProfile", "profile-ethernetip"],
        date: "2026-06-15",
        lang: "EDS",
        path: "Comm_profile/EthernetIP_IRCB501_V4.5.EDS",
        description: "EtherNet/IP Communication Profile"
    }
];

const certificateCategoryLabels = {
    "cert-ce-doc": "CE - DoC",
    "cert-ce-emc": "CE - EMC",
    "cert-ce-md": "CE - MD",
    "cert-clean": "Clean",
    "cert-csgsus": "cSGSus",
    "cert-fcc": "FCC",
    "cert-fs": "Functional Safety",
    "cert-kcs-6axis": "KCs 6-Axis",
    "cert-kcs-6axis-high": "KCs 6-Axis High Protection",
    "cert-kcs-6axis-ip67": "KCs 6-Axis IP67 Option",
    "cert-kcs-6axis-sol": "KCs 6-Axis Sol/VV Option",
    "cert-kcs-scara": "KCs SCARA",
    "cert-kcs-scara-high": "KCs SCARA High Protection",
    "cert-lifetime": "MTBF"
};

const certificateFilterGroups = {
    "cert-ce-doc": "cert-ce",
    "cert-ce-emc": "cert-ce",
    "cert-ce-md": "cert-ce",
    "cert-kcs-6axis": "cert-kc",
    "cert-kcs-6axis-high": "cert-kc",
    "cert-kcs-6axis-ip67": "cert-kc",
    "cert-kcs-6axis-sol": "cert-kc",
    "cert-kcs-scara": "cert-kc",
    "cert-kcs-scara-high": "cert-kc",
    "cert-lifetime": "cert-mtbf"
};

const certificateFiles = [
    ["cert-ce-doc", "Certificate/CE/DoC/DoC_Medium_SCARA&6-axis cabinet.pdf"],
    ["cert-ce-doc", "Certificate/CE/DoC/DoC_Small_SCARA&6-axis cabinet.pdf"],
    ["cert-ce-emc", "Certificate/CE/EMC/EMC_Medium_6-axis cabinet.pdf"],
    ["cert-ce-emc", "Certificate/CE/EMC/EMC_SCARA&Small_6-axis cabinet.pdf"],
    ["cert-ce-md", "Certificate/CE/MD/MD_Ceiling_SCARA.pdf"],
    ["cert-ce-md", "Certificate/CE/MD/MD_Large_SCARA.pdf"],
    ["cert-ce-md", "Certificate/CE/MD/MD_Medium_6-axis.pdf"],
    ["cert-ce-md", "Certificate/CE/MD/MD_Medium_SCARA.pdf"],
    ["cert-ce-md", "Certificate/CE/MD/MD_Small_6-axis.pdf"],
    ["cert-ce-md", "Certificate/CE/MD/MD_Small_SCARA.pdf"],
    ["cert-clean", "Certificate/Clean/IR-R10-110 Cleanliness Class 3 Certification-EN.pdf"],
    ["cert-clean", "Certificate/Clean/IR-R10H Cleanliness Class 3 Certification-EN.pdf"],
    ["cert-clean", "Certificate/Clean/IR-R4H Cleanliness Class 3 Certification-EN.pdf"],
    ["cert-clean", "Certificate/Clean/IR-R7H Cleanliness Class 3 Certification-CN.pdf"],
    ["cert-csgsus", "Certificate/cSGSus/cSGSus_Medium_6-axis.pdf"],
    ["cert-csgsus", "Certificate/cSGSus/cSGSus_SCARA.pdf"],
    ["cert-csgsus", "Certificate/cSGSus/cSGSus_SCARA_4MD cabinet.pdf"],
    ["cert-csgsus", "Certificate/cSGSus/cSGSus_Small_6-axis.pdf"],
    ["cert-fcc", "Certificate/FCC/EMC_Medium_6-axis.pdf"],
    ["cert-fcc", "Certificate/FCC/EMC_SCARA&Small_6-axis.pdf"],
    ["cert-fs", "Certificate/FS/FS_71_220_25_2081.pdf"],
    ["cert-fs", "Certificate/FS/ISO 13849 PL d Cat3_6-axis.pdf"],
    ["cert-kcs-6axis-high", "Certificate/KCs/6-axis/High_protection/IR-R10-110S-INT.pdf"],
    ["cert-kcs-6axis-high", "Certificate/KCs/6-axis/High_protection/IR-R10H-120S-INT.pdf"],
    ["cert-kcs-6axis-high", "Certificate/KCs/6-axis/High_protection/IR-R11-90S-INT.pdf"],
    ["cert-kcs-6axis-high", "Certificate/KCs/6-axis/High_protection/IR-R15H-145S-INT.pdf"],
    ["cert-kcs-6axis-high", "Certificate/KCs/6-axis/High_protection/IR-R20H-120S-INT.pdf"],
    ["cert-kcs-6axis-high", "Certificate/KCs/6-axis/High_protection/IR-R4-56S-INT.pdf"],
    ["cert-kcs-6axis-high", "Certificate/KCs/6-axis/High_protection/IR-R4H-54S-INT.pdf"],
    ["cert-kcs-6axis-high", "Certificate/KCs/6-axis/High_protection/IR-R7H-70S-INT.pdf"],
    ["cert-kcs-6axis-high", "Certificate/KCs/6-axis/High_protection/IR-R7H-90S-INT.pdf"],
    ["cert-kcs-6axis-ip67", "Certificate/KCs/6-axis/IP67_option/IR-R20H-120P-K-INT.pdf"],
    ["cert-kcs-6axis-ip67", "Certificate/KCs/6-axis/IP67_option/IR-R4-56P-INT.pdf"],
    ["cert-kcs-6axis-ip67", "Certificate/KCs/6-axis/IP67_option/IR-R4H-54P-INT.pdf"],
    ["cert-kcs-6axis", "Certificate/KCs/6-axis/IR-R10-110S-INT.pdf"],
    ["cert-kcs-6axis", "Certificate/KCs/6-axis/IR-R10-140S-INT.pdf"],
    ["cert-kcs-6axis", "Certificate/KCs/6-axis/IR-R10H-120S-INT.pdf"],
    ["cert-kcs-6axis", "Certificate/KCs/6-axis/IR-R11-90S-INT.pdf"],
    ["cert-kcs-6axis", "Certificate/KCs/6-axis/IR-R15H-145S-K-INT.pdf"],
    ["cert-kcs-6axis", "Certificate/KCs/6-axis/IR-R16-210S-INT.pdf"],
    ["cert-kcs-6axis", "Certificate/KCs/6-axis/IR-R25-178S-INT.pdf"],
    ["cert-kcs-6axis", "Certificate/KCs/6-axis/IR-R4-56S-INT.pdf"],
    ["cert-kcs-6axis", "Certificate/KCs/6-axis/IR-R4H-54S-INT.pdf"],
    ["cert-kcs-6axis", "Certificate/KCs/6-axis/IR-R7H-70S-INT.pdf"],
    ["cert-kcs-6axis", "Certificate/KCs/6-axis/IR-R7H-90S-INT.pdf"],
    ["cert-kcs-6axis-sol", "Certificate/KCs/6-axis/Sol_VV_option/IR-R10H-120C-KEM2SV-INT.pdf"],
    ["cert-kcs-6axis-sol", "Certificate/KCs/6-axis/Sol_VV_option/IR-R15H-145C-KEM3SV-INT.pdf"],
    ["cert-kcs-6axis-sol", "Certificate/KCs/6-axis/Sol_VV_option/IR-R20H-120C-KEM3SV-INT.pdf"],
    ["cert-kcs-6axis-sol", "Certificate/KCs/6-axis/Sol_VV_option/IR-R4H-54C-KEM2SV-INT.pdf"],
    ["cert-kcs-6axis-sol", "Certificate/KCs/6-axis/Sol_VV_option/IR-R7H-90C-KEM2SV-INT.pdf"],
    ["cert-kcs-scara-high", "Certificate/KCs/SCARA/High_protection/IR-S10-60Z20S-INT.pdf"],
    ["cert-kcs-scara-high", "Certificate/KCs/SCARA/High_protection/IR-S10-60Z20S-INT_2.pdf"],
    ["cert-kcs-scara-high", "Certificate/KCs/SCARA/High_protection/IR-S10-70Z20S-INT.pdf"],
    ["cert-kcs-scara-high", "Certificate/KCs/SCARA/High_protection/IR-S10-70Z20S-INT_2.pdf"],
    ["cert-kcs-scara-high", "Certificate/KCs/SCARA/High_protection/IR-S10-80Z20S-INT.pdf"],
    ["cert-kcs-scara-high", "Certificate/KCs/SCARA/High_protection/IR-S10-80Z20S-INT_2.pdf"],
    ["cert-kcs-scara-high", "Certificate/KCs/SCARA/High_protection/IR-S25-100Z42S-INT.pdf"],
    ["cert-kcs-scara-high", "Certificate/KCs/SCARA/High_protection/IR-S25-80Z42S-INT.pdf"],
    ["cert-kcs-scara-high", "Certificate/KCs/SCARA/High_protection/IR-S35-100Z42S-INT.pdf"],
    ["cert-kcs-scara-high", "Certificate/KCs/SCARA/High_protection/IR-S4-40Z15S-INT.pdf"],
    ["cert-kcs-scara-high", "Certificate/KCs/SCARA/High_protection/IR-S7-50Z20S-INT.pdf"],
    ["cert-kcs-scara-high", "Certificate/KCs/SCARA/High_protection/IR-S7-60Z20S-INT.pdf"],
    ["cert-kcs-scara-high", "Certificate/KCs/SCARA/High_protection/IR-S7-70Z20S-INT.pdf"],
    ["cert-kcs-scara-high", "Certificate/KCs/SCARA/High_protection/IR-TS4-35Z15S-INT.pdf"],
    ["cert-kcs-scara-high", "Certificate/KCs/SCARA/High_protection/IR-TS5-55Z15S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-S10-60Z20S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-S10-70Z20S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-S10-80Z20S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-S20-100Z42S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-S20-80Z42S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-S25-100Z42S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-S25-120Z42S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-S25-80Z42S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-S35-100Z42S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-S35-120Z42S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-S4-40215S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-S7-50Z20S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-S7-60Z20S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-S7-70Z20S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-TS4-35Z15S-INT.pdf"],
    ["cert-kcs-scara", "Certificate/KCs/SCARA/IR-TS5-55Z15S-INT.pdf"],
    ["cert-lifetime", "Certificate/Lifetime/MTBF_Large_6-axis.pdf"],
    ["cert-lifetime", "Certificate/Lifetime/MTBF_Small_SCARA.pdf"]
];

const kcsStandardCategories = new Set(['cert-kcs-6axis', 'cert-kcs-scara']);
const kcsHighProtectionCategories = new Set(['cert-kcs-6axis-high', 'cert-kcs-scara-high']);
function getKcsFileNames(categories) {
    return new Set(certificateFiles
        .filter(([category]) => categories.has(category))
        .map(([, path]) => getFileName(path).toLowerCase()));
}

const kcsStandardFileNames = getKcsFileNames(kcsStandardCategories);
const kcsHighProtectionFileNames = getKcsFileNames(kcsHighProtectionCategories);

function getCertificateDownloadName(category, path) {
    const name = getFileName(path);
    const key = name.toLowerCase();
    if (!kcsStandardFileNames.has(key) || !kcsHighProtectionFileNames.has(key)) return name;
    const variant = kcsStandardCategories.has(category) ? '표준형'
        : kcsHighProtectionCategories.has(category) ? '고방진형' : '';
    return variant ? name.replace(/\.pdf$/i, extension => `_${variant}${extension}`) : name;
}

const certificateData = certificateFiles.map(([category, path]) => ({
    id: `cert_${path.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
    title: path.split('/').pop(),
    robotType: "certificate",
    category: ["certificate", category, certificateFilterGroups[category]].filter(Boolean),
    date: "2026-06-15",
    lang: "PDF",
    path,
    downloadName: getCertificateDownloadName(category, path),
    description: certificateCategoryLabels[category] || "Certificate"
}));

manualData.push(...communicationProfileData, ...certificateData);

function getCategories(man) {
    return Array.isArray(man.category) ? man.category : [man.category];
}

function hasCategory(man, category) {
    return getCategories(man).includes(category);
}

function translateUiText(value) {
    return window.InoRobotI18n ? window.InoRobotI18n.translate(String(value || '')) : String(value || '');
}

const robotTypeLabels = {
    scara: 'SCARA',
    '6axis': '6-Axis',
    controller: 'Controller'
};

const cadGroupLabels = {
    '6axis': '6-Axis',
    scara: 'SCARA',
    controller: 'Controller',
    accessory: 'Accessory'
};

function getManualTagLabel(man) {
    const categories = getCategories(man);
    const certificateCategory = categories.find(cat => cat.startsWith('cert-'));

    if (man.tagLabel) return man.tagLabel;
    if (certificateCategory) return certificateCategoryLabels[certificateCategory] || 'Certificate';
    if (hasCategory(man, 'profile-ethercat')) return 'EtherCAT Profile';
    if (hasCategory(man, 'profile-profinet')) return 'PROFINET Profile';
    if (hasCategory(man, 'profile-ethernetip')) return 'EtherNet/IP Profile';
    if (hasCategory(man, 'entry')) return 'Beginner';
    if (hasCategory(man, 'basic')) return 'Basic';
    if (hasCategory(man, 'advanced')) return 'Application';
    if (hasCategory(man, 'display')) return 'For Display';
    if (man.robotType === 'expansion') return 'Expansion Card';
    if (man.robotType === 'safetyFunction') return 'Safety Function';
    if (man.robotType === 'selection') return 'Selection Guide';
    if (man.robotType === 'none') return 'Common';
    return robotTypeLabels[man.robotType] || man.robotType;
}

function getCadFileKind(fileName) {
    const extension = String(fileName).split('.').pop().toLowerCase();
    if (extension === 'dwg' || extension === 'dxf') return '2D';
    if (extension === 'stp' || extension === 'step') return '3D';
    return extension.toUpperCase();
}

function getCadDownloadType(fileName) {
    const extension = String(fileName).split('.').pop().toLowerCase();
    if (extension === 'dwg' || extension === 'dxf') return '2D';
    if (extension === 'stp' || extension === 'step' || extension === 'obj' || extension === 'mtl') return '3D';
    return null;
}

function createCadDocuments() {
    const source = Array.isArray(window.InoRobotDocumentCadData)
        ? window.InoRobotDocumentCadData
        : [];

    return source.flatMap(entry => (entry.files || []).map(file => ({
        id: `cad_${entry.model}_${file}`.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase(),
        title: file,
        robotType: 'cad',
        cadGroup: entry.group,
        category: ['cad', `cad-${entry.group}`],
        cadModel: entry.model,
        cadVariant: entry.variant || '',
        cadFolder: entry.folder,
        date: '2026-09-13',
        lang: getCadFileKind(file),
        path: `../1_RobotModelSelect/Robot_CAD/${entry.folder}/${file}`,
        description: [entry.model, entry.variant, 'CAD'].filter(Boolean).join(' '),
        tagLabel: 'CAD',
        additionalTag: entry.model
    })));
}

manualData.push(...createCadDocuments());

function getCadGroupKey(man) {
    return `${man.cadFolder || ''}|${man.cadModel || man.additionalTag || ''}|${man.cadVariant || ''}`;
}

// Filter groups in the sidebar. `key` names the selection field, `attribute` is the data-* attribute on its buttons.
const filterGroups = [
    { id: 'cadFilters', attribute: 'cad', key: 'cad' },
    { id: 'typeFilters', attribute: 'type', key: 'type' },
    { id: 'catFilters', attribute: 'cat', key: 'software' },
    { id: 'eduFilters', attribute: 'cat', key: 'edu' },
    { id: 'profileFilters', attribute: 'cat', key: 'profile' },
    { id: 'certFilters', attribute: 'cat', key: 'cert' }
];

// A clicked hardware reset means all hardware manuals, while the initial view still lists every resource.
let selectedFilterGroup = null;

function createEmptySelection() {
    const selection = { search: '', hardwareOnly: false };
    filterGroups.forEach(group => { selection[group.key] = 'all'; });
    return selection;
}

function readSelection() {
    const selection = createEmptySelection();
    filterGroups.forEach(group => {
        const active = document.querySelector(`#${group.id} .active`);
        selection[group.key] = active ? active.dataset[group.attribute] || 'all' : 'all';
    });
    selection.hardwareOnly = selectedFilterGroup === 'typeFilters';
    const input = document.getElementById('manualSearch');
    selection.search = input ? input.value.toLowerCase() : '';
    return selection;
}

// Assign IDs from the catalog itself so new categories and variants are indexed
// without changing the Rust engine. Row order follows the published catalog.
const documentOptions = new Map();
const optionGroups = [];
function optionId(group, key) {
    const name = group + '/' + key;
    if (!documentOptions.has(name)) {
        documentOptions.set(name, optionGroups.length);
        optionGroups.push(group);
    }
    return documentOptions.get(name);
}
let documentCatalog;
function createDocumentCatalog() {
    const documentRows = manualData.map(man => {
        const categories = getCategories(man);
        const ids = [optionId(1, man.robotType)];
        if (man.robotType === 'cad') ids.push(optionId(0, 'cad'), optionId(0, man.cadGroup));
        for (const category of categories) {
            for (let group = 2; group <= 5; group++) ids.push(optionId(group, category));
        }
        if (categories.some(c => ['hardware', 'expansion', 'safetyFunction', 'selection'].includes(c))) {
            ids.push(optionId(6, 'hardware'));
        }
        return ids;
    });
    return InoSite.catalog(optionGroups, 7, documentRows);
}
let searchLocale;
function selectDocuments(selection) {
    documentCatalog ||= createDocumentCatalog();
    const flags = new Uint8Array(optionGroups.length);
    const keys = [[0, selection.cad], [1, selection.type], [2, selection.software],
        [3, selection.edu], [4, selection.profile], [5, selection.cert]];
    if (selection.hardwareOnly) keys.push([6, 'hardware']);
    for (const [group,key] of keys) {
        if (key === 'all') continue;
        const id = documentOptions.get(group + '/' + key);
        if (id === undefined) return [];
        flags[id] = 1;
    }
    const locale = window.InoRobotI18n?.locale || 'ko';
    if (selection.search && searchLocale !== locale) {
        documentCatalog.setSearchFields(manualData.map(man => Array.from(new Set([
            man.title, man.description, man.path, man.additionalTag, translateUiText(man.title),
            translateUiText(man.description), translateUiText(man.additionalTag), translateUiText(man.cadVariant)
        ].map(value => String(value || '').toLowerCase())))));
        searchLocale = locale;
    }
    return Array.from(documentCatalog.select(flags, selection.search).rows, i => manualData[i]);
}

// Insertion order keeps each CAD variant at its first matching file position.
function groupDocuments(documents) {
    const groups = new Map();
    for (const man of documents) {
        const key = hasCategory(man, 'cad') ? getCadGroupKey(man) : man;
        const row = groups.get(key);
        if (row) row.push(man);
        else groups.set(key, [man]);
    }
    return groups;
}

function cloneTemplate(id) {
    const template = document.getElementById(id);
    return template ? template.content.firstElementChild.cloneNode(true) : null;
}

let manualRowSequence = 0;

function createManualRow({ title, code, tag, extra, date }) {
    const row = cloneTemplate('manualRowTemplate');
    const titleId = `manual-title-${manualRowSequence += 1}`;
    const heading = row.querySelector('.manual-title');
    heading.id = titleId;
    heading.textContent = title;
    row.querySelector('[data-slot="code"]').textContent = code;
    row.querySelector('.manual-tag').textContent = tag;

    const extraNode = row.querySelector('.manual-extra');
    if (extra) extraNode.textContent = extra;
    else extraNode.remove();

    const time = row.querySelector('.manual-date');
    time.textContent = date;
    time.dateTime = date;

    // Several rows share the same button labels, so tie each action to its row title.
    row.querySelectorAll('[data-action]').forEach(button => button.setAttribute('aria-describedby', titleId));
    return row;
}

function renderCadModelCard(list, documents) {
    const first = documents[0];
    if (!first) return;

    const row = createManualRow({
        title: first.cadModel,
        code: 'CAD',
        tag: cadGroupLabels[first.cadGroup] || first.cadGroup,
        extra: first.cadVariant,
        date: first.date
    });
    const titleId = row.querySelector('.manual-title').id;
    const actions = row.querySelector('.manual-actions');
    actions.replaceChildren();

    [['2D', '2D 다운로드'], ['3D', '3D 다운로드']].forEach(([kind, label]) => {
        documents.filter(man => getCadDownloadType(man.title) === kind).forEach(man => {
            const button = cloneTemplate('manualCadButtonTemplate');
            button.querySelector('[data-slot="label"]').textContent = label;
            button.setAttribute('aria-describedby', titleId);
            button.title = man.title;
            button.dataset.id = man.id;
            actions.append(button);
        });
    });

    list.appendChild(row);
}

function renderManualDocument(list, man) {
    const row = createManualRow({
        title: man.title,
        code: man.lang,
        tag: getManualTagLabel(man),
        extra: man.additionalTag,
        date: man.date
    });
    if (man.downloadOnly) row.querySelector('[data-action="view"]').remove();
    row.querySelectorAll('[data-action]').forEach(button => { button.dataset.id = man.id; });
    list.appendChild(row);
}

function setupFilterSections() {
    const sections = Array.from(document.querySelectorAll('[data-filter-section]'));
    const setOpen = (section, open) => {
        section.classList.toggle('is-collapsed', !open);
        section.querySelector('.filter-section-toggle')?.setAttribute('aria-expanded', String(open));
    };

    sections.forEach(section => {
        section.querySelector('.filter-section-toggle')?.addEventListener('click', () => {
            setOpen(section, section.classList.contains('is-collapsed'));
        });
    });

    document.getElementById('expandAllFilters')?.addEventListener('click', () => {
        sections.forEach(section => setOpen(section, true));
    });
    document.getElementById('collapseAllFilters')?.addEventListener('click', () => {
        sections.forEach(section => setOpen(section, false));
    });
}

function isResetFilter(button) {
    if (selectedFilterGroup === 'typeFilters' && button.closest('#typeFilters')) return false;
    return (button.dataset.type || button.dataset.cat || button.dataset.cad) === 'all';
}

// Each group keeps its own "all" button active while another group filters, so several buttons carry
// .active at once. Only the real selection is exposed as pressed. Hardware "all" remains a scoped
// selection after a click; the initial unfiltered view highlights only the first group's reset.
function syncFilterState() {
    const buttons = Array.from(document.querySelectorAll('.filter-btn'));
    const isFiltering = buttons.some(button => button.classList.contains('active') && !isResetFilter(button));

    buttons.forEach(button => {
        const active = button.classList.contains('active');
        const quiet = active && isResetFilter(button) && (isFiltering || !button.closest('#typeFilters'));
        button.toggleAttribute('data-quiet', quiet);
        button.setAttribute('aria-pressed', String(active && !quiet));
    });

    // Open a section whose filter is in use so the selection is visible.
    document.querySelectorAll('[data-filter-section]').forEach(section => {
        const inUse = Array.from(section.querySelectorAll('.filter-btn.active')).some(button => !isResetFilter(button));
        if (!inUse || !section.classList.contains('is-collapsed')) return;
        section.classList.remove('is-collapsed');
        section.querySelector('.filter-section-toggle')?.setAttribute('aria-expanded', 'true');
    });
}

function renderFilterCounts() {
    filterGroups.forEach(group => {
        document.querySelectorAll(`#${group.id} .filter-btn`).forEach(button => {
            const value = button.dataset[group.attribute];
            // Leave reset buttons without a count; the result count shows the selected scope.
            if (!value || value === 'all' || button.querySelector('.filter-count')) return;

            const selection = createEmptySelection();
            selection[group.key] = value;
            const count = document.createElement('span');
            count.className = 'filter-count';
            count.textContent = String(groupDocuments(selectDocuments(selection)).size);
            button.append(count);
        });
    });
}

function updateResultCount(rows) {
    const value = document.getElementById('manualCountValue');
    if (value) value.textContent = String(rows);
}

function init() {
    setupFilterSections();
    setupFilters();
    setupSearch();
    setupActions();
    renderFilterCounts();
    renderManuals();
    document.addEventListener('inorobot:languagechange', renderManuals);
    document.addEventListener('inorobot:i18nready', () => {
        if (searchLocale !== undefined) {
            searchLocale = undefined;
            renderManuals();
        }
    });
}

function renderManuals() {
    const list = document.getElementById('manualList');
    list.replaceChildren();

    const selection = readSelection();
    const filtered = selectDocuments(selection);

    if (filtered.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = '매뉴얼을 찾을 수 없습니다.';
        list.appendChild(empty);
        updateResultCount(0);
        syncFilterState();
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const documents of groupDocuments(filtered).values()) {
        if (hasCategory(documents[0], 'cad')) renderCadModelCard(fragment, documents);
        else renderManualDocument(fragment, documents[0]);
    }
    list.appendChild(fragment);
    updateResultCount(list.children.length);
    syncFilterState();
}

function setupFilters() {
    const btns = document.querySelectorAll('.filter-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const parent = btn.parentElement;
            const filterGroup = btn.closest('#certFilters') || parent;
            selectedFilterGroup = filterGroup.id;
            filterGroup.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            filterGroups.forEach(({ id }) => {
                if (id !== filterGroup.id) {
                    const group = document.getElementById(id);
                    if (group) {
                        group.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                        const allBtn = group.querySelector('[data-type="all"]') || group.querySelector('[data-cat="all"]');
                        if (allBtn) allBtn.classList.add('active');
                    }
                }
            });

            renderManuals();
            requestAnimationFrame(scrollToManualList);
        });
    });
}

// Bring the results into view after a filter change, but leave the page alone when they are already visible.
function scrollToManualList() {
    const list = document.getElementById('manualList');
    if (!list) return;

    const rect = list.getBoundingClientRect();
    if (rect.top >= 0 && rect.top <= window.innerHeight * 0.5) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - 24),
        behavior: reduceMotion ? 'auto' : 'smooth'
    });
}

function setupSearch() {
    const input = document.getElementById('manualSearch');
    input.addEventListener('input', renderManuals);
}

function setupActions() {
    const list = document.getElementById('manualList');
    list.addEventListener('click', event => {
        const button = event.target.closest('[data-action]');
        if (!button || !list.contains(button)) return;
        if (button.dataset.action === 'view') handleView(button.dataset.id);
        if (button.dataset.action === 'download') handleDownload(button.dataset.id);
    });
}

function encodeManualPath(path) {
    return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

function getFileName(path) {
    return path.split('/').pop();
}

function resolveManualUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return encodeManualPath(path);
}

function handleView(id) {
    const man = manualData.find(m => m.id === id);
    if (!man || man.downloadOnly) return;
    window.open(resolveManualUrl(man.previewPath || man.path), '_blank');
}

function handleDownload(id) {
    const man = manualData.find(m => m.id === id);
    if (!man) return;
    const path = man.downloadPath || man.path;
    downloadFile(resolveManualUrl(path), man.downloadName || getFileName(path));
}

function downloadFile(url, fileName = '') {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

document.addEventListener('DOMContentLoaded', init);
