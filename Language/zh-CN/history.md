# InoRobot Assistant 更新记录

本文记录主页各功能卡片中用户可见的新增功能、资料更新、显示变更与问题修复。

## Robot Model Select

### Ver 26.06.19.01

- 添加带急停保护罩的 IR-TP200 示教器。
- 添加保护罩型示教器订购代码：5 m 01640069、10 m 01640072、15 m 01640073。
- 示教器选择调整为未选择 / 无保护罩 / 有保护罩。
- 结果与 PDF 现在显示保护罩、长度及订购代码。

### Ver 26.06.15.01

- 添加 IR-S7-60Z20S-INT 5 m 电缆订购代码 01741079*M00018。

### Ver 26.06.02.01

- 无 KCs 认证的 SCARA 型号预计交期改为 10 周。

### Ver 26.06.01.02

- 型号由 IR-R15H-145S-INT 更名为 IR-R15H-145S-K-INT。
- 型号由 IR-R20H-120S-INT 更名为 IR-R20H-120S-K-INT。
- 添加 IR-R15H IP67 型订购代码 01741446。
- 添加 IR-R20H IP67 型订购代码 01741597。
- 添加 IR-S25-100Z42S-INT 3 m 电缆订购代码 01741436*M00002。
- 添加 IR-S60-120Z40S-INT 订购代码：5 m 01741367*M00002、15 m 01741367*M00003。
- 修复 R15H、R20H 型号代码变更后无法找到原 CAD 文件的问题。

### Ver 26.06.01.01

- 添加 IR-R10-140S-INT 3 m 电缆订购代码 01741086*M00008。

### Ver 26.05.29.01

- 为六轴机器人添加标准型、洁净型和 IP67 型机身选项。
- R10-140、R16、R25 仅显示固定规格 Body IP65 / Wrist IP67。
- R15H、R20H 洁净型显示 ISO Class 4，其他六轴洁净型显示 ISO Class 3。
- 选择机身选项时，型号中的 S/C/P 代码和 PDF 文件名同步更新。
- 修复 R16、R25 等使用 _CN 或 _3D_CN 文件名的型号无法下载 CAD 的问题。
- 恢复轴速度与运动范围中的 °、°/s、mm、mm/s 单位。
- 恢复详情和 PDF 中质量 kg 与重复定位精度 mm 单位。
- 移除 IR-S35-80Z42S-INT 上错误显示的 KC、KCs 认证。
- 从筛选和搜索结果中排除尚未发布的 IR-CS 型号。
- 隐藏 R10-140、R16、R25 不支持的 Handheld Motor Brake Release Box 选项。

### Ver 26.05.22.01

- 将 IR-R4H、R7H-70、R7H-90、R10H、R15H、R20H 的 Clean Type 从 Yes 修正为 No。
- 上述六轴型号的洁净规格改为可选项，而非默认规格。
- SCARA 洁净型预计交期改为 6 个月。
- 修复 R16、R25 型号代码与 CAD 文件夹名不同时 CAD 按钮不可用的问题。
- CAD 按钮文字统一为 Checking / CAD Download / CAD Not Ready / Preparing。

### Ver 26.04.17.01

- 修正 IR-S25-120 标准型与洁净型数据互换的问题。
- 修正 IR-S35-100、120 各版本的型号名、臂长、Z 轴行程、质量、循环时间及认证信息关联。
- 添加 IR-S25-120Z42S-INT 与 IR-S35-120Z42S-INT 的 2D DWG、3D STP 和 FBX 文件。
- 修正 R15H、R20H 在 PDF 中显示错误 IP 等级的问题。

### Ver 26.04.12.01

- 在型号详情中添加建议断路器容量。
- 显示规格：R4/R7H 10 A、R10/R11 15 A、R10-140 20 A、R16/R25 30 A、S25 15 A、S35/S60 20 A。

### Ver 26.03.31.02

- 示教器、Arm I/O、Body I/O 和通信扩展选项的订购代码改用橙色徽标显示。
- IR-TP200 延长电缆名称直接显示 5 m、15 m、25 m 长度。

## Robot 3D Viewer

### Ver 26.07.12.01

- 修复 R16、R25 型号显示尺寸过小的问题。

### Ver 26.06.02.01

- 型号由 IR-R15H-145S-INT 更名为 IR-R15H-145S-K-INT。
- 型号由 IR-R20H-120S-INT 更名为 IR-R20H-120S-K-INT。
- 修复选择 -S-K-INT 型号时无法找到已有 -S-INT CAD 文件的问题。

### Ver 26.05.29.01

- 修复 R16、R25 等以 _CN 或 _3D_CN 保存的 CAD 文件未包含在 ZIP 中的问题。
- 无 _2D.dwg 文件时改为下载 _3D_CN.dwg。

### Ver 26.04.17.01

- 添加 IR-S25-120Z42S-INT 与 IR-S35-120Z42S-INT 的 3D 模型。
- 修正 IR-S25-120 与 IR-S35-120 显示方向相反的问题。
- 修正 Robot Model Select 传入的初始旋转值。

### Ver 26.03.31.01

- 支持使用 Delete 或 Backspace 单独删除模型。
- 支持显示或隐藏移动、旋转和缩放控制柄。

## Robot Tool Selector

### Ver 26.04.26.01

- 质量、重心坐标和转动惯量输入的默认值全部改为 0。
- 块体转动惯量改为按整体 CoG 计算。
- 移除 Mode B 中块体自身惯量与平行轴定理的重复应用。
- 添加或删除块体时不再重置已有输入。
- 总质量为 0 kg 时不再显示 NaN。
- CoM、COM 统一标记为 CoG。
- 转动惯量结果显示到小数点后三位。
- 添加说明 Tool Block CoG 输入坐标的参考图。

## Project Generator

### Ver 26.07.12.01

- 在 Save 后添加 Break;，使循环和 Teach mode 正确结束。

### Ver 26.06.19.01

- Teaching Offset X、Y、Z、A、B、C 显示数据格式 2 Word /10000。

### Ver 26.06.15.01

- Teaching Mode、Wait Position、Process Busy 默认启用。
- Teaching Mode 新增下一位置、上一位置、Offset 位置移动和保存当前位置功能。
- Wait Position 与 Work Position 分别使用 Start、Complete、Busy 状态。
- 修正 Vision Offset 与 Process Offset 同时使用时的应用顺序。
- 防止 Vision Offset 与 Process Offset 重复应用。
- 修正从其他工序返回 Wait 或 Work 位置时的错误路径。
- 移除 SCARA 项目中不存在的 J5、J6 扭矩项。
- 项目内 IO Map 替换为 InoRobot_IO_Map_0614.xlsx。
- Remote IO Mapping 更新为最新 Process Wait、Work、Busy、Teaching 配置。
- 修正 Multi Recipe 说明中的 Point File 切换地址。
- 帮助文字和时序图信号名称与实际生成结果保持一致。

### Ver 26.05.20.01

- 未选择 Teaching Mode 时不再生成 Teaching 条件。

### Ver 26.04.10.01

- 移除特定选项组合中阻止工序启动的无关条件。

### Ver 26.04.07

- 添加项目选项详细说明按钮和工具提示。
- 添加包含 IO 时序图的使用指南。
- 防止 Vision Offset 工具提示被表格遮挡。
- 修正 Teaching Mode 时序图中的信号与波形位置。
- 对齐时序图标题、标签和波形间距，并统一用竖线表示信号变化。

### Ver 26.04.02

- 添加 Labels、Remote IO、P.pts、User Warning 文件的表格预览。
- 可直接在页面编辑 Labels、User Warning 与 P.pts 数据。
- Labels 中修改的名称会反映到所有程序预览。
- 文件选择器按 Main、Static Task、Sub Program、Process、Data File 分组。

## Software

### Ver 26.06.19.01

- InoRobotLab 从 V4R24C4SPC18 更新至 V4R24C4SPC21。
- InoRobotTP 从 V4R24C4SPC18 更新至 V4R24C4SPC21。
- InoRobotLab 下载容量更新为安装版 470 MB、便携版 473 MB。

### Ver 26.06.06.01

- InoRobotLab 从 V4R24C4SPC17 更新至 V4R24C4SPC18。
- InoRobotTP 从 V4R24C4SPC17 更新至 V4R24C4SPC18。
- 移除 SPC15、SPC17 下载，仅显示 SPC18。

### Ver 26.05.14.01

- Display 版 InoRobotLab 与 InoRobotTP 替换为 V4R24C4SPC0L18F121。
- 禁用未提供的 Display 版 InoRobotLab 安装按钮。
- 添加 Display 用 InoRobotLab 便携版 454 MB 与 InoRobotTP 57 MB 下载。

### Ver 26.04.17.01

- 添加 InoRobotLab V4R24C4SPC17 安装版与便携版下载。
- 添加 InoRobotTP V4R24C4SPC17 下载。

## Document

### Ver 26.06.23.01

- 在硬件手册中添加 Safety Function 标签页。
- 将 Robot System Safety Function Guide.PDF 注册为 Safety Function 手册。
- INOVANCE ROBOT Selection Guide.pdf 与 INOVANCE ROBOT Selection Leaflet.pdf 替换为最新文件。

### Ver 26.06.19.01

- 主页卡片名称由 Manual 更改为 Document。
- 卡片说明更新为机器人手册、培训资料、证书、通信配置文件的查看与下载。

### Ver 26.06.15.01

- 添加 EtherCAT v1.0.1、PROFINET V2.35、EtherNet/IP V4.5 通信配置文件。
- 添加共 83 份证书：CE 10、Clean 4、cSGSus 4、FCC 2、Functional Safety 2、KCs 59、MTBF 2。
- 添加 CE、Clean、cSGSus、FCC、Functional Safety、KCs、MTBF 证书筛选。
- 文档搜索除标题和说明外，现也包含实际文件名与路径。

### Ver 26.06.01.01

- 替换入门课程 2. Robot Basics 的 INT 与 Display 培训 PDF。

### Ver 26.05.14.01

- 添加 IR-S25&S35、IR-S60&GS60、IR-R15H&R20H 用户手册。
- 添加 Input IO、NPN Output IO、Encoder、Functional Safety、IR-LINK、PROFINET 扩展卡手册。
- 添加 Expansion Card 与 Selection Guide 文档筛选。

### Ver 26.04.26.01

- R25/R16 手册由 IR-R25&R16 更名为 IR-R25&16，并替换为最新 PDF。

### Ver 26.04.12.01

- 替换入门课程 1. Robot Introduction 的 INT 与 Display 培训 PDF。

### Ver 26.04.10.01

- 添加 Application Level 培训分类。
- 添加 API 培训 PDF 与练习用 API.zip。

### Ver 26.04.07.01

- 添加 InoRobotLab、变量、主要命令、主要设置、Socket 通信和 Fieldbus 通信入门资料。
- 添加 Display 培训专用 For Display 筛选。
- 文档操作拆分为预览与下载。

## Debugging Tool

### Ver 26.07.15.01

- InoRobot Trace 从 V1.2 更新至 V1.3。
- Trace 添加 Joint Speed J1 至 J6 通道。
- 修复 InoRobot Trace 连接虚拟控制器时 Joint Speed 通道不可用的问题。

### Ver 26.06.19.01

- InoRobot Label Generator 从 V2.0 更新至 V2.1。

### Ver 26.06.15.01

- Communication Tester 从 V2.5 更新至 V2.6。
- InoRobot Trace 从 V1.1 更新至 V1.2。

### Ver 26.06.10.01

- Communication Tester 从 V2.4 更新至 V2.5。
- 移除旧版 Communication Tester V2.3 可执行文件和 ZIP。

### Ver 26.05.18.01

- InoRobot Trace 从 V1.0 更新至 V1.1。

### Ver 26.04.26.01

- Communication Tester 从 V2.3 更新至 V2.4。
- 添加 InoRobot Trace V1.0 下载。
- 添加 InoRobot Label Generator V2.0 下载。
- Project Compare 从 V2.0 更新至 V2.1。

### Ver 26.04.13.01

- Communication Tester 从 V2.2 更新至 V2.3。
- 修复下载 ZIP 时返回 Git LFS 指针文件的问题。

### Ver 26.04.07.01

- 在 Zero Calibration 网页计算器中添加离线 Excel 下载按钮。

### Ver 26.04.02

- 添加 Communication Tester V2.2 下载。
- 添加 Project Compare V2.0 下载。
