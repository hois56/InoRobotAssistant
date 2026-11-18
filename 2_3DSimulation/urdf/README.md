# Firmware-checked robot URDFs

Source: IMC100R-PLCV4R24C4SPC25_PR-1_0_3_236.zip. This export contains 38 exact firmware records across 31 catalog families.
R35/R50 have no INT default in this firmware: each available source variant is exported under its real name. Choose the actual controller variant; no INT identity is invented.

## Regenerate

    node tools/generate-urdf.mjs
    node tools/generate-urdf.mjs --models IR-R7H-90

Use an exact firmware model name for an ambiguous family. Optional --output-dir writes a separate export with relative mesh paths.
Extract again with Python tools/extract-urdf-firmware.py <installer.zip> (standard-library Python and the project's Node runtime). Firmware code is never executed.

## Physical data

- Exact source paths/hashes and raw records: firmware-spc25.json. Per-link decisions: physics-audit.json. Binary evidence: FIRMWARE_FINDINGS.md.
- STL mm are scaled to m; effective six-axis mass properties are SI, transformed into CAD link frames. No magnitude-based unit guessing.
- Invalid six-axis tensors and incomplete planar SCARA tensors use source mass and uniform STL bounding-box approximations, explicitly marked. SCARA without a P3 mesh uses P4 bounds as the declared J3 carriage proxy.
- Revolute effort is ratedTrq * abs(ratio); SCARA J3 effort is 2*pi*torque/lead_m with ideal efficiency. These are nominal values, not peak servo limits.
- Joint limits and speeds come from the exact firmware record. SCARA J3 degrees are converted to metres once. URDF does not encode a playback acceleration planner.
- Tool frames match the six-axis or standard/ceiling SCARA zero-flange orientation.

| Model | Approximate links |
| --- | --- |
| IR-R7H-70S5-C2H-INT_01741199 | link_1 |
| IR-R7H-90S5-C2H-INT_01741200 | link_1 |
| IR-R10H-120S5-C2H-INT_01741201 | link_1, link_4 |
| IR-R25-178S5-D1NH-INT_01741089 | link_1, link_2, link_4 |
| IR-R15H-145S5-C1NH-INT_01741446 | link_1, link_2, link_4, link_5, link_6 |
| IR-S4-40Z15S3-C2LH-INT_01741009 | link_1, link_2, link_3, link_4 |
| IR-S7-50Z20S3-C2LH-INT_01741022 | link_1, link_2, link_3, link_4 |
| IR-S7-60Z20S3-C2LH-INT_01741021 | link_1, link_2, link_3, link_4 |
| IR-S7-70Z20S3-C2LH-INT_01741020 | link_1, link_2, link_3, link_4 |
| IR-S10-60Z20S3-C2LH-INT_01741025 | link_1, link_2, link_3, link_4 |
| IR-S10-70Z20S3-C2LH-INT_01741018 | link_1, link_2, link_3, link_4 |
| IR-S10-80Z20S3-C2LH-INT_01741017 | link_1, link_2, link_3, link_4 |
| IR-S25-80Z42S5-C2LNHX-INT_01741354 | link_1, link_2, link_3, link_4 |
| IR-S25-100Z42S5-C2LNHX-INT_01741353 | link_1, link_2, link_3, link_4 |
| IR-S25-120Z42S-C2LSXD-INT_01741364 | link_1, link_2, link_3, link_4 |
| IR-TS4-35Z15S3-C2LH-INT_01741011 | link_1, link_2, link_3, link_4 |
| IR-TS5-55Z15S3-C2LH-INT_01741007 | link_1, link_2, link_3, link_4 |
| IR-S35-80Z42S5-C2LNHX-INT_01741206 | link_1, link_2, link_3, link_4 |
| IR-S35-100Z42S5-C2LNHX-INT_01741207 | link_1, link_2, link_3, link_4 |
| IR-S35-120Z42S-C2LSXD-INT_01741363 | link_1, link_2, link_3, link_4 |
| IR-S60-120Z40S5-A1LSSH-INT_01741335 | link_1, link_2, link_3, link_4 |
| IR-GS60-120Z40S5-C1LNSX-INT_01741178 | link_1, link_2, link_3, link_4 |
| IR-R4-56S5-C1H-INT_01741030 | link_1 |
| IR-R4H-54S5-C1H-INT_01741031 | link_1, link_2, link_5, link_6 |
| IR-R10-110S5-C1H-INT_01741036 | link_1, link_4, link_5 |
| IR-R11-90S5-C1H-INT_01741035 | link_1 |
| IR-R10-140S5-D1NH-INT_01741041 | link_1, link_2, link_4, link_5, link_6 |
| IR-R16-210S5-D1NH-INT_01741090 | link_1, link_2, link_4, link_5 |
| IR-R20H-120S5-C1NH-INT_01741447 | link_1, link_6 |
| IR-R35-185S7-B1NH_01740676 | link_1, link_2, link_4 |
| IR-R35-185S7-B1ZD_01740679 | link_1, link_4 |
| IR-R35-185S7-D1SD_01741293 | link_1, link_4 |
| IR-R50-250S7-E1N_01740564 | link_1, link_2, link_4 |
| IR-R50-250S7-E1N_01740675 | link_1, link_2, link_4 |
| IR-R50-250S7-E1ZN_01740600 | link_1, link_2, link_4 |
| IR-R50-250S7-E1ZN_01740674 | link_1, link_2, link_4 |
| IR-R50-250S7-E1ZY_01741085 | link_1, link_2, link_4 |
| IR-R50-250S7-F1S_01741336 | link_1, link_2, link_4 |

## Isaac Sim validation still required

Import with a fixed base. Configure convex collision approximations/contact filters and joint drives/gains, then validate gravity holding and trajectory following. Detailed STL geometry remains collision input. USD conversion and Isaac Sim execution have not been performed. Rapid Move is separate runtime code and is not embedded in these URDFs.
