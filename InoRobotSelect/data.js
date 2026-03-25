const filtersData = [
    {
        "id": "Type",
        "label": "\ub85c\ubd07 \ud0c0\uc785",
        "options": [
            {
                "id": "6-Axis",
                "label": "6-Axis"
            },
            {
                "id": "SCARA",
                "label": "SCARA"
            }
        ]
    },
    {
        "id": "Payload(kg)",
        "label": "\uac00\ubc18 \ud558\uc911(kg)",
        "options": [
            {
                "id": "4",
                "label": "4"
            },
            {
                "id": "5",
                "label": "5"
            },
            {
                "id": "7",
                "label": "7"
            },
            {
                "id": "10",
                "label": "10"
            },
            {
                "id": "11",
                "label": "11"
            },
            {
                "id": "16",
                "label": "16"
            },
            {
                "id": "20",
                "label": "20"
            },
            {
                "id": "25",
                "label": "25"
            },
            {
                "id": "35",
                "label": "35"
            },
            {
                "id": "60",
                "label": "60"
            }
        ]
    },
    {
        "id": "Manipulator Length(mm)",
        "label": "\ub9ac\uce58(mm)",
        "options": [
            {
                "id": "350",
                "label": "350"
            },
            {
                "id": "400",
                "label": "400"
            },
            {
                "id": "500",
                "label": "500"
            },
            {
                "id": "545.7",
                "label": "545.7"
            },
            {
                "id": "550",
                "label": "550"
            },
            {
                "id": "560.6",
                "label": "560.6"
            },
            {
                "id": "600",
                "label": "600"
            },
            {
                "id": "700",
                "label": "700"
            },
            {
                "id": "722.0",
                "label": "722.0"
            },
            {
                "id": "800",
                "label": "800"
            },
            {
                "id": "901.9",
                "label": "901.9"
            },
            {
                "id": "912.0",
                "label": "912.0"
            },
            {
                "id": "1000",
                "label": "1000"
            },
            {
                "id": "1100.6",
                "label": "1100.6"
            },
            {
                "id": "1200",
                "label": "1200"
            },
            {
                "id": "1201.0",
                "label": "1201.0"
            },
            {
                "id": "1422.0",
                "label": "1422.0"
            },
            {
                "id": "1783.0",
                "label": "1783.0"
            },
            {
                "id": "2107.0",
                "label": "2107.0"
            }
        ]
    },
    {
        "id": "Z axis Length(mm)",
        "label": "Z\ucd95 \uae38\uc774(mm)",
        "options": [
            {
                "id": "150",
                "label": "150"
            },
            {
                "id": "200",
                "label": "200"
            },
            {
                "id": "400",
                "label": "400"
            },
            {
                "id": "420",
                "label": "420"
            }
        ]
    },
    {
        "id": "Hollow Wrist",
        "label": "\uc911\uacf5\ud615",
        "options": [
            {
                "id": "No",
                "label": "No"
            },
            {
                "id": "Yes",
                "label": "Yes"
            }
        ]
    },
    {
        "id": "Clean Type",
        "label": "\ud074\ub9b0 \ud0c0\uc785",
        "options": [
            {
                "id": "No",
                "label": "No"
            },
            {
                "id": "Yes",
                "label": "Yes"
            }
        ]
    }
];

const productsData = [
    {
        "id": "IR-R4H-54S-INT",
        "name": "IR-R4H-54S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "4",
            "Manipulator Length(mm)": "545.7",
            "Hollow Wrist": "Yes",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741093*M00001",
                "cable": "3m"
            },
            {
                "code": "01741093*M00002",
                "cable": "5m"
            },
            {
                "code": "01741093*M00003",
                "cable": "10m"
            },
            {
                "code": "01741093*M00004",
                "cable": "15m"
            },
            {
                "code": "01741093*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741093*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741093*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741093*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-R4-56S-INT",
        "name": "IR-R4-56S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "4",
            "Manipulator Length(mm)": "560.6",
            "Hollow Wrist": "No",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741094*M00002",
                "cable": "3m"
            },
            {
                "code": "01741094*M00003",
                "cable": "5m"
            },
            {
                "code": "01741094*M00001",
                "cable": "10m"
            },
            {
                "code": "01741094*M00004",
                "cable": "15m"
            },
            {
                "code": "01741094*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741094*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741094*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741094*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-R7H-70S-INT",
        "name": "IR-R7H-70S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "722.0",
            "Hollow Wrist": "Yes",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741237*M00001",
                "cable": "3m"
            },
            {
                "code": "1741199",
                "cable": "5m"
            },
            {
                "code": "01741237*M00002",
                "cable": "10m"
            },
            {
                "code": "01741237*M00007",
                "cable": "15m"
            },
            {
                "code": "01741237*M00003",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741237*M00004",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741237*M00005",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741237*M00006",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-R7H-90S-INT",
        "name": "IR-R7H-90S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "912.0",
            "Hollow Wrist": "Yes",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741238*M00001",
                "cable": "3m"
            },
            {
                "code": "1741200",
                "cable": "5m"
            },
            {
                "code": "01741238*M00002",
                "cable": "10m"
            },
            {
                "code": "01741238*M00003",
                "cable": "15m"
            },
            {
                "code": "01741238*M00004",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741238*M00005",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741238*M00006",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741238*M00007",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-R10-110S-INT",
        "name": "IR-R10-110S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "1100.6",
            "Hollow Wrist": "No",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741091*M00001",
                "cable": "3m"
            },
            {
                "code": "01741091*M00002",
                "cable": "5m"
            },
            {
                "code": "01741091*M00003",
                "cable": "10m"
            },
            {
                "code": "01741091*M00004",
                "cable": "15m"
            },
            {
                "code": "01741091*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741091*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741091*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741091*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-R10H-120S-INT",
        "name": "IR-R10H-120S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "1201.0",
            "Hollow Wrist": "Yes",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741239*M00001",
                "cable": "3m"
            },
            {
                "code": "1741201",
                "cable": "5m"
            },
            {
                "code": "01741239*M00002",
                "cable": "10m"
            },
            {
                "code": "01741239*M00003",
                "cable": "15m"
            },
            {
                "code": "01741239*M00004",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741239*M00005",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741239*M00006",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741239*M00007",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-R10-140S-INT",
        "name": "IR-R10-140S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "1422.0",
            "Hollow Wrist": "No",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741086*M00001",
                "cable": "3m"
            },
            {
                "code": "01741086*M00002",
                "cable": "5m"
            },
            {
                "code": "01741086*M00003",
                "cable": "10m"
            },
            {
                "code": "01741086*M00004",
                "cable": "15m"
            }
        ]
    },
    {
        "id": "IR-R11-90S-INT",
        "name": "IR-R11-90S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "11",
            "Manipulator Length(mm)": "901.9",
            "Hollow Wrist": "No",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741092*M00001",
                "cable": "3m"
            },
            {
                "code": "01741092*M00002",
                "cable": "5m"
            },
            {
                "code": "01741092*M00003",
                "cable": "10m"
            },
            {
                "code": "01741092*M00004",
                "cable": "15m"
            },
            {
                "code": "01741092*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741092*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741092*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741092*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-R16-210S-INT",
        "name": "IR-R16-210S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "16",
            "Manipulator Length(mm)": "2107.0",
            "Hollow Wrist": "No",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741090",
                "cable": "5m"
            }
        ]
    },
    {
        "id": "IR-R25-178S-INT",
        "name": "IR-R25-178S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "25",
            "Manipulator Length(mm)": "1783.0",
            "Hollow Wrist": "No",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741222*M00001",
                "cable": "3m"
            },
            {
                "code": "1741089",
                "cable": "5m"
            },
            {
                "code": "01741222*M00002",
                "cable": "10m"
            },
            {
                "code": "01741222*M00003",
                "cable": "15m"
            },
            {
                "code": "01741222*M00004",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741222*M00005",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741222*M00006",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-TS4-35Z15S-INT",
        "name": "IR-TS4-35Z15S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "4",
            "Manipulator Length(mm)": "350",
            "Z axis Length(mm)": "150",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741098*M00009",
                "cable": "3m"
            },
            {
                "code": "01741098*M00010",
                "cable": "5m"
            },
            {
                "code": "01741098*M00011",
                "cable": "10m"
            },
            {
                "code": "01741098*M00012",
                "cable": "15m"
            },
            {
                "code": "01741098*M00013",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741098*M00014",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741098*M00015",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741098*M00016",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-TS4-35Z15S-INT-CLEAN",
        "name": "IR-TS4-35Z15S-INT (Clean Type)",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "4",
            "Manipulator Length(mm)": "350",
            "Z axis Length(mm)": "150",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741098*M00009",
                "cable": "3m"
            },
            {
                "code": "01741098*M00010",
                "cable": "5m"
            },
            {
                "code": "01741098*M00011",
                "cable": "10m"
            },
            {
                "code": "01741098*M00012",
                "cable": "15m"
            },
            {
                "code": "01741098*M00013",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741098*M00014",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741098*M00015",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741098*M00016",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S4-40Z15S-INT",
        "name": "IR-S4-40Z15S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "4",
            "Manipulator Length(mm)": "400",
            "Z axis Length(mm)": "150",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741084*M00003",
                "cable": "3m"
            },
            {
                "code": "01741084*M00004",
                "cable": "5m"
            },
            {
                "code": "01741084*M00005",
                "cable": "10m"
            },
            {
                "code": "01741084*M00006",
                "cable": "15m"
            },
            {
                "code": "01741084*M00007",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741084*M00008",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741084*M00009",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741084*M00010",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S4-40Z15S-INT-CLEAN",
        "name": "IR-S4-40Z15S-INT (Clean Type)",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "4",
            "Manipulator Length(mm)": "400",
            "Z axis Length(mm)": "150",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741084*M00003",
                "cable": "3m"
            },
            {
                "code": "01741084*M00004",
                "cable": "5m"
            },
            {
                "code": "01741084*M00005",
                "cable": "10m"
            },
            {
                "code": "01741084*M00006",
                "cable": "15m"
            },
            {
                "code": "01741084*M00007",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741084*M00008",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741084*M00009",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741084*M00010",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-TS5-55Z15S-INT",
        "name": "IR-TS5-55Z15S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "5",
            "Manipulator Length(mm)": "550",
            "Z axis Length(mm)": "150",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741097*M00002",
                "cable": "3m"
            },
            {
                "code": "01741097*M00003",
                "cable": "5m"
            },
            {
                "code": "01741097*M00004",
                "cable": "10m"
            },
            {
                "code": "01741097*M00005",
                "cable": "15m"
            },
            {
                "code": "01741097*M00006",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741097*M00007",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741097*M00008",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741097*M00009",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-TS5-55Z15S-INT-CLEAN",
        "name": "IR-TS5-55Z15S-INT (Clean Type)",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "5",
            "Manipulator Length(mm)": "550",
            "Z axis Length(mm)": "150",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741097*M00002",
                "cable": "3m"
            },
            {
                "code": "01741097*M00003",
                "cable": "5m"
            },
            {
                "code": "01741097*M00004",
                "cable": "10m"
            },
            {
                "code": "01741097*M00005",
                "cable": "15m"
            },
            {
                "code": "01741097*M00006",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741097*M00007",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741097*M00008",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741097*M00009",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S7-50Z20S-INT",
        "name": "IR-S7-50Z20S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "500",
            "Z axis Length(mm)": "200",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741078*M00001",
                "cable": "3m"
            },
            {
                "code": "01741078*M00002",
                "cable": "5m"
            },
            {
                "code": "01741078*M00003",
                "cable": "10m"
            },
            {
                "code": "01741078*M00004",
                "cable": "15m"
            },
            {
                "code": "01741078*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741078*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741078*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741078*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S7-50Z20S-INT-CLEAN",
        "name": "IR-S7-50Z20S-INT (Clean Type)",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "500",
            "Z axis Length(mm)": "200",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741078*M00001",
                "cable": "3m"
            },
            {
                "code": "01741078*M00002",
                "cable": "5m"
            },
            {
                "code": "01741078*M00003",
                "cable": "10m"
            },
            {
                "code": "01741078*M00004",
                "cable": "15m"
            },
            {
                "code": "01741078*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741078*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741078*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741078*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S7-60Z20S-INT",
        "name": "IR-S7-60Z20S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "600",
            "Z axis Length(mm)": "200",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741079*M00001",
                "cable": "3m"
            },
            {
                "code": "01741079*M00002",
                "cable": "5m"
            },
            {
                "code": "01741079*M00003",
                "cable": "10m"
            },
            {
                "code": "01741079*M00004",
                "cable": "15m"
            },
            {
                "code": "01741079*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741079*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741079*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741079*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S7-60Z20S-INT-CLEAN",
        "name": "IR-S7-60Z20S-INT (Clean Type)",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "600",
            "Z axis Length(mm)": "200",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741079*M00001",
                "cable": "3m"
            },
            {
                "code": "01741079*M00002",
                "cable": "5m"
            },
            {
                "code": "01741079*M00003",
                "cable": "10m"
            },
            {
                "code": "01741079*M00004",
                "cable": "15m"
            },
            {
                "code": "01741079*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741079*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741079*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741079*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S7-70Z20S-INT",
        "name": "IR-S7-70Z20S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "700",
            "Z axis Length(mm)": "200",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741080*M00001",
                "cable": "3m"
            },
            {
                "code": "01741080*M00003",
                "cable": "5m"
            },
            {
                "code": "01741080*M00002",
                "cable": "10m"
            },
            {
                "code": "01741080*M00004",
                "cable": "15m"
            },
            {
                "code": "01741080*M00006",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741080*M00005",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741080*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741080*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S7-70Z20S-INT-CLEAN",
        "name": "IR-S7-70Z20S-INT (Clean Type)",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "700",
            "Z axis Length(mm)": "200",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741080*M00001",
                "cable": "3m"
            },
            {
                "code": "01741080*M00003",
                "cable": "5m"
            },
            {
                "code": "01741080*M00002",
                "cable": "10m"
            },
            {
                "code": "01741080*M00004",
                "cable": "15m"
            },
            {
                "code": "01741080*M00006",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741080*M00005",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741080*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741080*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S10-60Z20S-INT",
        "name": "IR-S10-60Z20S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "600",
            "Z axis Length(mm)": "200",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741081*M00001",
                "cable": "3m"
            },
            {
                "code": "01741081*M00002",
                "cable": "5m"
            },
            {
                "code": "01741081*M00003",
                "cable": "10m"
            },
            {
                "code": "01741081*M00004",
                "cable": "15m"
            },
            {
                "code": "01741081*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741081*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741081*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741081*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S10-60Z20S-INT-CLEAN",
        "name": "IR-S10-60Z20S-INT (Clean Type)",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "600",
            "Z axis Length(mm)": "200",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741081*M00001",
                "cable": "3m"
            },
            {
                "code": "01741081*M00002",
                "cable": "5m"
            },
            {
                "code": "01741081*M00003",
                "cable": "10m"
            },
            {
                "code": "01741081*M00004",
                "cable": "15m"
            },
            {
                "code": "01741081*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741081*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741081*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741081*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S10-70Z20S-INT",
        "name": "IR-S10-70Z20S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "700",
            "Z axis Length(mm)": "200",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741082*M00001",
                "cable": "3m"
            },
            {
                "code": "01741082*M00002",
                "cable": "5m"
            },
            {
                "code": "01741082*M00003",
                "cable": "10m"
            },
            {
                "code": "01741082*M00004",
                "cable": "15m"
            },
            {
                "code": "01741082*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741082*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741082*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741082*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S10-70Z20S-INT-CLEAN",
        "name": "IR-S10-70Z20S-INT (Clean Type)",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "700",
            "Z axis Length(mm)": "200",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741082*M00001",
                "cable": "3m"
            },
            {
                "code": "01741082*M00002",
                "cable": "5m"
            },
            {
                "code": "01741082*M00003",
                "cable": "10m"
            },
            {
                "code": "01741082*M00004",
                "cable": "15m"
            },
            {
                "code": "01741082*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741082*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741082*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741082*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S10-80Z20S-INT",
        "name": "IR-S10-80Z20S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "800",
            "Z axis Length(mm)": "200",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741083*M00001",
                "cable": "3m"
            },
            {
                "code": "01741083*M00002",
                "cable": "5m"
            },
            {
                "code": "01741083*M00003",
                "cable": "10m"
            },
            {
                "code": "01741083*M00004",
                "cable": "15m"
            },
            {
                "code": "01741083*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741083*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741083*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741083*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S10-80Z20S-INT-CLEAN",
        "name": "IR-S10-80Z20S-INT (Clean Type)",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "800",
            "Z axis Length(mm)": "200",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741083*M00001",
                "cable": "3m"
            },
            {
                "code": "01741083*M00002",
                "cable": "5m"
            },
            {
                "code": "01741083*M00003",
                "cable": "10m"
            },
            {
                "code": "01741083*M00004",
                "cable": "15m"
            },
            {
                "code": "01741083*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741083*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741083*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741083*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-GS20-80Z42S-INT",
        "name": "IR-GS20-80Z42S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "20",
            "Manipulator Length(mm)": "800",
            "Z axis Length(mm)": "420",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741155*M00009",
                "cable": "3m"
            },
            {
                "code": "01741155*M00010",
                "cable": "5m"
            },
            {
                "code": "01741155*M00011",
                "cable": "10m"
            },
            {
                "code": "01741155*M00012",
                "cable": "15m"
            },
            {
                "code": "01741155*M00013",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741155*M00014",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741155*M00015",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741155*M00016",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-GS20-80Z42S-INT-CLEAN",
        "name": "IR-GS20-80Z42S-INT (Clean Type)",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "20",
            "Manipulator Length(mm)": "800",
            "Z axis Length(mm)": "420",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741155*M00009",
                "cable": "3m"
            },
            {
                "code": "01741155*M00010",
                "cable": "5m"
            },
            {
                "code": "01741155*M00011",
                "cable": "10m"
            },
            {
                "code": "01741155*M00012",
                "cable": "15m"
            },
            {
                "code": "01741155*M00013",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741155*M00014",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741155*M00015",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741155*M00016",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S20-80Z42S-INT",
        "name": "IR-S20-80Z42S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "20",
            "Manipulator Length(mm)": "800",
            "Z axis Length(mm)": "420",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741155*M00003",
                "cable": "3m"
            },
            {
                "code": "01741155*M00001",
                "cable": "5m"
            },
            {
                "code": "01741155*M00002",
                "cable": "10m"
            },
            {
                "code": "01741155*M00004",
                "cable": "15m"
            },
            {
                "code": "01741155*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741155*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741155*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741155*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S20-80Z42S-INT-CLEAN",
        "name": "IR-S20-80Z42S-INT (Clean Type)",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "20",
            "Manipulator Length(mm)": "800",
            "Z axis Length(mm)": "420",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741155*M00003",
                "cable": "3m"
            },
            {
                "code": "01741155*M00001",
                "cable": "5m"
            },
            {
                "code": "01741155*M00002",
                "cable": "10m"
            },
            {
                "code": "01741155*M00004",
                "cable": "15m"
            },
            {
                "code": "01741155*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741155*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741155*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741155*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-GS20-100Z42S-INT",
        "name": "IR-GS20-100Z42S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "20",
            "Manipulator Length(mm)": "1000",
            "Z axis Length(mm)": "420",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741156*M00013",
                "cable": "3m"
            },
            {
                "code": "01741156*M00014",
                "cable": "5m"
            },
            {
                "code": "01741156*M00015",
                "cable": "10m"
            },
            {
                "code": "01741156*M00016",
                "cable": "15m"
            },
            {
                "code": "01741156*M00009",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741156*M00010",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741156*M00011",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741156*M00012",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-GS20-100Z42S-INT-CLEAN",
        "name": "IR-GS20-100Z42S-INT (Clean Type)",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "20",
            "Manipulator Length(mm)": "1000",
            "Z axis Length(mm)": "420",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741156*M00013",
                "cable": "3m"
            },
            {
                "code": "01741156*M00014",
                "cable": "5m"
            },
            {
                "code": "01741156*M00015",
                "cable": "10m"
            },
            {
                "code": "01741156*M00016",
                "cable": "15m"
            },
            {
                "code": "01741156*M00009",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741156*M00010",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741156*M00011",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741156*M00012",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S20-100Z42S-INT",
        "name": "IR-S20-100Z42S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "20",
            "Manipulator Length(mm)": "1000",
            "Z axis Length(mm)": "420",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741156*M00001",
                "cable": "3m"
            },
            {
                "code": "01741156*M00002",
                "cable": "5m"
            },
            {
                "code": "01741156*M00003",
                "cable": "10m"
            },
            {
                "code": "01741156*M00004",
                "cable": "15m"
            },
            {
                "code": "01741156*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741156*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741156*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741156*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S20-100Z42S-INT-CLEAN",
        "name": "IR-S20-100Z42S-INT (Clean Type)",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "20",
            "Manipulator Length(mm)": "1000",
            "Z axis Length(mm)": "420",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741156*M00001",
                "cable": "3m"
            },
            {
                "code": "01741156*M00002",
                "cable": "5m"
            },
            {
                "code": "01741156*M00003",
                "cable": "10m"
            },
            {
                "code": "01741156*M00004",
                "cable": "15m"
            },
            {
                "code": "01741156*M00005",
                "cable": "3m\uff08High flex cables\uff09"
            },
            {
                "code": "01741156*M00006",
                "cable": "5m\uff08High flex cables\uff09"
            },
            {
                "code": "01741156*M00007",
                "cable": "10m\uff08High flex cables\uff09"
            },
            {
                "code": "01741156*M00008",
                "cable": "15m\uff08High flex cables\uff09"
            }
        ]
    },
    {
        "id": "IR-S35-80Z42S-INT",
        "name": "IR-S35-80Z42S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "35",
            "Manipulator Length(mm)": "800",
            "Z axis Length(mm)": "420",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741206",
                "cable": "10m"
            }
        ]
    },
    {
        "id": "IR-S35-80Z42S-INT-CLEAN",
        "name": "IR-S35-80Z42S-INT (Clean Type)",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "35",
            "Manipulator Length(mm)": "800",
            "Z axis Length(mm)": "420",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741206",
                "cable": "10m"
            }
        ]
    },
    {
        "id": "IR-S35-100Z42S-INT",
        "name": "IR-S35-100Z42S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "35",
            "Manipulator Length(mm)": "1000",
            "Z axis Length(mm)": "420",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741207",
                "cable": "10m"
            }
        ]
    },
    {
        "id": "IR-S35-100Z42S-INT-CLEAN",
        "name": "IR-S35-100Z42S-INT (Clean Type)",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "35",
            "Manipulator Length(mm)": "1000",
            "Z axis Length(mm)": "420",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741207",
                "cable": "10m"
            }
        ]
    },
    {
        "id": "IR-GS60-120Z40S-INT",
        "name": "IR-GS60-120Z40S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "60",
            "Manipulator Length(mm)": "1200",
            "Z axis Length(mm)": "400",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741178",
                "cable": "10m"
            }
        ]
    }
];

const accessoriesList = [
    {
        "code": "01660006",
        "type": "Fork lift tool for robots",
        "description": "Used by the fork lift for handling IR-R10 and IR-R20 series 6-axis robots"
    },
    {
        "code": "15051627",
        "type": "I/O Arm  cable (90\u00b0 )",
        "description": "Used for wiring of the aviation connector on the upper end of the forearm in IR-R4/R4H/R7H/R10H/10/11 series 6-axis robots,8 pin, with 2m cable"
    },
    {
        "code": "15050817",
        "type": "I/O Arm  cable (90\u00b0 )",
        "description": "Used for wiring of the aviation connector on the upper end of the forearm inIR-R4/R4H/R10/11 series 6-axis robots,12 pin, with 1m cable"
    },
    {
        "code": "1504WU81",
        "type": "I/O Arm  cable (90\u00b0 )",
        "description": "Used for wiring of the aviation connector on the upper end of the forearm in IR-R4/R4H/R10/11 series 6-axis robots,12 pin, with 2m cable"
    },
    {
        "code": "15051387",
        "type": "I/O Arm  cable (90\u00b0 )",
        "description": "Used for wiring of the aviation connector on the upper end of the forearm in IR-R7H, IR-R10H series 6-axis robots,17 pin, with 1m cable"
    },
    {
        "code": "15310429",
        "type": "I/O Arm  cable (90\u00b0 )",
        "description": "Used for wiring of the aviation connector on the upper end of the forearm in IR-R7H, IR-R10H series 6-axis robots,17 pin, with 2m cable"
    },
    {
        "code": "15050930",
        "type": "I/O Arm  cable (90\u00b0 )",
        "description": "Used for wiring of the aviation connector on the upper end of the forearm in IR-R10(1422)/IR-R16/ IR-R25 series 6-axis robots, 19pin, without cable"
    },
    {
        "code": "15051215",
        "type": "I/O Arm  cable (90\u00b0 )",
        "description": "Used for wiring of the aviation connector on the upper end of the forearm inIR-R10(1422)/IR-R16/ IR-R25 series 6-axis robots,with1.5m high flexible cable"
    },
    {
        "code": "1504WU82",
        "type": "I/O Arm  cable (90\u00b0 )",
        "description": "Used for wiring of the aviation connector on the upper end of the forearm inIR-R10(1422)/IR-R16/ IR-R25 series 6-axis robots,19 Pin with 3m high flexible cable"
    },
    {
        "code": "1504WW97",
        "type": "I/O Arm  cable (90\u00b0 )",
        "description": "Used for wiring of the aviation connector on the upper end of the forearm in  IR-R10(1422)/IR-R16/ IR-R25 series 6-axis robots,19 Pin with 5m high flexible cable"
    },
    {
        "code": "15310427",
        "type": "I/O body cable \uff1aFlexible\uff088pin) , 5m",
        "description": "Used for wiring between,IR-R4/4H/7H/10H/10/11/16/25 series 6-axis robots and the controller(180\u00b0)."
    },
    {
        "code": "15310428",
        "type": "I/O body cable \uff1aFlexible\uff088pin) , 10m",
        "description": "Used for wiring between,IR-R4/4H/7H/10H/10/11/16/25 series 6-axis robots and the controller(180\u00b0)."
    },
    {
        "code": "1504WN06",
        "type": "I/O body cable \uff1aNon-Flexible\uff088pin) , 10m",
        "description": "Used for wiring between,IR-R4/4H/7H/10H/10/11/16/25 series 6-axis robots and the controller(180\u00b0)."
    },
    {
        "code": "1504B978",
        "type": "I/O cable  Non-Flexible\uff0819pin\uff09,5 m",
        "description": "Used for wiring between,IR-R4/4H/7H/10H/10/11/16/25 series 6-axis robots and the controller(180\u00b0)."
    },
    {
        "code": "1504RP67",
        "type": "I/O cable 5 m - Flexible (19pin)\uff0c5m",
        "description": "Used for wiring between,IR-R4/4H/7H/10H/10/11/16/25 series 6-axis robots and the controller(180\u00b0)."
    },
    {
        "code": "1504RP68",
        "type": "I/O body cable : Flexible\uff0819pin\uff09,10 m",
        "description": "Used for wiring between,IR-R4/4H/7H/10H/10/11/16/25 series 6-axis robots and the controller(180\u00b0)."
    },
    {
        "code": "1504RP69",
        "type": "I/O body  cable : Flexible\uff0819pin\uff09,15 m",
        "description": "Used for wiring between,IR-R4/4H/7H/10H/10/11/16/25 series 6-axis robots and the controller(180\u00b0)."
    },
    {
        "code": "1504NN47",
        "type": "Network cable accessory",
        "description": "Connects a cable to the network port of the IR\u2011R7H series 6\u2011axis robot"
    },
    {
        "code": "01660004",
        "type": "Handheld break release box",
        "description": "Used to manually release the break of the robot in emergencies, applicable to all series of 6-axis robots."
    },
    {
        "code": "32020626",
        "type": "Homing tool - Homing column 1",
        "description": "Used for homing calibration of IR-S4/7/10 and IR-TS-4/5 series SCARA robots"
    },
    {
        "code": "32020627",
        "type": "Homing tool - Homing column 2",
        "description": "Used for homing calibration of IR-S4/7/10 and IR-TS-4/5 series SCARA robots"
    },
    {
        "code": "32040084",
        "type": "Homing tool - Positioning block",
        "description": "Used for homing calibration of IR-S4/7/10 and IR-TS-4/5 series SCARA robots"
    },
    {
        "code": "01660018",
        "type": "Homing tool",
        "description": "Used for homing calibration of IR-R4/4H/7H/11/R10\uff081100mm\uff09/R10H series 6-axis robots"
    },
    {
        "code": "01660015",
        "type": "Homing tool",
        "description": "Used for homing calibration of IR-R10\uff081422mm\uff09/R16/25 series 6-axis robots"
    },
    {
        "code": "01640055",
        "type": "IR-TP200-L5-INT",
        "description": "Robot teach pendant (5 m)"
    },
    {
        "code": "01640056",
        "type": "IR-TP200-L10-INT",
        "description": "Robot teach pendant (10 m)"
    },
    {
        "code": "01640057",
        "type": "IR-TP200-L20-INT",
        "description": "Robot teach pendant (20 m)"
    },
    {
        "code": "01640058",
        "type": "IR-TP200-L30-INT",
        "description": "Robot teach pendant (30 m)"
    },
    {
        "code": "1504R444",
        "type": "IR-TP200-L5-INT Teach Pendant Extension Cable-5m",
        "description": "nan"
    },
    {
        "code": "1504R445",
        "type": "IR-TP200-L5-INT Teach Pendant Extension Cable-15m",
        "description": "nan"
    },
    {
        "code": "1504R446",
        "type": "IR-TP200-L5-INT Teach Pendant Extension Cable-25m",
        "description": "nan"
    },
    {
        "code": "1504R443",
        "type": "Robot teach pendant adapter",
        "description": "TP2.0 adapter to IRCB501controller"
    },
    {
        "code": "98051002",
        "type": "Encoder Battery",
        "description": "Encoder Battery for Scara and 6Axis robots"
    },

    {
        "code": "72100539",
        "type": "Robot Simulation Software Dongle (USB Flash Drive)",
        "description": "Robot simulation software dongle"
    },
    {
        "code": "98070354",
        "type": "Lower Telescopic Cover",
        "description": "IR-S7/10-Z17C-Lower Cover Series 7kg 10kg Clean Type"
    },
    {
        "code": "98070355",
        "type": "Upper Telescopic Cover",
        "description": "IR-S7/10-Z17C-Upper Cover Series 7kg 10kg Clean Type"
    },
    {
        "code": "98070385",
        "type": "Upper Telescopic Cover",
        "description": "IR-S4-Z12C-Upper Cover Series 4kg Clean Type"
    },
    {
        "code": "98070386",
        "type": "Lower Telescopic Cover",
        "description": "IR-S4-Z12C-Lower Cover Series 4kg Clean Type"
    },
    {
        "code": "98051249",
        "type": "Teach Pendant Plug for 1.0 TP Connector",
        "description": "nan"
    },
    {
        "code": "98051250",
        "type": "Teach Pendant Plug for 2.0 TP Connector",
        "description": "nan"
    }
];
