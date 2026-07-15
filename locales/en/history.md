# InoRobot Assistant Update History

This file records user-visible feature additions, content updates, display changes, and fixes for each card on the home page.

## Robot Model Select

### Ver 26.06.19.01

- **[New]** Added the IR-TP200 teach pendant with an emergency-stop protective cover.
- **[New]** Added order codes for covered pendants: 5 m 01640069, 10 m 01640072, and 15 m 01640073.
- **[Changed]** Reorganized pendant selection into Not selected / Without protective cover / With protective cover.
- **[Changed]** The result and PDF now show the selected pendant cover, length, and order code.

### Ver 26.06.15.01

- **[Added]** Added 5 m cable order code 01741079*M00018 for IR-S7-60Z20S-INT.

### Ver 26.06.02.01

- **[Changed]** SCARA models without KCs certification now show an estimated lead time of 10 weeks.

### Ver 26.06.01.02

- **[Changed]** Renamed model IR-R15H-145S-INT to IR-R15H-145S-K-INT.
- **[Changed]** Renamed model IR-R20H-120S-INT to IR-R20H-120S-K-INT.
- **[Added]** Added IR-R15H IP67 order code 01741446.
- **[Added]** Added IR-R20H IP67 order code 01741597.
- **[Added]** Added 3 m cable order code 01741436*M00002 for IR-S25-100Z42S-INT.
- **[Added]** Added IR-S60-120Z40S-INT order codes: 5 m 01741367*M00002 and 15 m 01741367*M00003.
- **[Fixed]** Restored CAD lookup after the R15H and R20H model-code changes.

### Ver 26.06.01.01

- **[Added]** Added 3 m cable order code 01741086*M00008 for IR-R10-140S-INT.

### Ver 26.05.29.01

- **[New]** Added Standard, Clean, and IP67 body options for six-axis robots.
- **[Changed]** R10-140, R16, and R25 now show only the fixed Body IP65 / Wrist IP67 specification.
- **[Changed]** R15H and R20H Clean models show ISO Class 4; other six-axis Clean models show ISO Class 3.
- **[Changed]** Selecting a body option now updates the S/C/P model code and PDF filename.
- **[Fixed]** Fixed CAD downloads for R16, R25, and other models using _CN or _3D_CN filenames.
- **[Fixed]** Restored °, °/s, mm, and mm/s units in axis speed and motion-range values.
- **[Fixed]** Restored kg and mm units for mass and repeatability in details and PDFs.
- **[Fixed]** Removed incorrect KC and KCs certifications from IR-S35-80Z42S-INT.
- **[Cleanup]** Removed unreleased IR-CS models from filters and search results.
- **[Cleanup]** Hid the unsupported Handheld Motor Brake Release Box option for R10-140, R16, and R25.

### Ver 26.05.22.01

- **[Changed]** Corrected Clean Type from Yes to No for IR-R4H, R7H-70, R7H-90, R10H, R15H, and R20H.
- **[Changed]** Clean specifications for those six-axis models are now shown as selectable options rather than defaults.
- **[Changed]** Updated the estimated lead time for Clean SCARA models to six months.
- **[Fixed]** Enabled CAD buttons for R16 and R25 where model codes differ from CAD folder names.
- **[Changed]** Standardized CAD button labels as Checking / CAD Download / CAD Not Ready / Preparing.

### Ver 26.04.17.01

- **[Fixed]** Corrected swapped Standard and Clean data for IR-S25-120.
- **[Fixed]** Corrected model name, arm length, Z stroke, mass, cycle time, and certification links for IR-S35-100 and IR-S35-120 variants.
- **[Added]** Added 2D DWG, 3D STP, and FBX files for IR-S25-120Z42S-INT and IR-S35-120Z42S-INT.
- **[Fixed]** Corrected IP ratings for R15H and R20H in generated PDFs.

### Ver 26.04.12.01

- **[New]** Added recommended circuit-breaker capacity to model details.
- **[Changed]** Ratings now show R4/R7H 10 A, R10/R11 15 A, R10-140 20 A, R16/R25 30 A, S25 15 A, and S35/S60 20 A.

### Ver 26.03.31.02

- **[Changed]** Pendant, Arm I/O, Body I/O, and communication expansion order codes now use orange badges.
- **[Changed]** IR-TP200 extension-cable names now show 5 m, 15 m, and 25 m lengths directly.

## Robot 3D Viewer

### Ver 26.07.12.01

- **[Fixed]** Corrected the undersized display of R16 and R25 models.

### Ver 26.06.02.01

- **[Changed]** Renamed IR-R15H-145S-INT to IR-R15H-145S-K-INT.
- **[Changed]** Renamed IR-R20H-120S-INT to IR-R20H-120S-K-INT.
- **[Fixed]** Restored lookup of existing -S-INT CAD files for -S-K-INT selections.

### Ver 26.05.29.01

- **[Fixed]** Included CAD files stored with _CN or _3D_CN names in ZIP downloads for R16, R25, and related models.
- **[Fixed]** When _2D.dwg is unavailable, _3D_CN.dwg is now downloaded instead.

### Ver 26.04.17.01

- **[New]** Added 3D models for IR-S25-120Z42S-INT and IR-S35-120Z42S-INT.
- **[Fixed]** Corrected reversed orientations for IR-S25-120 and IR-S35-120.
- **[Fixed]** Corrected initial rotation values passed from Robot Model Select.

### Ver 26.03.31.01

- **[New]** Added per-model deletion with Delete or Backspace.
- **[New]** Added controls to show or hide move, rotate, and scale handles.

## Robot Tool Selector

### Ver 26.04.26.01

- **[Changed]** Set all default mass, CoG, and inertia inputs to zero.
- **[Fixed]** Block inertia is now calculated about the combined CoG.
- **[Fixed]** Removed duplicate application of block self-inertia and the parallel-axis theorem in Mode B.
- **[Fixed]** Adding or removing a block no longer resets existing inputs.
- **[Fixed]** A total mass of 0 kg no longer produces NaN results.
- **[Changed]** Standardized CoM and COM labels to CoG.
- **[Changed]** Inertia results are displayed to three decimal places.
- **[New]** Added a reference image explaining Tool Block CoG input coordinates.

## Project Generator

### Ver 26.07.12.01

- **[Fixed]** Added Break; after Save so the loop and Teach mode end correctly.

### Ver 26.06.19.01

- **[Changed]** Teaching Offset X, Y, Z, A, B, and C now show data format 2 Word /10000.

### Ver 26.06.15.01

- **[Changed]** Teaching Mode, Wait Position, and Process Busy are enabled by default.
- **[New]** Added next, previous, offset-position, and save-current-position actions to Teaching Mode.
- **[Changed]** Wait and Work Position now have separate Start, Complete, and Busy states.
- **[Fixed]** Corrected the application order when Vision Offset and Process Offset are used together.
- **[Fixed]** Prevented duplicate Vision Offset and Process Offset application.
- **[Fixed]** Corrected return paths to Wait or Work positions from other processes.
- **[Fixed]** Removed nonexistent J5 and J6 torque items from SCARA projects.
- **[Updated]** Replaced the bundled IO Map with InoRobot_IO_Map_0614.xlsx.
- **[Updated]** Updated Remote IO Mapping for the latest Process Wait, Work, Busy, and Teaching configuration.
- **[Fixed]** Corrected the Point File switching address shown in Multi Recipe help.
- **[Changed]** Help text and timing-chart signals now match generated output.

### Ver 26.05.20.01

- **[Fixed]** Teaching conditions are no longer generated when Teaching Mode is disabled.

### Ver 26.04.10.01

- **[Fixed]** Removed unnecessary conditions that could prevent process start for certain option combinations.

### Ver 26.04.07

- **[New]** Added detailed-help buttons and tooltips for project options.
- **[New]** Added a usage guide with IO timing charts.
- **[Fixed]** Prevented the Vision Offset tooltip from being hidden behind the table.
- **[Fixed]** Corrected Teaching Mode signal and waveform positions.
- **[Changed]** Aligned timing-chart headers, labels, and wave spacing and standardized transitions as vertical lines.

### Ver 26.04.02

- **[New]** Added table previews for Labels, Remote IO, P.pts, and User Warning files.
- **[New]** Labels, User Warning, and P.pts data can now be edited in the page.
- **[Changed]** Edited Label names now appear in all program previews.
- **[Changed]** Grouped the file selector into Main, Static Task, Sub Program, Process, and Data File.

## Software

### Ver 26.06.19.01

- **[Updated]** Updated InoRobotLab from V4R24C4SPC18 to V4R24C4SPC21.
- **[Updated]** Updated InoRobotTP from V4R24C4SPC18 to V4R24C4SPC21.
- **[Changed]** Updated InoRobotLab download sizes to 470 MB installed and 473 MB portable.

### Ver 26.06.06.01

- **[Updated]** Updated InoRobotLab from V4R24C4SPC17 to V4R24C4SPC18.
- **[Updated]** Updated InoRobotTP from V4R24C4SPC17 to V4R24C4SPC18.
- **[Cleanup]** Removed SPC15 and SPC17 downloads so only SPC18 is shown.

### Ver 26.05.14.01

- **[Updated]** Replaced Display editions of InoRobotLab and InoRobotTP with V4R24C4SPC0L18F121.
- **[Changed]** Disabled the unavailable installed Display edition of InoRobotLab.
- **[Added]** Added 454 MB portable InoRobotLab and 57 MB InoRobotTP downloads for Display.

### Ver 26.04.17.01

- **[Added]** Added installed and portable InoRobotLab V4R24C4SPC17 downloads.
- **[Added]** Added the InoRobotTP V4R24C4SPC17 download.

## Document

### Ver 26.06.23.01

- **[Added]** Added a Safety Function tab to Hardware Manuals.
- **[Added]** Registered Robot System Safety Function Guide.PDF as a Safety Function manual.
- **[Updated]** Replaced INOVANCE ROBOT Selection Guide.pdf and INOVANCE ROBOT Selection Leaflet.pdf with current files.

### Ver 26.06.19.01

- **[Changed]** Renamed the home card from Manual to Document.
- **[Changed]** Updated its description to robot manuals, training materials, certificates, communication profiles, downloads, and viewing.

### Ver 26.06.15.01

- **[New]** Added EtherCAT v1.0.1, PROFINET V2.35, and EtherNet/IP V4.5 communication profiles.
- **[New]** Added 83 certificates: CE 10, Clean 4, cSGSus 4, FCC 2, Functional Safety 2, KCs 59, and MTBF 2.
- **[New]** Added CE, Clean, cSGSus, FCC, Functional Safety, KCs, and MTBF certificate filters.
- **[Changed]** Document search now includes actual filenames and paths as well as titles and descriptions.

### Ver 26.06.01.01

- **[Updated]** Replaced Introduction Course 2. Robot Basics INT and Display training PDFs.

### Ver 26.05.14.01

- **[Added]** Added IR-S25&S35, IR-S60&GS60, and IR-R15H&R20H user manuals.
- **[Added]** Added Input IO, NPN Output IO, Encoder, Functional Safety, IR-LINK, and PROFINET expansion-card manuals.
- **[New]** Added Expansion Card and Selection Guide document filters.

### Ver 26.04.26.01

- **[Updated]** Renamed the R25/R16 manual from IR-R25&R16 to IR-R25&16 and replaced it with the current PDF.

### Ver 26.04.12.01

- **[Updated]** Replaced Introduction Course 1. Robot Introduction INT and Display training PDFs.

### Ver 26.04.10.01

- **[New]** Added the Application Level training category.
- **[Added]** Added the API training PDF and practice API.zip.

### Ver 26.04.07.01

- **[Added]** Added beginner materials for InoRobotLab, variables, main commands, main settings, socket communication, and fieldbus communication.
- **[New]** Added a For Display training filter.
- **[Changed]** Split document actions into Preview and Download.

## Debugging Tool

### Ver 26.07.15.01

- **[Updated]** Updated InoRobot Trace from V1.2 to V1.3.
- **[Added]** Added Joint Speed J1 through J6 channels to Trace.
- **[Fixed]** Enabled Joint Speed channels when InoRobot Trace connects to a virtual controller.

### Ver 26.06.19.01

- **[Updated]** Updated InoRobot Label Generator from V2.0 to V2.1.

### Ver 26.06.15.01

- **[Updated]** Updated Communication Tester from V2.5 to V2.6.
- **[Updated]** Updated InoRobot Trace from V1.1 to V1.2.

### Ver 26.06.10.01

- **[Updated]** Updated Communication Tester from V2.4 to V2.5.
- **[Cleanup]** Removed the old Communication Tester V2.3 executable and ZIP.

### Ver 26.05.18.01

- **[Updated]** Updated InoRobot Trace from V1.0 to V1.1.

### Ver 26.04.26.01

- **[Updated]** Updated Communication Tester from V2.3 to V2.4.
- **[New]** Added the InoRobot Trace V1.0 download.
- **[New]** Added the InoRobot Label Generator V2.0 download.
- **[Updated]** Updated Project Compare from V2.0 to V2.1.

### Ver 26.04.13.01

- **[Updated]** Updated Communication Tester from V2.2 to V2.3.
- **[Fixed]** Fixed downloads that returned a Git LFS pointer instead of the ZIP.

### Ver 26.04.07.01

- **[Added]** Added an offline Excel download button to the Zero Calibration web calculator.

### Ver 26.04.02

- **[New]** Added the Communication Tester V2.2 download.
- **[New]** Added the Project Compare V2.0 download.
