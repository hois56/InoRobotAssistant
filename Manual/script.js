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
        title: "IR-TS Series User Guide - Manipulator.pdf",
        robotType: "scara",
        category: "hardware",
        date: "2026-03-29",
        lang: "EN",
        path: "Hardware_manual/SCARA/IR-TS Series User Guide - Manipulator.pdf",
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
        description: "API Guide"
    },
    {
        id: "fieldbus_guide",
        title: "Remote IO Control Function User Guide.pdf",
        robotType: "none",
        category: "comm",
        date: "2026-03-29",
        lang: "EN",
        path: "Software_manual/Remote IO Control Function User Guide.pdf",
        description: "Fieldbus Guide"
    },
    {
        id: "remote_io_list",
        title: "Remote_IO_List.xlsx",
        robotType: "none",
        category: "comm",
        date: "2026-04-13",
        lang: "KR",
        path: "Software_manual/Remote_IO_List.xlsx",
        description: "Remote IO Address List"
    },

    // 7. Selection Guides
    {
        id: "sel_guide",
        title: "INOVANCE ROBOT Selection Guide.pdf",
        robotType: "selection",
        category: "selection",
        date: "2026-06-23",
        lang: "EN",
        path: "Selection_manual/INOVANCE ROBOT Selection Guide.pdf",
        description: "Selection Guide"
    },
    {
        id: "sel_leaflet",
        title: "INOVANCE ROBOT Selection Leaflet.pdf",
        robotType: "selection",
        category: "selection",
        date: "2026-06-23",
        lang: "EN",
        path: "Selection_manual/INOVANCE ROBOT Selection Leaflet.pdf",
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
        downloadPath: "https://media.githubusercontent.com/media/hois56/InoRobotAssistant/main/Manual/%EA%B5%90%EC%9C%A1%20%EC%9E%90%EB%A3%8C/%EC%9D%91%EC%9A%A9%EA%B3%BC%EC%A0%95/API.zip",
        description: "Application Level - API"
    },
    // 6-3. For Display Education
    {
        id: "edu_disp_1",
        title: "1.로봇 소개(Display).pdf",
        robotType: "none",
        category: "display",
        date: "2026-04-07",
        lang: "KR",
        isLocked: true,
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
        isLocked: true,
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
        isLocked: true,
        path: "교육 자료/입문과정/Display/3.로봇 구조 및 초기 배선(Display).pdf",
        description: "Education Item"
    }
];

const communicationProfileData = [
    {
        id: "profile_ethercat_ircb501",
        title: "EtherCAT_IRCB501_v1.0.1.xml",
        robotType: "profile",
        category: ["commProfile", "profile-ethercat"],
        date: "2026-06-15",
        lang: "XML",
        path: "Comm_profile/EtherCAT_IRCB501_v1.0.1.xml",
        description: "EtherCAT Communication Profile"
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
    "cert-lifetime": "Lifetime"
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

const certificateData = certificateFiles.map(([category, path]) => ({
    id: `cert_${path.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
    title: path.split('/').pop(),
    robotType: "certificate",
    category: ["certificate", category],
    date: "2026-06-15",
    lang: "PDF",
    path,
    description: certificateCategoryLabels[category] || "Certificate"
}));

manualData.push(...communicationProfileData, ...certificateData);

function getCategories(man) {
    return Array.isArray(man.category) ? man.category : [man.category];
}

function hasCategory(man, category) {
    return getCategories(man).includes(category);
}

function getManualTagLabel(man) {
    const categories = getCategories(man);
    const certificateCategory = categories.find(cat => cat.startsWith('cert-'));

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
    return man.robotType;
}

function init() {
    renderManuals();
    setupFilters();
    setupSearch();
    if(window.lucide) lucide.createIcons();
}

function renderManuals() {
    const list = document.getElementById('manualList');
    list.innerHTML = '';

    const activeTypeBtn = document.querySelector('#typeFilters .active');
    const activeSoftwareBtn = document.querySelector('#catFilters .active');
    const activeEduBtn = document.querySelector('#eduFilters .active');
    const activeProfileBtn = document.querySelector('#profileFilters .active');
    const activeCertBtn = document.querySelector('#certFilters .active');

    const activeType = activeTypeBtn ? activeTypeBtn.dataset.type : 'all';
    const activeSoftware = activeSoftwareBtn ? activeSoftwareBtn.dataset.cat : 'all';
    const activeEdu = activeEduBtn ? activeEduBtn.dataset.cat : 'all';
    const activeProfile = activeProfileBtn ? activeProfileBtn.dataset.cat : 'all';
    const activeCert = activeCertBtn ? activeCertBtn.dataset.cat : 'all';
    
    const searchTerm = document.getElementById('manualSearch').value.toLowerCase();

    const filtered = manualData.filter(man => {
        // Mutual Exclusivity
        if (activeType !== 'all') {
            if (man.robotType !== activeType) return false;
        }

        if (activeSoftware !== 'all') {
            if (!hasCategory(man, activeSoftware)) return false;
        }

        if (activeEdu !== 'all') {
            if (!hasCategory(man, activeEdu)) return false;
        }

        if (activeProfile !== 'all') {
            if (!hasCategory(man, activeProfile)) return false;
        }

        if (activeCert !== 'all') {
            if (!hasCategory(man, activeCert)) return false;
        }

        const matchesSearch = man.title.toLowerCase().includes(searchTerm) ||
                             man.description.toLowerCase().includes(searchTerm) ||
                             man.path.toLowerCase().includes(searchTerm);
        return matchesSearch;
    });

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="py-20 text-center text-slate-500">
                <i data-lucide="file-x" class="w-12 h-12 mx-auto mb-4 opacity-20"></i>
                <p>매뉴얼을 찾을 수 없습니다.</p>
            </div>
        `;
        if(window.lucide) lucide.createIcons();
        return;
    }

    filtered.forEach(man => {
        const item = document.createElement('div');
        item.className = 'manual-item p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center gap-6 group';
        
        let iconColor = "text-emerald-500";
        let bgColor = "group-hover:bg-emerald-500";
        if (hasCategory(man, 'selection')) { iconColor = "text-blue-500"; bgColor = "group-hover:bg-blue-500"; }
        if (hasCategory(man, 'expansion')) { iconColor = "text-cyan-500"; bgColor = "group-hover:bg-cyan-500"; }
        if (hasCategory(man, 'safetyFunction')) { iconColor = "text-red-400"; bgColor = "group-hover:bg-red-500"; }
        if (hasCategory(man, 'comm') || hasCategory(man, 'commProfile')) { iconColor = "text-amber-500"; bgColor = "group-hover:bg-amber-500"; }
        if (hasCategory(man, 'pendant')) { iconColor = "text-indigo-500"; bgColor = "group-hover:bg-indigo-500"; }
        if (hasCategory(man, 'api')) { iconColor = "text-rose-500"; bgColor = "group-hover:bg-rose-500"; }
        if (hasCategory(man, 'entry') || hasCategory(man, 'basic') || hasCategory(man, 'display')) { iconColor = "text-fuchsia-500"; bgColor = "group-hover:bg-fuchsia-500"; }
        if (hasCategory(man, 'advanced')) { iconColor = "text-orange-400"; bgColor = "group-hover:bg-orange-500"; }
        if (hasCategory(man, 'certificate')) { iconColor = "text-violet-500"; bgColor = "group-hover:bg-violet-500"; }

        item.innerHTML = `
            <div class="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center ${iconColor} flex-shrink-0 ${bgColor} group-hover:text-white transition-all">
                <i data-lucide="file-text" class="w-7 h-7"></i>
            </div>
            
            <div class="flex-grow">
                <div class="flex flex-wrap items-center gap-2 mb-2">
                    <div class="flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded-md border border-white/10">
                        <span class="text-[12px] font-bold text-slate-300 font-outfit tracking-tighter">${man.lang}</span>
                    </div>
                    <span class="text-[12px] font-bold text-slate-500 bg-white/5 px-2.5 py-1 rounded border border-white/5 font-outfit capitalize">
                        ${getManualTagLabel(man)}
                    </span>
                    <span class="text-[11px] text-slate-600 ml-1 opacity-70">${man.date}</span>
                </div>
                <h3 class="text-lg font-bold text-white mb-1 group-hover:text-white transition-colors" style="word-break: break-all;">${man.title}</h3>
            </div>
            
            <div class="flex items-center gap-2 pt-4 md:pt-0 shrink-0 w-full md:w-auto">
                <div class="flex gap-2 ml-auto">
                    <button onclick="handleView('${man.id}')"
                            class="px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 min-w-[100px] justify-center ${man.isLocked ? 'locked-btn' : 'view-btn'}">
                        <i data-lucide="eye" class="w-3.5 h-3.5"></i> 미리보기
                    </button>
                    <button onclick="handleDownload('${man.id}')"
                            class="px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 min-w-[100px] justify-center ${man.isLocked ? 'locked-btn' : 'download-btn'}">
                        <i data-lucide="download" class="w-3.5 h-3.5"></i> 다운로드
                    </button>
                </div>
            </div>
        `;
        list.appendChild(item);
    });

    if(window.lucide) lucide.createIcons();
}

function setupFilters() {
    const btns = document.querySelectorAll('.filter-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const parent = btn.parentElement;
            parent.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const groupIds = ['typeFilters', 'catFilters', 'eduFilters', 'profileFilters', 'certFilters'];
            groupIds.forEach(gid => {
                if (gid !== parent.id) {
                    const group = document.getElementById(gid);
                    if (group) {
                        group.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                        const allBtn = group.querySelector('[data-type="all"]') || group.querySelector('[data-cat="all"]');
                        if (allBtn) allBtn.classList.add('active');
                    }
                }
            });

            renderManuals();
        });
    });
}

function setupSearch() {
    const input = document.getElementById('manualSearch');
    input.addEventListener('input', renderManuals);
}

// Cloudflare Worker URL
const WORKER_URL = 'https://ino-robot-display-auth.hois56.workers.dev/';

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

async function handleView(id) {
    const man = manualData.find(m => m.id === id);
    if (!man) return;

    if (man.isLocked) {
        const password = prompt("[보안 안내] 이 자료는 열람이 제한되어 있습니다. 비밀번호를 입력해 주세요:");
        if (password === null) return;

        // 팝업 차단 방지: 사용자 제스처 시점에 미리 창 열기
        const win = window.open('', '_blank');

        try {
            const res = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, path: man.path, folder: 'Manual', mode: 'view' })
            });

            const contentType = res.headers.get('Content-Type') || '';

            if (contentType.includes('application/json')) {
                const data = await res.json();
                win.close();
                alert(data.message || "비밀번호가 올바르지 않습니다.");
                return;
            }

            if (!res.ok) {
                win.close();
                alert("파일을 불러오는데 실패했습니다.");
                return;
            }

            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            win.location.href = blobUrl;
        } catch (e) {
            win.close();
            alert("서버 연결에 실패했습니다: " + e.message);
        }
    } else {
        window.open(resolveManualUrl(man.path), '_blank');
    }
}

async function handleDownload(id) {
    const man = manualData.find(m => m.id === id);
    if (!man) return;

    if (man.isLocked) {
        const password = prompt("[보안 안내] 이 자료는 다운로드가 제한되어 있습니다. 비밀번호를 입력해 주세요:");
        if (password === null) return;

        try {
            const res = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, path: man.path, folder: 'Manual' })
            });
            const data = await res.json();

            if (data.ok) {
                downloadFile(data.url);
            } else {
                alert(data.message || "비밀번호가 올바르지 않습니다.");
            }
        } catch {
            alert("서버 연결에 실패했습니다.");
        }
    } else {
        const path = man.downloadPath || man.path;
        downloadFile(resolveManualUrl(path), getFileName(path));
    }
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
