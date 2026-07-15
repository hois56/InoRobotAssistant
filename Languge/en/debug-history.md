# Debugging Tool Version History

## communicationTester

### Ver 2.6 (2026.06.15)

- **[Changed]** Redesigned the default HMI screen for the standardized program changes.
- **[Changed]** Embedded the latest default HMI so no separate file is required.
- **[Improved]** The embedded default HMI is applied automatically at startup.

### Ver 2.5 (2026.06.10)

- **[New]** Added a scripting system to HMI Code Block.
- **[Added]** Added If / ElseIf / Else / EndIf conditions.
- **[Added]** Added logical, comparison, and arithmetic operators plus Delay.
- **[Added]** Scripts can read and write communication-address values.
- **[Added]** Added script completion, syntax highlighting, and error checking.
- **[Added]** Added Byte and BitField data types.
- **[Added]** Word values can be expanded into Bit and Byte child rows.
- **[Improved]** Multi-write now handles the data type of each target.
- **[Improved]** Improved compatibility with existing HMI files.

### Ver 2.4 (2026.04.26)

- **[Changed]** Converted to a self-contained application that runs without a separately installed .NET runtime.
- **[Changed]** Combined the application and required components into one executable.
- **[Fixed]** Corrected application entry-point and deployment-path settings.
- **[Improved]** Improved runtime and deployment stability.

### Ver 2.3 (2026.04.13)

- **[Added]** Added condition comparison and execution to HMI Word Button.
- **[Added]** Added multi-write for controlling up to ten addresses with one button.
- **[Changed]** Condition and execution targets can now be configured separately.
- **[Improved]** Improved HMI state and trigger indicators.

### Ver 2.2 (2026.04.02)

- **[New]** Published Communication Tester on the website.
- **[Added]** Added Modbus TCP communication.
- **[Added]** Added EtherNet/IP communication.
- **[Added]** Added MC Protocol communication.
- **[Added]** Added TCP/IP Socket Client and Server communication.
- **[Added]** Added real-time communication-data monitoring and control.
- **[Added]** Added HMI Builder for creating test screens on a PC.

## labelGenerator

### Ver 2.1.0

- **[Fixed]** Prevented Bit, Byte, or Word labels from being omitted or overwritten when they share an address.
- **[Changed]** On address conflicts, Bit labels are prioritized and related Byte and Word labels appear in the description.
- **[Added]** Automatically recognizes Double Word, 2 Word, DWORD, and 32-bit notation in descriptions.
- **[Fixed]** Double Word data now merges correctly across the 32-bit range in Excel.
- **[Changed]** Standardized the application title and executable version as V2.1.

### Ver 2.0.0

- **[New]** Combined separately distributed label formats into one application.
- **[Added]** Added 20-character Word, 20-character Byte, 64-character Word, and 64-character Byte formats.
- **[Added]** Formats can be selected independently for Excel to JSN and JSN to Excel.
- **[New]** Added an editor for reviewing and changing label names and descriptions before JSN-to-Excel conversion.
- **[Added]** Excel filenames are assigned automatically for the selected format.
- **[Changed]** Improved name normalization to abbreviate long variable names in 20-character formats.
- **[Changed]** The status area now shows the active format and loaded record count.
- **[Changed]** Changed the default format to 20-character Word.

### Ver 1.0.0

- **[New]** Added Excel label-data conversion to JSN.
- **[New]** Added JSN conversion to an Excel label workbook.
- **[Added]** Supports Input and Output Bit, Byte, and Word labels.
- **[Added]** Supports B, R, and D variable labels.
- **[Added]** Added label listing, sorting, selection, and editing.
- **[Added]** Added variable-name normalization and change preview.
- **[Added]** Supports 64-character Byte and 20-character Word formats.

## trace

### Ver 1.3 (2026.07.15)

- **[Added]** Added real-time J1 through J6 joint-speed monitoring.

### Ver 1.2 (2026.06.15)

- **[New]** Added real-time monitoring for 16 DI and 16 DO channels.
- **[Changed]** Digital states are shown as ON / OFF instead of numbers.
- **[Improved]** Optimized graph ranges to make DI and DO transitions easier to see.
- **[Improved]** All selected trace channels can be saved to CSV.
- **[Improved]** Channels in loaded CSV files are detected and displayed automatically.
- **[Improved]** Preserved compatibility with CSV files saved by earlier versions.

### Ver 1.1 (2026.05.18)

- **[Changed]** Collects only user-selected B, R, and D variables instead of reading all variables.
- **[Added]** B, R, and D trace variables can be changed while tracing.
- **[Improved]** Reduced unnecessary robot API calls for more stable and responsive high-speed sampling.
- **[Improved]** Reduced communication load on the robot and application during live tracing.

### Ver 1.0 (2026.04.26)

- **[New]** Initial release of InoRobotTrace.
- **[New]** Added real-time tracking of robot TCP speed and position.
- **[New]** Added monitoring for error status, error code, axis servo errors, and emergency stop.
- **[New]** Added program line, motion line, system time, and firmware-version monitoring.
- **[New]** Added Tool, Work Object, Load, and B/R/D variable monitoring.
- **[New]** Added graph zoom, pan, channel separation, and cursor measurement.
- **[New]** Added saving and loading trace data as CSV.
- **[Distribution]** Supplied as a single executable that requires no separate installation.

## projectCompare

### Ver 2.1

- **[Changed]** Updated display settings for Windows scaling such as 125% and 150%.
- **[Fixed]** Fixed overlapping or incorrectly sized text, buttons, and fields on high-resolution displays.
- **[Changed]** Changed to a single executable that does not require a separate .NET installation.
- **[Changed]** Standardized the application title and executable version as V2.1.

### Ver 2.0

- **[New]** Added side-by-side comparison of two InoRobot projects.
- **[New]** Added automatic classification of .pro, .pts, .jsn, and .dat files.
- **[New]** Displays file status as Match / Different / A only / B only.
- **[New]** Added a comparison view that highlights changed code and data.
- **[New]** Added table comparison and editing for point and label data.
- **[New]** Added overwrite from A to B or B to A for selected files.
- **[New]** Added direct file editing and saving in the comparison view.
- **[New]** Added Save As for copying an existing project.
- **[Added]** Supports Korean, English, Chinese, and Vietnamese UI.
