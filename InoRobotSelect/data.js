const filtersData = [
    {
        "id": "Type",
        "label": "로봇 타입",
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
        "label": "가반 하중(kg)",
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
                "id": "15",
                "label": "15"
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
        "label": "리치(mm)",
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
                "id": "722.3",
                "label": "722.3"
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
                "id": "911.9",
                "label": "911.9"
            },
            {
                "id": "1000",
                "label": "1000"
            },
            {
                "id": "1101.6",
                "label": "1101.6"
            },
            {
                "id": "1200",
                "label": "1200"
            },
            {
                "id": "1201.2",
                "label": "1201.2"
            },
            {
                "id": "1218",
                "label": "1218"
            },
            {
                "id": "1422",
                "label": "1422"
            },
            {
                "id": "1455",
                "label": "1455"
            },
            {
                "id": "1783",
                "label": "1783"
            },
            {
                "id": "2107",
                "label": "2107"
            }
        ]
    },
    {
        "id": "Z axis Length(mm)",
        "label": "Z축 길이(mm)",
        "options": [
            {
                "id": "120",
                "label": "120"
            },
            {
                "id": "150",
                "label": "150"
            },
            {
                "id": "170",
                "label": "170"
            },
            {
                "id": "200",
                "label": "200"
            },
            {
                "id": "350",
                "label": "350"
            },
            {
                "id": "360",
                "label": "360"
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
        "label": "중공형",
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
        "id": "Sub Type",
        "label": "타입",
        "options": [
            {
                "id": "일반형",
                "label": "일반형"
            },
            {
                "id": "경제형",
                "label": "경제형"
            },
            {
                "id": "클린형",
                "label": "클린형"
            },
            {
                "id": "천장형",
                "label": "천장형"
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
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "01741093*M00011",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Maximum reach (mm)": "545.7",
            "Repeatability (mm)": "±0.02",
            "Maximum Load (kg)": "4",
            "IP rating": "IP40\n(Option:IP67)",
            "Max Speed J1 (°/s)": "450",
            "Max Speed J2 (°/s)": "460",
            "Max Speed J3 (°/s)": "520",
            "Max Speed J4 (°/s)": "560",
            "Max Speed J5 (°/s)": "560",
            "Max Speed J6 (°/s)": "900",
            "Max motion range J1 (°)": "±170",
            "Max motion range J2 (°)": "-120~+110",
            "Max motion range J3 (°)": "-65~+195",
            "Max motion range J4 (°)": "±190",
            "Max motion range J5 (°)": "±120",
            "Max motion range J6 (°)": "±360",
            "Allowed wrist torque J4 (N·m)": "8.86",
            "Allowed wrist torque J5 (N·m)": "8.86",
            "Allowed wrist torque J6 (N·m)": "4.9",
            "Allowed wrist inertia J4 (kg·m²)": "0.2",
            "Allowed wrist inertia J5 (kg·m²)": "0.2",
            "Allowed wrist inertia J6 (kg·m²)": "0.067",
            "Customer Wiring": "12 lines 30V 0.5A\n8 lines 30V 0.2A",
            "Customer Air": "Φ4 mm × 4 (0.59Mpa)",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (kg)": "24.5",
            "Controller": "IRCB501-6LD-INT",
            "Mounting mode": "Floor/Ceiling/Wall",
            "Certification": "Kcs, KC, CE, cSGSus, FCC, Safety"
        }
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
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "01741094*M00010",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Maximum reach (mm)": "560.6",
            "Repeatability (mm)": "±0.01",
            "Maximum Load (kg)": "4",
            "IP rating": "IP40\n(Option:IP67)",
            "Max Speed J1 (°/s)": "450",
            "Max Speed J2 (°/s)": "460",
            "Max Speed J3 (°/s)": "520",
            "Max Speed J4 (°/s)": "560",
            "Max Speed J5 (°/s)": "560",
            "Max Speed J6 (°/s)": "900",
            "Max motion range J1 (°)": "±170",
            "Max motion range J2 (°)": "-120~+110",
            "Max motion range J3 (°)": "-69~+205",
            "Max motion range J4 (°)": "±190",
            "Max motion range J5 (°)": "±120",
            "Max motion range J6 (°)": "±360",
            "Allowed wrist torque J4 (N·m)": "8.86",
            "Allowed wrist torque J5 (N·m)": "8.86",
            "Allowed wrist torque J6 (N·m)": "4.9",
            "Allowed wrist inertia J4 (kg·m²)": "0.2",
            "Allowed wrist inertia J5 (kg·m²)": "0.2",
            "Allowed wrist inertia J6 (kg·m²)": "0.067",
            "Customer Wiring": "12 lines 30V 0.5A",
            "Customer Air": "Φ4 mm × 4 (0.59Mpa)",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (kg)": "24",
            "Controller": "IRCB501-6LD-INT",
            "Mounting mode": "Floor/Ceiling/Wall",
            "Certification": "Kcs, KC, CE, cSGSus, FCC, Safety"
        }
    },
    {
        "id": "IR-R7H-70S-INT",
        "name": "IR-R7H-70S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "722.3",
            "Hollow Wrist": "Yes",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "01741237*M00009",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Maximum reach (mm)": "722.3",
            "Repeatability (mm)": "±0.015",
            "Maximum Load (kg)": "7",
            "IP rating": "IP40\n(Option:IP67)",
            "Max Speed J1 (°/s)": "420",
            "Max Speed J2 (°/s)": "336",
            "Max Speed J3 (°/s)": "487.5",
            "Max Speed J4 (°/s)": "550",
            "Max Speed J5 (°/s)": "438",
            "Max Speed J6 (°/s)": "764.7",
            "Max motion range J1 (°)": "±170",
            "Max motion range J2 (°)": "-135~+80",
            "Max motion range J3 (°)": "-70~+190",
            "Max motion range J4 (°)": "±190",
            "Max motion range J5 (°)": "±120",
            "Max motion range J6 (°)": "±360",
            "Allowed wrist torque J4 (N·m)": "16.9",
            "Allowed wrist torque J5 (N·m)": "16.9",
            "Allowed wrist torque J6 (N·m)": "9.4",
            "Allowed wrist inertia J4 (kg·m²)": "0.49",
            "Allowed wrist inertia J5 (kg·m²)": "0.49",
            "Allowed wrist inertia J6 (kg·m²)": "0.15",
            "Customer Wiring": "17 lines 30V 0.5A\n8 lines 30V 0.2A",
            "Customer Air": "Φ4 mm × 4 (0.59Mpa)",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (kg)": "31",
            "Controller": "IRCB501-6LD-INT",
            "Mounting mode": "Floor/Ceiling/Wall",
            "Certification": "Kcs, KC, CE, cSGSus, FCC, Safety"
        }
    },
    {
        "id": "IR-R7H-90S-INT",
        "name": "IR-R7H-90S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "911.9",
            "Hollow Wrist": "Yes",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "01741238*M00019",
                "cable": "3m"
            },
            {
                "code": "01741238*M00014",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Maximum reach (mm)": "911.9",
            "Repeatability (mm)": "±0.02",
            "Maximum Load (kg)": "7",
            "IP rating": "IP40\n(Option:IP67)",
            "Max Speed J1 (°/s)": "336",
            "Max Speed J2 (°/s)": "280",
            "Max Speed J3 (°/s)": "390",
            "Max Speed J4 (°/s)": "550",
            "Max Speed J5 (°/s)": "438",
            "Max Speed J6 (°/s)": "764.7",
            "Max motion range J1 (°)": "±170",
            "Max motion range J2 (°)": "-125~+80",
            "Max motion range J3 (°)": "-70~+190",
            "Max motion range J4 (°)": "±190",
            "Max motion range J5 (°)": "±120",
            "Max motion range J6 (°)": "±360",
            "Allowed wrist torque J4 (N·m)": "16.9",
            "Allowed wrist torque J5 (N·m)": "16.9",
            "Allowed wrist torque J6 (N·m)": "9.4",
            "Allowed wrist inertia J4 (kg·m²)": "0.49",
            "Allowed wrist inertia J5 (kg·m²)": "0.49",
            "Allowed wrist inertia J6 (kg·m²)": "0.15",
            "Customer Wiring": "17 lines 30V 0.5A\n8 lines 30V 0.2A",
            "Customer Air": "Φ4 mm × 4 (0.59Mpa)",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (kg)": "33",
            "Controller": "IRCB501-6LD-INT",
            "Mounting mode": "Floor/Ceiling/Wall",
            "Certification": "Kcs, KC, CE, cSGSus, FCC, Safety"
        }
    },
    {
        "id": "IR-R10-110S-INT",
        "name": "IR-R10-110S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "1101.6",
            "Hollow Wrist": "No",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "01741091*M00009",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Maximum reach (mm)": "1101.6",
            "Repeatability (mm)": "±0.02",
            "Maximum Load (kg)": "10",
            "IP rating": "IP40\n(Option:IP67)",
            "Max Speed J1 (°/s)": "240",
            "Max Speed J2 (°/s)": "180",
            "Max Speed J3 (°/s)": "330",
            "Max Speed J4 (°/s)": "450",
            "Max Speed J5 (°/s)": "420",
            "Max Speed J6 (°/s)": "720",
            "Max motion range J1 (°)": "±170",
            "Max motion range J2 (°)": "-135~+100",
            "Max motion range J3 (°)": "-66~+210",
            "Max motion range J4 (°)": "±190",
            "Max motion range J5 (°)": "±125",
            "Max motion range J6 (°)": "±360",
            "Allowed wrist torque J4 (N·m)": "18.59",
            "Allowed wrist torque J5 (N·m)": "18.59",
            "Allowed wrist torque J6 (N·m)": "9.8",
            "Allowed wrist inertia J4 (kg·m²)": "0.6",
            "Allowed wrist inertia J5 (kg·m²)": "0.6",
            "Allowed wrist inertia J6 (kg·m²)": "0.2",
            "Customer Wiring": "12 lines 30V 0.5A",
            "Customer Air": "Φ4 mm × 4 (0.59Mpa)",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (kg)": "48",
            "Controller": "IRCB501-6FD-INT",
            "Mounting mode": "Floor/Ceiling/Wall",
            "Certification": "Kcs, KC, CE, cSGSus, FCC, Safety"
        }
    },
    {
        "id": "IR-R10H-120S-INT",
        "name": "IR-R10H-120S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "1201.2",
            "Hollow Wrist": "Yes",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "01741239*M00008",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Maximum reach (mm)": "1201.2",
            "Repeatability (mm)": "±0.025",
            "Maximum Load (kg)": "10",
            "IP rating": "IP40\n(Option:IP67)",
            "Max Speed J1 (°/s)": "240",
            "Max Speed J2 (°/s)": "180",
            "Max Speed J3 (°/s)": "330",
            "Max Speed J4 (°/s)": "450",
            "Max Speed J5 (°/s)": "420",
            "Max Speed J6 (°/s)": "720",
            "Max motion range J1 (°)": "±170",
            "Max motion range J2 (°)": "-135~+100",
            "Max motion range J3 (°)": "-66~+210",
            "Max motion range J4 (°)": "±190",
            "Max motion range J5 (°)": "±125",
            "Max motion range J6 (°)": "±360",
            "Allowed wrist torque J4 (N·m)": "18.59",
            "Allowed wrist torque J5 (N·m)": "18.59",
            "Allowed wrist torque J6 (N·m)": "9.8",
            "Allowed wrist inertia J4 (kg·m²)": "0.6",
            "Allowed wrist inertia J5 (kg·m²)": "0.6",
            "Allowed wrist inertia J6 (kg·m²)": "0.2",
            "Customer Wiring": "17 lines 30V 0.5A\n8 lines 30V 0.2A",
            "Customer Air": "Φ4 mm × 4 (0.59Mpa)",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (kg)": "50",
            "Controller": "IRCB501-6FD-INT",
            "Mounting mode": "Floor/Ceiling/Wall",
            "Certification": "Kcs, KC, CE, cSGSus, FCC, Safety"
        }
    },
    {
        "id": "IR-R10-140S-INT",
        "name": "IR-R10-140S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "1422",
            "Hollow Wrist": "No",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "01741086*M00005",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Maximum reach (mm)": "1422",
            "Repeatability (mm)": "±0.05",
            "Maximum Load (kg)": "10",
            "IP rating": "Body:IP65 \nWrist:IP67",
            "Max Speed J1 (°/s)": "200",
            "Max Speed J2 (°/s)": "200",
            "Max Speed J3 (°/s)": "200",
            "Max Speed J4 (°/s)": "375",
            "Max Speed J5 (°/s)": "375",
            "Max Speed J6 (°/s)": "600",
            "Max motion range J1 (°)": "±170",
            "Max motion range J2 (°)": "-160~+60",
            "Max motion range J3 (°)": "-80~+160",
            "Max motion range J4 (°)": "±180",
            "Max motion range J5 (°)": "±140",
            "Max motion range J6 (°)": "±360",
            "Allowed wrist torque J4 (N·m)": "22",
            "Allowed wrist torque J5 (N·m)": "22",
            "Allowed wrist torque J6 (N·m)": "9.8",
            "Allowed wrist inertia J4 (kg·m²)": "0.63",
            "Allowed wrist inertia J5 (kg·m²)": "0.63",
            "Allowed wrist inertia J6 (kg·m²)": "0.2",
            "Customer Wiring": "18 lines 30V 0.5A",
            "Customer Air": "Φ8 mm × 1 (0.59Mpa)",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (kg)": "130",
            "Controller": "IRCB501-6ND-INT",
            "Mounting mode": "Floor",
            "Certification": "Kcs, KC, CE, cSGSus, FCC, Safety"
        }
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
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "01741092*M00010",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Maximum reach (mm)": "901.9",
            "Repeatability (mm)": "±0.02",
            "Maximum Load (kg)": "11.3",
            "IP rating": "IP40\n(Option:IP67)",
            "Max Speed J1 (°/s)": "240",
            "Max Speed J2 (°/s)": "180",
            "Max Speed J3 (°/s)": "330",
            "Max Speed J4 (°/s)": "450",
            "Max Speed J5 (°/s)": "420",
            "Max Speed J6 (°/s)": "720",
            "Max motion range J1 (°)": "±170",
            "Max motion range J2 (°)": "-135~+100",
            "Max motion range J3 (°)": "-66~+210",
            "Max motion range J4 (°)": "±190",
            "Max motion range J5 (°)": "±125",
            "Max motion range J6 (°)": "±360",
            "Allowed wrist torque J4 (N·m)": "20.45",
            "Allowed wrist torque J5 (N·m)": "20.45",
            "Allowed wrist torque J6 (N·m)": "10.8",
            "Allowed wrist inertia J4 (kg·m²)": "0.6",
            "Allowed wrist inertia J5 (kg·m²)": "0.6",
            "Allowed wrist inertia J6 (kg·m²)": "0.2",
            "Customer Wiring": "12 lines 30V 0.5A",
            "Customer Air": "Φ4 mm × 4 (0.59Mpa)",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (kg)": "45",
            "Controller": "IRCB501-6FD-INT",
            "Mounting mode": "Floor/Ceiling/Wall",
            "Certification": "Kcs, KC, CE, cSGSus, FCC, Safety"
        }
    },
    {
        "id": "IR-R15H-145S-INT",
        "name": "IR-R15H-145S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "15",
            "Manipulator Length(mm)": "1455",
            "Hollow Wrist": "Yes",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "1741446",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Maximum reach (mm)": "1455",
            "Repeatability (mm)": "±0.04",
            "Maximum Load (kg)": "15",
            "IP rating": "IP40\n(Option:IP67)",
            "Max Speed J1 (°/s)": "260",
            "Max Speed J2 (°/s)": "240",
            "Max Speed J3 (°/s)": "260",
            "Max Speed J4 (°/s)": "470",
            "Max Speed J5 (°/s)": "450",
            "Max Speed J6 (°/s)": "705",
            "Max motion range J1 (°)": "±170",
            "Max motion range J2 (°)": "-160~+90",
            "Max motion range J3 (°)": "-76~+210",
            "Max motion range J4 (°)": "±190",
            "Max motion range J5 (°)": "±140",
            "Max motion range J6 (°)": "±360",
            "Allowed wrist torque J4 (N·m)": "26.5",
            "Allowed wrist torque J5 (N·m)": "26.5",
            "Allowed wrist torque J6 (N·m)": "12",
            "Allowed wrist inertia J4 (kg·m²)": "0.9",
            "Allowed wrist inertia J5 (kg·m²)": "0.9",
            "Allowed wrist inertia J6 (kg·m²)": "0.3",
            "Customer Wiring": "24 lines 30V 0.5A",
            "Customer Air": "Φ6 mm × 4 (0.59Mpa)",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (kg)": "155",
            "Controller": "IRCB501-6KD-INT",
            "Mounting mode": "Floor/Ceiling/Wall",
            "Certification": "Kcs, KC, CE, cSGSus, FCC, Safety"
        }
    },
    {
        "id": "IR-R16-210S-INT",
        "name": "IR-R16-210S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "16",
            "Manipulator Length(mm)": "2107",
            "Hollow Wrist": "No",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "01741090",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Maximum reach (mm)": "2107",
            "Repeatability (mm)": "±0.03",
            "Maximum Load (kg)": "16",
            "IP rating": "Body:IP65 \nWrist:IP67",
            "Max Speed J1 (°/s)": "190",
            "Max Speed J2 (°/s)": "175",
            "Max Speed J3 (°/s)": "200",
            "Max Speed J4 (°/s)": "400",
            "Max Speed J5 (°/s)": "360",
            "Max Speed J6 (°/s)": "610",
            "Max motion range J1 (°)": "±170",
            "Max motion range J2 (°)": "-155~+80",
            "Max motion range J3 (°)": "-75~+160",
            "Max motion range J4 (°)": "±180",
            "Max motion range J5 (°)": "±140",
            "Max motion range J6 (°)": "±360",
            "Allowed wrist torque J4 (N·m)": "25",
            "Allowed wrist torque J5 (N·m)": "25",
            "Allowed wrist torque J6 (N·m)": "12",
            "Allowed wrist inertia J4 (kg·m²)": "0.78",
            "Allowed wrist inertia J5 (kg·m²)": "0.78",
            "Allowed wrist inertia J6 (kg·m²)": "0.3",
            "Customer Wiring": "18 lines 30V 0.5A",
            "Customer Air": "Φ8 mm × 1 (0.59Mpa)",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (kg)": "260",
            "Controller": "IRCB501-6FD-INT",
            "Mounting mode": "Floor",
            "Certification": "Kcs, KC, CE, cSGSus, FCC, Safety"
        }
    },
    {
        "id": "IR-R20H-120S-INT",
        "name": "IR-R20H-120S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "20",
            "Manipulator Length(mm)": "1218",
            "Hollow Wrist": "Yes",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "1741447",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Maximum reach (mm)": "1218",
            "Repeatability (mm)": "±0.04",
            "Maximum Load (kg)": "20",
            "IP rating": "IP40\n(Option:IP67)",
            "Max Speed J1 (°/s)": "260",
            "Max Speed J2 (°/s)": "240",
            "Max Speed J3 (°/s)": "260",
            "Max Speed J4 (°/s)": "470",
            "Max Speed J5 (°/s)": "450",
            "Max Speed J6 (°/s)": "705",
            "Max motion range J1 (°)": "±170",
            "Max motion range J2 (°)": "-160~+90",
            "Max motion range J3 (°)": "-76~+210",
            "Max motion range J4 (°)": "±190",
            "Max motion range J5 (°)": "±140",
            "Max motion range J6 (°)": "±360",
            "Allowed wrist torque J4 (N·m)": "35",
            "Allowed wrist torque J5 (N·m)": "35",
            "Allowed wrist torque J6 (N·m)": "20",
            "Allowed wrist inertia J4 (kg·m²)": "1",
            "Allowed wrist inertia J5 (kg·m²)": "1",
            "Allowed wrist inertia J6 (kg·m²)": "0.4",
            "Customer Wiring": "24 lines 30V 0.5A",
            "Customer Air": "Φ6 mm × 4 (0.59Mpa)",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (kg)": "150",
            "Controller": "IRCB501-6KD-INT",
            "Mounting mode": "Floor/Ceiling/Wall",
            "Certification": "Kcs, KC, CE, cSGSus, FCC, Safety"
        }
    },
    {
        "id": "IR-R25-178S-INT",
        "name": "IR-R25-178S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "6-Axis",
            "Payload(kg)": "25",
            "Manipulator Length(mm)": "1783",
            "Hollow Wrist": "No",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "01741222*M00010",
                "cable": "3m"
            },
            {
                "code": "01741222*M00007",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "01741222*M00009",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Maximum reach (mm)": "1783",
            "Repeatability (mm)": "±0.03",
            "Maximum Load (kg)": "25",
            "IP rating": "Body:IP65 \nWrist:IP67",
            "Max Speed J1 (°/s)": "190",
            "Max Speed J2 (°/s)": "175",
            "Max Speed J3 (°/s)": "200",
            "Max Speed J4 (°/s)": "400",
            "Max Speed J5 (°/s)": "360",
            "Max Speed J6 (°/s)": "610",
            "Max motion range J1 (°)": "±170",
            "Max motion range J2 (°)": "-155~+80",
            "Max motion range J3 (°)": "-75~+160",
            "Max motion range J4 (°)": "±180",
            "Max motion range J5 (°)": "±140",
            "Max motion range J6 (°)": "±360",
            "Allowed wrist torque J4 (N·m)": "50",
            "Allowed wrist torque J5 (N·m)": "50",
            "Allowed wrist torque J6 (N·m)": "30",
            "Allowed wrist inertia J4 (kg·m²)": "2.2",
            "Allowed wrist inertia J5 (kg·m²)": "2.2",
            "Allowed wrist inertia J6 (kg·m²)": "1.5",
            "Customer Wiring": "18 lines 30V 0.5A",
            "Customer Air": "Φ8 mm × 1 (0.59Mpa)",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (kg)": "255",
            "Controller": "IRCB501-6ND-INT",
            "Mounting mode": "Floor",
            "Certification": "Kcs, KC, CE, cSGSus, FCC, Safety"
        }
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
                "code": "01741098*M00017",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "350",
            "Arm length J1 (mm)": "175",
            "Arm length J2 (mm)": "175",
            "Max speed J1+J2 (mm/s)": "6180",
            "Max speed J3 (mm/s)": "1300",
            "Max speed J4 (°/s)": "2600",
            "Repeatability J1+J2 (mm)": "±0.01",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "2",
            "Maximum Load (kg)": "4",
            "J4 Permissible inertia Rated (kg·m²)": "0.005",
            "J4 Permissible inertia Max (kg·m²)": "0.05",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "18.5",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ4 mm x 1 \nΦ6 mm x 2",
            "Max motion range J1 (°)": "±225",
            "Max motion range J2 (°)": "±225",
            "Max motion range J3 (mm)": "150",
            "Max motion range J4 (°)": "±720",
            "Standard cycle time (s)": "0.306",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "KCs, KC, CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-CS4-40Z15S-INT",
        "name": "IR-CS4-40Z15S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "4",
            "Manipulator Length(mm)": "400",
            "Z axis Length(mm)": "150",
            "Clean Type": "No",
            "Ceiling Mount": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "400",
            "Arm length J1 (mm)": "225",
            "Arm length J2 (mm)": "175",
            "Max speed J1+J2 (mm/s)": "5900",
            "Max speed J3 (mm/s)": "1100",
            "Max speed J4 (°/s)": "2600",
            "Repeatability J1+J2 (mm)": "±0.015",
            "Repeatability J3 (mm)": "±0.015",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "1",
            "Maximum Load (kg)": "3",
            "J4 Permissible inertia Rated (kg·m²)": "0.005",
            "J4 Permissible inertia Max (kg·m²)": "0.05",
            "Cable Length": "Stand:3m\n(Option:5/10/15m)",
            "Weight (excluding cables) (kg)": "11.5",
            "Customer signal line": "-",
            "Customer air piping (0.59Mpa)": "-",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±141",
            "Max motion range J3 (mm)": "120",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.42",
            "Controller": "IRCB501-4AD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S4-40Z12C-INT",
        "name": "IR-S4-40Z12C-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "4",
            "Manipulator Length(mm)": "400",
            "Z axis Length(mm)": "120",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "400",
            "Arm length J1 (mm)": "225",
            "Arm length J2 (mm)": "175",
            "Maximum speed J1+J2 (mm/s)": "7200",
            "Maximum speed J3 (mm/s)": "1300",
            "Maximum speed J4 (°/s)": "2600",
            "Repeatability J1+J2 (mm)": "±0.01",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Load Rated (kg)": "2",
            "Load Maximum (kg)": "4",
            "J4 Permissible inertia Rated (kg·m²)": "0.005",
            "J4 Permissible inertia Max (kg·m²)": "0.05",
            "Cable Length": "Stand:3m Option:5/10/15m",
            "Weight (excluding cables) (kg)": "12",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ4 mm x 1 \nΦ6 mm x 2",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±141",
            "Max motion range J3 (mm)": "120",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.352",
            "Controller": "IRCB501-4AD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
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
                "code": "01741084*M00015",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "01741084*M00017",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "400",
            "Arm length J1 (mm)": "225",
            "Arm length J2 (mm)": "175",
            "Max speed J1+J2 (mm/s)": "7200",
            "Max speed J3 (mm/s)": "1300",
            "Max speed J4 (°/s)": "2600",
            "Repeatability J1+J2 (mm)": "±0.01",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "2",
            "Maximum Load (kg)": "4",
            "J4 Permissible inertia Rated (kg·m²)": "0.005",
            "J4 Permissible inertia Max (kg·m²)": "0.05",
            "Cable Length": "Stand:3m\n(Option:5/10/15m)",
            "Weight (excluding cables) (kg)": "12",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ4 mm x 1 \nΦ6 mm x 2",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±141",
            "Max motion range J3 (mm)": "150",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.342",
            "Controller": "IRCB501-4AD-INT",
            "Certification": "KCs, KC, CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
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
                "code": "01741097*M00010",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "550",
            "Arm length J1 (mm)": "275",
            "Arm length J2 (mm)": "275",
            "Max speed J1+J2 (mm/s)": "9712",
            "Max speed J3 (mm/s)": "1300",
            "Max speed J4 (°/s)": "2000",
            "Repeatability J1+J2 (mm)": "±0.015",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "2",
            "Maximum Load (kg)": "5",
            "J4 Permissible inertia Rated (kg·m²)": "0.01",
            "J4 Permissible inertia Max (kg·m²)": "0.12",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "20",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ4 mm x 1 \nΦ6 mm x 2",
            "Max motion range J1 (°)": "±225",
            "Max motion range J2 (°)": "±225",
            "Max motion range J3 (mm)": "150",
            "Max motion range J4 (°)": "±720",
            "Standard cycle time (s)": "0.351",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "KCs, KC, CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-CS7-50Z20S-INT",
        "name": "IR-CS7-50Z20S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "500",
            "Z axis Length(mm)": "200",
            "Clean Type": "No",
            "Ceiling Mount": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "500",
            "Arm length J1 (mm)": "225",
            "Arm length J2 (mm)": "275",
            "Max speed J1+J2 (mm/s)": "6000",
            "Max speed J3 (mm/s)": "1100",
            "Max speed J4 (°/s)": "2000",
            "Repeatability J1+J2 (mm)": "±0.02",
            "Repeatability J3 (mm)": "±0.015",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "2",
            "Maximum Load (kg)": "6",
            "J4 Permissible inertia Rated (kg·m²)": "0.01",
            "J4 Permissible inertia Max (kg·m²)": "0.12",
            "Cable Length": "Stand:3m\n(Option:5/10/15m)",
            "Weight (excluding cables) (kg)": "16.5",
            "Customer signal line": "-",
            "Customer air piping (0.59Mpa)": "-",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "170",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.4",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S7-50Z17C-INT",
        "name": "IR-S7-50Z17C-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "500",
            "Z axis Length(mm)": "170",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "500",
            "Arm length J1 (mm)": "225",
            "Arm length J2 (mm)": "275",
            "Maximum speed J1+J2 (mm/s)": "7120",
            "Maximum speed J3 (mm/s)": "1600",
            "Maximum speed J4 (°/s)": "2000",
            "Repeatability J1+J2 (mm)": "±0.02",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Load Rated (kg)": "3",
            "Load Maximum (kg)": "7",
            "J4 Permissible inertia Rated (kg·m²)": "0.01",
            "J4 Permissible inertia Max (kg·m²)": "0.12",
            "Cable Length": "Stand:3m Option:5/10/15m",
            "Weight (excluding cables) (kg)": "17",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ4 mm x 1 \nΦ6 mm x 2",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "170",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.37",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
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
                "code": "01741078*M00013",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "500",
            "Arm length J1 (mm)": "225",
            "Arm length J2 (mm)": "275",
            "Max speed J1+J2 (mm/s)": "7120",
            "Max speed J3 (mm/s)": "1600",
            "Max speed J4 (°/s)": "2000",
            "Repeatability J1+J2 (mm)": "±0.02",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "3",
            "Maximum Load (kg)": "7",
            "J4 Permissible inertia Rated (kg·m²)": "0.01",
            "J4 Permissible inertia Max (kg·m²)": "0.12",
            "Cable Length": "Stand:3m\n(Option:5/10/15m)",
            "Weight (excluding cables) (kg)": "17",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ4 mm x 1 \nΦ6 mm x 2",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "200",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.351",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "KCs, KC, CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-CS7-60Z20S-INT",
        "name": "IR-CS7-60Z20S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "600",
            "Z axis Length(mm)": "200",
            "Clean Type": "No",
            "Ceiling Mount": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "600",
            "Arm length J1 (mm)": "325",
            "Arm length J2 (mm)": "275",
            "Max speed J1+J2 (mm/s)": "6700",
            "Max speed J3 (mm/s)": "1100",
            "Max speed J4 (°/s)": "2000",
            "Repeatability J1+J2 (mm)": "±0.02",
            "Repeatability J3 (mm)": "±0.015",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "2",
            "Maximum Load (kg)": "6",
            "J4 Permissible inertia Rated (kg·m²)": "0.01",
            "J4 Permissible inertia Max (kg·m²)": "0.12",
            "Cable Length": "Stand:3m\n(Option:5/10/15m)",
            "Weight (excluding cables) (kg)": "17",
            "Customer signal line": "-",
            "Customer air piping (0.59Mpa)": "-",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "170",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.42",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S7-60Z17C-INT",
        "name": "IR-S7-60Z17C-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "600",
            "Z axis Length(mm)": "170",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "600",
            "Arm length J1 (mm)": "325",
            "Arm length J2 (mm)": "275",
            "Maximum speed J1+J2 (mm/s)": "7850",
            "Maximum speed J3 (mm/s)": "1600",
            "Maximum speed J4 (°/s)": "2000",
            "Repeatability J1+J2 (mm)": "±0.02",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Load Rated (kg)": "3",
            "Load Maximum (kg)": "7",
            "J4 Permissible inertia Rated (kg·m²)": "0.01",
            "J4 Permissible inertia Max (kg·m²)": "0.12",
            "Cable Length": "Stand:3m Option:5/10/15m",
            "Weight (excluding cables) (kg)": "17.5",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ4 mm x 1 \nΦ6 mm x 2",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "170",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.375",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
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
                "code": "01741079*M00014",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "600",
            "Arm length J1 (mm)": "325",
            "Arm length J2 (mm)": "275",
            "Max speed J1+J2 (mm/s)": "7850",
            "Max speed J3 (mm/s)": "1600",
            "Max speed J4 (°/s)": "2000",
            "Repeatability J1+J2 (mm)": "±0.02",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "3",
            "Maximum Load (kg)": "7",
            "J4 Permissible inertia Rated (kg·m²)": "0.01",
            "J4 Permissible inertia Max (kg·m²)": "0.12",
            "Cable Length": "Stand:3m\n(Option:5/10/15m)",
            "Weight (excluding cables) (kg)": "17.5",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ4 mm x 1 \nΦ6 mm x 2",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "200",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.36",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "KCs, KC, CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-CS7-70Z20S-INT",
        "name": "IR-CS7-70Z20S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "700",
            "Z axis Length(mm)": "200",
            "Clean Type": "No",
            "Ceiling Mount": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "700",
            "Arm length J1 (mm)": "425",
            "Arm length J2 (mm)": "275",
            "Max speed J1+J2 (mm/s)": "7300",
            "Max speed J3 (mm/s)": "1100",
            "Max speed J4 (°/s)": "2000",
            "Repeatability J1+J2 (mm)": "±0.02",
            "Repeatability J3 (mm)": "±0.015",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "2",
            "Maximum Load (kg)": "6",
            "J4 Permissible inertia Rated (kg·m²)": "0.01",
            "J4 Permissible inertia Max (kg·m²)": "0.12",
            "Cable Length": "Stand:3m\n(Option:5/10/15m)",
            "Weight (excluding cables) (kg)": "118.5",
            "Customer signal line": "-",
            "Customer air piping (0.59Mpa)": "-",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "170",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.44",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S7-70Z17C-INT",
        "name": "IR-S7-70Z17C-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "7",
            "Manipulator Length(mm)": "700",
            "Z axis Length(mm)": "170",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "700",
            "Arm length J1 (mm)": "425",
            "Arm length J2 (mm)": "275",
            "Maximum speed J1+J2 (mm/s)": "8590",
            "Maximum speed J3 (mm/s)": "1600",
            "Maximum speed J4 (°/s)": "2000",
            "Repeatability J1+J2 (mm)": "±0.02",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Load Rated (kg)": "3",
            "Load Maximum (kg)": "7",
            "J4 Permissible inertia Rated (kg·m²)": "0.01",
            "J4 Permissible inertia Max (kg·m²)": "0.12",
            "Cable Length": "Stand:3m Option:5/10/15m",
            "Weight (excluding cables) (kg)": "19",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ4 mm x 1 \nΦ6 mm x 2",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "170",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.385",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
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
                "code": "01741080*M00011",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "700",
            "Arm length J1 (mm)": "425",
            "Arm length J2 (mm)": "275",
            "Max speed J1+J2 (mm/s)": "8590",
            "Max speed J3 (mm/s)": "1600",
            "Max speed J4 (°/s)": "2000",
            "Repeatability J1+J2 (mm)": "±0.02",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "3",
            "Maximum Load (kg)": "7",
            "J4 Permissible inertia Rated (kg·m²)": "0.01",
            "J4 Permissible inertia Max (kg·m²)": "0.12",
            "Cable Length": "Stand:3m\n(Option:5/10/15m)",
            "Weight (excluding cables) (kg)": "19",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ4 mm x 1 \nΦ6 mm x 2",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "200",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.375",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "KCs, KC, CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-CS10-60Z20S-INT",
        "name": "IR-CS10-60Z20S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "600",
            "Z axis Length(mm)": "200",
            "Clean Type": "No",
            "Ceiling Mount": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "600",
            "Arm length J1 (mm)": "225",
            "Arm length J2 (mm)": "375",
            "Max speed J1+J2 (mm/s)": "7500",
            "Max speed J3 (mm/s)": "1100",
            "Max speed J4 (°/s)": "2700",
            "Repeatability J1+J2 (mm)": "±0.02",
            "Repeatability J3 (mm)": "±0.015",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "5",
            "Maximum Load (kg)": "10",
            "J4 Permissible inertia Rated (kg·m²)": "0.02",
            "J4 Permissible inertia Max (kg·m²)": "0.3",
            "Cable Length": "Stand:3m\n(Option:5/10/15m)",
            "Weight (excluding cables) (kg)": "18",
            "Customer signal line": "-",
            "Customer air piping (0.59Mpa)": "-",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "170",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.4",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S10-60Z17C-INT",
        "name": "IR-S10-60Z17C-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "600",
            "Z axis Length(mm)": "170",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "600",
            "Arm length J1 (mm)": "225",
            "Arm length J2 (mm)": "375",
            "Maximum speed J1+J2 (mm/s)": "9100",
            "Maximum speed J3 (mm/s)": "1600",
            "Maximum speed J4 (°/s)": "2700",
            "Repeatability J1+J2 (mm)": "±0.02",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Load Rated (kg)": "5",
            "Load Maximum (kg)": "10",
            "J4 Permissible inertia Rated (kg·m²)": "0.02",
            "J4 Permissible inertia Max (kg·m²)": "0.3",
            "Cable Length": "Stand:3m Option:5/10/15m",
            "Weight (excluding cables) (kg)": "18.5",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ4 mm x 1 \nΦ6 mm x 2",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "170",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.4",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
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
                "code": "01741081*M00010",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "600",
            "Arm length J1 (mm)": "225",
            "Arm length J2 (mm)": "375",
            "Max speed J1+J2 (mm/s)": "9100",
            "Max speed J3 (mm/s)": "1600",
            "Max speed J4 (°/s)": "2700",
            "Repeatability J1+J2 (mm)": "±0.02",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "5",
            "Maximum Load (kg)": "10",
            "J4 Permissible inertia Rated (kg·m²)": "0.02",
            "J4 Permissible inertia Max (kg·m²)": "0.3",
            "Cable Length": "Stand:3m\n(Option:5/10/15m)",
            "Weight (excluding cables) (kg)": "18.5",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ4 mm x 1 \nΦ6 mm x 2",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "200",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.361",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "KCs, KC, CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-CS10-70Z20S-INT",
        "name": "IR-CS10-70Z20S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "700",
            "Z axis Length(mm)": "200",
            "Clean Type": "No",
            "Ceiling Mount": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "700",
            "Arm length J1 (mm)": "325",
            "Arm length J2 (mm)": "375",
            "Max speed J1+J2 (mm/s)": "8100",
            "Max speed J3 (mm/s)": "1100",
            "Max speed J4 (°/s)": "2700",
            "Repeatability J1+J2 (mm)": "±0.02",
            "Repeatability J3 (mm)": "±0.015",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "5",
            "Maximum Load (kg)": "10",
            "J4 Permissible inertia Rated (kg·m²)": "0.02",
            "J4 Permissible inertia Max (kg·m²)": "0.3",
            "Cable Length": "Stand:3m\n(Option:5/10/15m)",
            "Weight (excluding cables) (kg)": "18.5",
            "Customer signal line": "-",
            "Customer air piping (0.59Mpa)": "-",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "170",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.43",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S10-70Z17C-INT",
        "name": "IR-S10-70Z17C-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "700",
            "Z axis Length(mm)": "170",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "700",
            "Arm length J1 (mm)": "325",
            "Arm length J2 (mm)": "375",
            "Maximum speed J1+J2 (mm/s)": "9800",
            "Maximum speed J3 (mm/s)": "1600",
            "Maximum speed J4 (°/s)": "2700",
            "Repeatability J1+J2 (mm)": "±0.02",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Load Rated (kg)": "5",
            "Load Maximum (kg)": "10",
            "J4 Permissible inertia Rated (kg·m²)": "0.02",
            "J4 Permissible inertia Max (kg·m²)": "0.3",
            "Cable Length": "Stand:3m Option:5/10/15m",
            "Weight (excluding cables) (kg)": "19",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ4 mm x 1 \nΦ6 mm x 2",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "170",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.416",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
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
                "code": "01741080*M00012",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "700",
            "Arm length J1 (mm)": "325",
            "Arm length J2 (mm)": "375",
            "Max speed J1+J2 (mm/s)": "9800",
            "Max speed J3 (mm/s)": "1600",
            "Max speed J4 (°/s)": "2700",
            "Repeatability J1+J2 (mm)": "±0.02",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "5",
            "Maximum Load (kg)": "10",
            "J4 Permissible inertia Rated (kg·m²)": "0.02",
            "J4 Permissible inertia Max (kg·m²)": "0.3",
            "Cable Length": "Stand:3m\n(Option:5/10/15m)",
            "Weight (excluding cables) (kg)": "19",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ4 mm x 1 \nΦ6 mm x 2",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "200",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.386",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "KCs, KC, CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-CS10-80Z20S-INT",
        "name": "IR-CS10-80Z20S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "800",
            "Z axis Length(mm)": "200",
            "Clean Type": "No",
            "Ceiling Mount": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "800",
            "Arm length J1 (mm)": "425",
            "Arm length J2 (mm)": "375",
            "Max speed J1+J2 (mm/s)": "9000",
            "Max speed J3 (mm/s)": "1100",
            "Max speed J4 (°/s)": "2700",
            "Repeatability J1+J2 (mm)": "±0.025",
            "Repeatability J3 (mm)": "±0.015",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "5",
            "Maximum Load (kg)": "10",
            "J4 Permissible inertia Rated (kg·m²)": "0.02",
            "J4 Permissible inertia Max (kg·m²)": "0.3",
            "Cable Length": "Stand:3m\n(Option:5/10/15m)",
            "Weight (excluding cables) (kg)": "20",
            "Customer signal line": "-",
            "Customer air piping (0.59Mpa)": "-",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "170",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.46",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S10-80Z17C-INT",
        "name": "IR-S10-80Z17C-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "10",
            "Manipulator Length(mm)": "800",
            "Z axis Length(mm)": "170",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "800",
            "Arm length J1 (mm)": "425",
            "Arm length J2 (mm)": "375",
            "Maximum speed J1+J2 (mm/s)": "10500",
            "Maximum speed J3 (mm/s)": "1600",
            "Maximum speed J4 (°/s)": "2700",
            "Repeatability J1+J2 (mm)": "±0.025",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Load Rated (kg)": "5",
            "Load Maximum (kg)": "10",
            "J4 Permissible inertia Rated (kg·m²)": "0.02",
            "J4 Permissible inertia Max (kg·m²)": "0.3",
            "Cable Length": "Stand:3m Option:5/10/15m",
            "Weight (excluding cables) (kg)": "20.5",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ6 mm x 2\nΦ8 mm x 2",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "170",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.43",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
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
                "code": "01741083*M00016",
                "cable": "3m (Default)"
            },
            {
                "code": "-",
                "cable": "5m"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "800",
            "Arm length J1 (mm)": "425",
            "Arm length J2 (mm)": "375",
            "Max speed J1+J2 (mm/s)": "10500",
            "Max speed J3 (mm/s)": "1600",
            "Max speed J4 (°/s)": "2700",
            "Repeatability J1+J2 (mm)": "±0.025",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "5",
            "Maximum Load (kg)": "10",
            "J4 Permissible inertia Rated (kg·m²)": "0.02",
            "J4 Permissible inertia Max (kg·m²)": "0.3",
            "Cable Length": "Stand:3m\n(Option:5/10/15m)",
            "Weight (excluding cables) (kg)": "20.5",
            "Customer signal line": "15 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ4 mm x 1 \nΦ6 mm x 2",
            "Max motion range J1 (°)": "±132",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "200",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.416",
            "Controller": "IRCB501-4CD-INT",
            "Certification": "KCs, KC, CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S25-80Z36C-INT",
        "name": "IR-S25-80Z36C-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "25",
            "Manipulator Length(mm)": "800",
            "Z axis Length(mm)": "360",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "-",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "800",
            "Arm length J1 (mm)": "350",
            "Arm length J2 (mm)": "450",
            "Maximum speed J1+J2 (mm/s)": "8100",
            "Maximum speed J3 (mm/s)": "2100",
            "Maximum speed J4 (°/s)": "705",
            "Repeatability J1+J2 (mm)": "±0.05",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Load Rated (kg)": "10",
            "Load Maximum (kg)": "25",
            "J4 Permissible inertia Rated (kg·m²)": "0.5",
            "J4 Permissible inertia Max (kg·m²)": "1.2",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "68.5",
            "Customer signal line": "25 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ6 mm x 2\nΦ8 mm x 2",
            "Max motion range J1 (°)": "±139",
            "Max motion range J2 (°)": "±151",
            "Max motion range J3 (mm)": "360",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.35",
            "Controller": "IRCB501-4ED-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S25-80Z42S-INT",
        "name": "IR-S25-80Z42S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "25",
            "Manipulator Length(mm)": "800",
            "Z axis Length(mm)": "420",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "01741435*M00001",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "800",
            "Arm length J1 (mm)": "350",
            "Arm length J2 (mm)": "450",
            "Max speed J1+J2 (mm/s)": "8100",
            "Max speed J3 (mm/s)": "2100",
            "Max speed J4 (°/s)": "705",
            "Repeatability J1+J2 (mm)": "±0.05",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "10",
            "Maximum Load (kg)": "25",
            "J4 Permissible inertia Rated (kg·m²)": "0.5",
            "J4 Permissible inertia Max (kg·m²)": "1.2",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "68.5",
            "Customer signal line": "25 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ6 mm x 2\nΦ8 mm x 2",
            "Max motion range J1 (°)": "±139",
            "Max motion range J2 (°)": "±151",
            "Max motion range J3 (mm)": "420",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.33",
            "Controller": "IRCB501-4ED-INT",
            "Certification": "KCs, KC, CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S25-100Z36C-INT",
        "name": "IR-S25-100Z36C-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "25",
            "Manipulator Length(mm)": "1000",
            "Z axis Length(mm)": "360",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "-",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "1000",
            "Arm length J1 (mm)": "550",
            "Arm length J2 (mm)": "450",
            "Maximum speed J1+J2 (mm/s)": "9400",
            "Maximum speed J3 (mm/s)": "2100",
            "Maximum speed J4 (°/s)": "705",
            "Repeatability J1+J2 (mm)": "±0.05",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Load Rated (kg)": "10",
            "Load Maximum (kg)": "25",
            "J4 Permissible inertia Rated (kg·m²)": "0.5",
            "J4 Permissible inertia Max (kg·m²)": "1.2",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "72.5",
            "Customer signal line": "25 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ6 mm x 2\nΦ8 mm x 2",
            "Max motion range J1 (°)": "±139",
            "Max motion range J2 (°)": "±151",
            "Max motion range J3 (mm)": "360",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.37",
            "Controller": "IRCB501-4ED-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S25-100Z42S-INT",
        "name": "IR-S25-100Z42S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "25",
            "Manipulator Length(mm)": "1000",
            "Z axis Length(mm)": "420",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "01741436*M00001",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "1000",
            "Arm length J1 (mm)": "550",
            "Arm length J2 (mm)": "450",
            "Max speed J1+J2 (mm/s)": "9400",
            "Max speed J3 (mm/s)": "2100",
            "Max speed J4 (°/s)": "705",
            "Repeatability J1+J2 (mm)": "±0.05",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "10",
            "Maximum Load (kg)": "25",
            "J4 Permissible inertia Rated (kg·m²)": "0.5",
            "J4 Permissible inertia Max (kg·m²)": "1.2",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "72.5",
            "Customer signal line": "25 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ6 mm x 2\nΦ8 mm x 2",
            "Max motion range J1 (°)": "±139",
            "Max motion range J2 (°)": "±151",
            "Max motion range J3 (mm)": "420",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.35",
            "Controller": "IRCB501-4ED-INT",
            "Certification": "KCs, KC, CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S25-120Z36C-INT",
        "name": "IR-S25-120Z36C-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "25",
            "Manipulator Length(mm)": "1200",
            "Z axis Length(mm)": "360",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "-",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "1200",
            "Arm length J1 (mm)": "750",
            "Arm length J2 (mm)": "450",
            "Maximum speed J1+J2 (mm/s)": "9400",
            "Maximum speed J3 (mm/s)": "1200",
            "Maximum speed J4 (°/s)": "705",
            "Repeatability J1+J2 (mm)": "±0.08",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Load Rated (kg)": "10",
            "Load Maximum (kg)": "25",
            "J4 Permissible inertia Rated (kg·m²)": "0.5",
            "J4 Permissible inertia Max (kg·m²)": "1.2",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "78",
            "Customer signal line": "25 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ6 mm x 2\nΦ8 mm x 2",
            "Max motion range J1 (°)": "±139",
            "Max motion range J2 (°)": "±151",
            "Max motion range J3 (mm)": "360",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.42",
            "Controller": "IRCB501-4ED-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S25-120Z42S-INT",
        "name": "IR-S25-120Z42S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "25",
            "Manipulator Length(mm)": "1200",
            "Z axis Length(mm)": "420",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "01741364",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "1200",
            "Arm length J1 (mm)": "750",
            "Arm length J2 (mm)": "450",
            "Max speed J1+J2 (mm/s)": "9400",
            "Max speed J3 (mm/s)": "1200",
            "Max speed J4 (°/s)": "705",
            "Repeatability J1+J2 (mm)": "±0.08",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "10",
            "Maximum Load (kg)": "25",
            "J4 Permissible inertia Rated (kg·m²)": "0.5",
            "J4 Permissible inertia Max (kg·m²)": "1.2",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "78",
            "Customer signal line": "25 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ6 mm x 2\nΦ8 mm x 2",
            "Max motion range J1 (°)": "±139",
            "Max motion range J2 (°)": "±151",
            "Max motion range J3 (mm)": "420",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.4",
            "Controller": "IRCB501-4ED-INT",
            "Certification": "KCs, KC, CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S35-80Z35C-INT",
        "name": "IR-S35-80Z35C-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "35",
            "Manipulator Length(mm)": "800",
            "Z axis Length(mm)": "350",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "-",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "800",
            "Arm length J1 (mm)": "350",
            "Arm length J2 (mm)": "450",
            "Maximum speed J1+J2 (mm/s)": "8100",
            "Maximum speed J3 (mm/s)": "2100",
            "Maximum speed J4 (°/s)": "705",
            "Repeatability J1+J2 (mm)": "±0.05",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Load Rated (kg)": "20",
            "Load Maximum (kg)": "35",
            "J4 Permissible inertia Rated (kg·m²)": "0.6",
            "J4 Permissible inertia Max (kg·m²)": "1.2",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "70.5",
            "Customer signal line": "25 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ6 mm x 2\nΦ8 mm x 2",
            "Max motion range J1 (°)": "±139",
            "Max motion range J2 (°)": "±151",
            "Max motion range J3 (mm)": "350",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.33",
            "Controller": "IRCB501-4ED-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
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
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "01741332*M00002",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "800",
            "Arm length J1 (mm)": "350",
            "Arm length J2 (mm)": "450",
            "Max speed J1+J2 (mm/s)": "8100",
            "Max speed J3 (mm/s)": "2100",
            "Max speed J4 (°/s)": "705",
            "Repeatability J1+J2 (mm)": "±0.05",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "20",
            "Maximum Load (kg)": "35",
            "J4 Permissible inertia Rated (kg·m²)": "0.6",
            "J4 Permissible inertia Max (kg·m²)": "1.2",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "70.5",
            "Customer signal line": "25 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ6 mm x 2\nΦ8 mm x 2",
            "Max motion range J1 (°)": "±139",
            "Max motion range J2 (°)": "±151",
            "Max motion range J3 (mm)": "420",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.31",
            "Controller": "IRCB501-4ED-INT",
            "Certification": "KCs, KC, CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S35-100Z35C-INT",
        "name": "IR-S35-100Z35C-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "35",
            "Manipulator Length(mm)": "1000",
            "Z axis Length(mm)": "350",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "1000",
            "Arm length J1 (mm)": "550",
            "Arm length J2 (mm)": "450",
            "Maximum speed J1+J2 (mm/s)": "9400",
            "Maximum speed J3 (mm/s)": "2100",
            "Maximum speed J4 (°/s)": "705",
            "Repeatability J1+J2 (mm)": "±0.05",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Load Rated (kg)": "20",
            "Load Maximum (kg)": "35",
            "J4 Permissible inertia Rated (kg·m²)": "0.6",
            "J4 Permissible inertia Max (kg·m²)": "1.2",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "74.5",
            "Customer signal line": "25 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ6 mm x 2\nΦ8 mm x 2",
            "Max motion range J1 (°)": "±139",
            "Max motion range J2 (°)": "±151",
            "Max motion range J3 (mm)": "350",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.35",
            "Controller": "IRCB501-4ED-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
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
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "01741332*M00003",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            },
            {
                "code": "01741363",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "1000",
            "Arm length J1 (mm)": "550",
            "Arm length J2 (mm)": "450",
            "Max speed J1+J2 (mm/s)": "9400",
            "Max speed J3 (mm/s)": "2100",
            "Max speed J4 (°/s)": "705",
            "Repeatability J1+J2 (mm)": "±0.05",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "20",
            "Maximum Load (kg)": "35",
            "J4 Permissible inertia Rated (kg·m²)": "0.6",
            "J4 Permissible inertia Max (kg·m²)": "1.2",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "74.5",
            "Customer signal line": "25 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ6 mm x 2\nΦ8 mm x 2",
            "Max motion range J1 (°)": "±139",
            "Max motion range J2 (°)": "±151",
            "Max motion range J3 (mm)": "420",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.33",
            "Controller": "IRCB501-4ED-INT",
            "Certification": "KCs, KC, CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S35-120Z35C-INT",
        "name": "IR-S35-120Z35C-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "35",
            "Manipulator Length(mm)": "1200",
            "Z axis Length(mm)": "350",
            "Clean Type": "Yes"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "1200",
            "Arm length J1 (mm)": "750",
            "Arm length J2 (mm)": "450",
            "Maximum speed J1+J2 (mm/s)": "9400",
            "Maximum speed J3 (mm/s)": "1200",
            "Maximum speed J4 (°/s)": "705",
            "Repeatability J1+J2 (mm)": "±0.08",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Load Rated (kg)": "20",
            "Load Maximum (kg)": "35",
            "J4 Permissible inertia Rated (kg·m²)": "0.6",
            "J4 Permissible inertia Max (kg·m²)": "1.2",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "80.5",
            "Customer signal line": "25 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ6 mm x 2\nΦ8 mm x 2",
            "Max motion range J1 (°)": "±139",
            "Max motion range J2 (°)": "±151",
            "Max motion range J3 (mm)": "350",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.44",
            "Controller": "IRCB501-4ED-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S35-120Z42S-INT",
        "name": "IR-S35-120Z42S-INT",
        "image": "robot.png",
        "specs": {
            "Type": "SCARA",
            "Payload(kg)": "35",
            "Manipulator Length(mm)": "1200",
            "Z axis Length(mm)": "420",
            "Clean Type": "No"
        },
        "cables": [
            {
                "code": "-",
                "cable": "3m"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "1200",
            "Arm length J1 (mm)": "750",
            "Arm length J2 (mm)": "450",
            "Max speed J1+J2 (mm/s)": "9400",
            "Max speed J3 (mm/s)": "1200",
            "Max speed J4 (°/s)": "705",
            "Repeatability J1+J2 (mm)": "±0.08",
            "Repeatability J3 (mm)": "±0.01",
            "Repeatability J4 (°)": "±0.01",
            "Rated Load (kg)": "20",
            "Maximum Load (kg)": "35",
            "J4 Permissible inertia Rated (kg·m²)": "0.6",
            "J4 Permissible inertia Max (kg·m²)": "1.2",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "80.5",
            "Customer signal line": "25 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ6 mm x 2\nΦ8 mm x 2",
            "Max motion range J1 (°)": "±139",
            "Max motion range J2 (°)": "±151",
            "Max motion range J3 (mm)": "420",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.42",
            "Controller": "IRCB501-4ED-INT",
            "Certification": "KCs, KC, CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
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
                "code": "01741367*M00002",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "3m"
            },
            {
                "code": "01741340*M00003",
                "cable": "5m (Default)"
            },
            {
                "code": "-",
                "cable": "10m"
            },
            {
                "code": "-",
                "cable": "15m"
            },
            {
                "code": "-",
                "cable": "3m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "5m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "10m（High flex cables）"
            },
            {
                "code": "-",
                "cable": "15m（High flex cables）"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "1200",
            "Arm length J1 (mm)": "600",
            "Arm length J2 (mm)": "600",
            "Max speed J1+J2 (mm/s)": "7400",
            "Max speed J3 (mm/s)": "1500",
            "Max speed J4 (°/s)": "600",
            "Repeatability J1+J2 (mm)": "±0.05",
            "Repeatability J3 (mm)": "±0.02",
            "Repeatability J4 (°)": "±0.005",
            "Rated Load (kg)": "30",
            "Maximum Load (kg)": "60",
            "J4 Permissible inertia Rated (kg·m²)": "1.2",
            "J4 Permissible inertia Max (kg·m²)": "2.45",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "136",
            "Customer signal line": "25 lines 30V 0.5A\nRJ45 (Cat 5e)",
            "Customer air piping (0.59Mpa)": "Φ6 mm x 2\nΦ8 mm x 2",
            "Max motion range J1 (°)": "±135",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "400",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.67",
            "Controller": "IRCB501-4MD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    },
    {
        "id": "IR-S60-120Z40S-INT",
        "name": "IR-S60-120Z40S-INT",
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
                "code": "-",
                "cable": "3m"
            }
        ],
        "detailSpecs": {
            "Arm length J1+J2 (mm)": "1200",
            "Arm length J1 (mm)": "600",
            "Arm length J2 (mm)": "600",
            "Max speed J1+J2 (mm/s)": "7400",
            "Max speed J3 (mm/s)": "1500",
            "Max speed J4 (°/s)": "600",
            "Repeatability J1+J2 (mm)": "±0.05",
            "Repeatability J3 (mm)": "±0.02",
            "Repeatability J4 (°)": "±0.005",
            "Rated Load (kg)": "30",
            "Maximum Load (kg)": "60",
            "J4 Permissible inertia Rated (kg·m²)": "1.2",
            "J4 Permissible inertia Max (kg·m²)": "2.45",
            "Cable Length": "Stand:5m\n(Option:3/10/15m)",
            "Weight (excluding cables) (kg)": "136",
            "Customer signal line": "25 lines 30V 0.5A\nRJ45 (Cat.5e)",
            "Customer air piping (0.59Mpa)": "Φ6 mm x 2\nΦ8 mm x 2",
            "Max motion range J1 (°)": "±135",
            "Max motion range J2 (°)": "±150",
            "Max motion range J3 (mm)": "400",
            "Max motion range J4 (°)": "±360",
            "Standard cycle time (s)": "0.84",
            "Controller": "IRCB501-4MD-INT",
            "Certification": "CE, cSGSus, FCC, Safety",
            "IP rating": "IP20"
        }
    }
];

const accessoriesList = [
    {
        "code": "15051627",
        "type": "Cable & Connector",
        "name": "Robot arm I/O cable",
        "description": "8 pin, 90° connector, Flexible cable",
        "spec": "2m",
        "target_models": "R4H, R7H, R10H"
    },
    {
        "code": "15050817",
        "type": "Cable & Connector",
        "name": "Robot arm I/O cable",
        "description": "12 pin, 90° connector, Flexible cable",
        "spec": "1m",
        "target_models": "R4, R4H, R10-110, R11"
    },
    {
        "code": "1504WU81",
        "type": "Cable & Connector",
        "name": "Robot arm I/O cable",
        "description": "12 pin, 90° connector, Flexible cable",
        "spec": "2m",
        "target_models": "R4, R4H, R10-110, R11"
    },
    {
        "code": "15051387",
        "type": "Cable & Connector",
        "name": "Robot arm I/O cable",
        "description": "17 pin, 90° connector, Flexible cable",
        "spec": "1m",
        "target_models": "R7H, R10H"
    },
    {
        "code": "15310429",
        "type": "Cable & Connector",
        "name": "Robot arm I/O cable",
        "description": "17 pin, 90° connector, Flexible cable",
        "spec": "2m",
        "target_models": "R7H, R10H"
    },
    {
        "code": "15050930",
        "type": "Connector",
        "name": "Robot arm I/O cable",
        "description": "19pin, 90° connector only",
        "spec": "-",
        "target_models": "R10-140, R16, R25"
    },
    {
        "code": "15051215",
        "type": "Cable & Connector",
        "name": "Robot arm I/O cable",
        "description": "19pin, 90° connector, Flexible cable",
        "spec": "1.5m",
        "target_models": "R10-140, R16, R25"
    },
    {
        "code": "1504WU82",
        "type": "Cable & Connector",
        "name": "Robot arm I/O cable",
        "description": "19pin, 90° connector, Flexible cable",
        "spec": "3m",
        "target_models": "R10-140, R16, R25"
    },
    {
        "code": "1504WW97",
        "type": "Cable & Connector",
        "name": "Robot arm I/O cable",
        "description": "19pin, 90° connector, Flexible cable",
        "spec": "5m",
        "target_models": "R10-140, R16, R25"
    },
    {
        "code": "15310427",
        "type": "Cable & Connector",
        "name": "Robot Body I/O cable",
        "description": "8 pin, 180° connector, Flexible cable",
        "spec": "5m",
        "target_models": "R4H, R7H, R10H"
    },
    {
        "code": "15310428",
        "type": "Cable & Connector",
        "name": "Robot Body I/O cable",
        "description": "8 pin, 180° connector, Flexible cable",
        "spec": "10m",
        "target_models": "R4H, R7H, R10H"
    },
    {
        "code": "1504WN06",
        "type": "Cable & Connector",
        "name": "Robot Body I/O cable",
        "description": "8 pin, 180° connector, Non-Flexible cable",
        "spec": "10m",
        "target_models": "R4H, R7H, R10H"
    },
    {
        "code": "1504B978",
        "type": "Cable & Connector",
        "name": "Robot Body I/O cable",
        "description": "19 pin, 180° connector, Non-Flexible cable",
        "spec": "5m",
        "target_models": "R4, R4H, R7H, R10(All), R11, R16, R25"
    },
    {
        "code": "1504RP67",
        "type": "Cable & Connector",
        "name": "Robot Body I/O cable",
        "description": "19 pin, 180° connector, Flexible cable",
        "spec": "5m",
        "target_models": "R4, R4H, R7H, R10(All), R11, R16, R25"
    },
    {
        "code": "1504RP68",
        "type": "Cable & Connector",
        "name": "Robot Body I/O cable",
        "description": "19 pin, 180° connector, Flexible cable",
        "spec": "10m",
        "target_models": "R4, R4H, R7H, R10(All), R11, R16, R25"
    },
    {
        "code": "1504RP69",
        "type": "Cable & Connector",
        "name": "Robot Body I/O cable",
        "description": "19 pin, 180° connector, Flexible cable",
        "spec": "15m",
        "target_models": "R4, R4H, R7H, R10(All), R11, R16, R25"
    },
    {
        "code": "1504NN47",
        "type": "Connector",
        "name": "Robot body RJ45 port",
        "description": "8pin connector to RJ45 adapter",
        "spec": "-",
        "target_models": "R4H, R7H, R10H"
    },
    {
        "code": "01660004",
        "type": "break box",
        "name": "Handheld motor break release box",
        "description": "Used to manually release the break of the robot in emergencies",
        "spec": "-",
        "target_models": "R10-140, R16, R25"
    },
    {
        "code": "32020626",
        "type": "Zeroing tool",
        "name": "Homing J4 pin 1",
        "description": "Zero position calibration (pin 1, pin 2, block Set)",
        "spec": "-",
        "target_models": "S4, S7, S10, TS4, TS5"
    },
    {
        "code": "32020627",
        "type": "Zeroing tool",
        "name": "Homing J4 pin 2",
        "description": "Zero position calibration (pin 1, pin 2, block Set)",
        "spec": "-",
        "target_models": "S4, S7, S10, TS4, TS5"
    },
    {
        "code": "32040084",
        "type": "Zeroing tool",
        "name": "Homing J3 block",
        "description": "Zero position calibration (pin 1, pin 2, block Set)",
        "spec": "-",
        "target_models": "S4, S7, S10, TS4, TS5"
    },
    {
        "code": "01660018",
        "type": "Zeroing tool",
        "name": "Homing tool",
        "description": "Zero position calibration",
        "spec": "-",
        "target_models": "R4, R4H, R7H, R10H, R10-110, R11"
    },
    {
        "code": "01660015",
        "type": "Zeroing tool",
        "name": "Homing tool",
        "description": "Zero position calibration",
        "spec": "-",
        "target_models": "R10-140, R16, R25"
    },
    {
        "code": "01640055",
        "type": "Pendant",
        "name": "IR-TP200-L5-INT",
        "description": "Robot teach pendant",
        "spec": "5m",
        "target_models": "All"
    },
    {
        "code": "01640056",
        "type": "Pendant",
        "name": "IR-TP200-L10-INT",
        "description": "Robot teach pendant",
        "spec": "10m",
        "target_models": "All"
    },
    {
        "code": "01640057",
        "type": "Pendant",
        "name": "IR-TP200-L20-INT",
        "description": "Robot teach pendant",
        "spec": "20m",
        "target_models": "All"
    },
    {
        "code": "01640058",
        "type": "Pendant",
        "name": "IR-TP200-L30-INT",
        "description": "Robot teach pendant",
        "spec": "30m",
        "target_models": "All"
    },
    {
        "code": "1504R444",
        "type": "Cable & Connector",
        "name": "IR-TP200 Teach Pendant Extension Cable",
        "description": "Robot teach pendant Extension Cable",
        "spec": "5m",
        "target_models": "All"
    },
    {
        "code": "1504R445",
        "type": "Cable & Connector",
        "name": "IR-TP200 Teach Pendant Extension Cable",
        "description": "Robot teach pendant Extension Cable",
        "spec": "15m",
        "target_models": "All"
    },
    {
        "code": "1504R446",
        "type": "Cable & Connector",
        "name": "IR-TP200 Teach Pendant Extension Cable",
        "description": "Robot teach pendant Extension Cable",
        "spec": "25m",
        "target_models": "All"
    },
    {
        "code": "1504R443",
        "type": "connector",
        "name": "Pendant connector adapter",
        "description": "TP2.0 adapter to old version IRCB501controller",
        "spec": "-",
        "target_models": "All"
    },
    {
        "code": "98051002",
        "type": "Encoder Battery",
        "name": "Encoder Battery",
        "description": "Encoder Battery",
        "spec": "-",
        "target_models": "All"
    },
    {
        "code": "72100539",
        "type": "Software",
        "name": "Robot Simulation Software Dongle",
        "description": "Robot simulation software USB Flash Drive (InoRobotStudio)",
        "spec": "-",
        "target_models": "All"
    },
    {
        "code": "98070385",
        "type": "Telescopic Cover",
        "name": "Upper Telescopic Cover",
        "description": "J3 Upper Cover (IR-S4-Z12C)",
        "spec": "-",
        "target_models": "S4C"
    },
    {
        "code": "98070386",
        "type": "Telescopic Cover",
        "name": "Lower Telescopic Cover",
        "description": "J3 Lower Cover (IR-S4-Z12C)",
        "spec": "-",
        "target_models": "S4C"
    },
    {
        "code": "98070355",
        "type": "Telescopic Cover",
        "name": "Upper Telescopic Cover",
        "description": "J3 Upper Cover (IR-S7/10-Z17C)",
        "spec": "-",
        "target_models": "S7C, S10C"
    },
    {
        "code": "98070354",
        "type": "Telescopic Cover",
        "name": "Lower Telescopic Cover",
        "description": "J3 Lower Cover (IR-S7/10-Z17C)",
        "spec": "-",
        "target_models": "S7C, S10C"
    },
    {
        "code": "98051249",
        "type": "Pendant dummy Plug",
        "name": "TP E-stop dummy Plug for 1.0 TP Connector",
        "description": "Teach Pendant dummy Plug for 1.0 TP Connector",
        "spec": "-",
        "target_models": "All"
    },
    {
        "code": "98051250",
        "type": "Pendant dummy Plug",
        "name": "TP E-stop dummy Plug for 2.0 TP Connector",
        "description": "Teach Pendant dummy Plug for 2.0 TP Connector",
        "spec": "-",
        "target_models": "All"
    },
    {
        "code": "01660006",
        "type": "Fork lift tool",
        "name": "Fork lift tool for robots",
        "description": "Used by the fork lift for handling",
        "spec": "-",
        "target_models": "R10-140, R16, R25"
    }
];
