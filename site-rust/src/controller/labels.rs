use super::{stage_name, Plan};
use std::fmt::Write;

struct Section {
    address: &'static str,
    count: usize,
    rows: String,
}
impl Section {
    fn new(address: &'static str) -> Self {
        Self {
            address,
            count: 0,
            rows: String::new(),
        }
    }
    fn add(&mut self, index: i32, label: &str, description: &str) {
        if self.count != 0 {
            self.rows.push_str(",\n");
        }
        write!(self.rows, "      {{\n        \"nLabelId\": {},\n        \"nIndex\": {index},\n        \"sLabel\": \"{label}\",\n        \"sDescription\": \"{description}\",\n        \"sOriginalName\": \"{}[{index}]\"\n      }}",self.count,self.address).unwrap();
        self.count += 1;
    }
    fn process_bits(&mut self, p: &Plan, base: i32, kind: &str, suffix: &str) {
        let direction = if self.address == "IN" { 'x' } else { 'y' };
        for (i, s) in p.steps.iter().enumerate() {
            let offset = if p.preserve { s.no - 1 } else { i as i32 };
            self.add(
                base + offset,
                &format!("{direction}P{}_{kind}_pos_{suffix}", s.no),
                "",
            );
        }
    }
    fn tool_pair(&mut self, dio: bool, base: i32, names: [&str; 2]) {
        let input = self.address == "IN";
        let direction = if input { "x" } else { "y" };
        let local_suffix = if input { "_chk" } else { "" };
        let remote_suffix = if input { "_REQ" } else { "_sts" };
        if dio {
            for (i, name) in names.iter().enumerate() {
                self.add(
                    base + i as i32,
                    &format!("{direction}{name}{local_suffix}"),
                    "DIO Tool",
                );
            }
        }
        let suffix = if dio {
            remote_suffix
        } else if input {
            ""
        } else {
            "_REQ"
        };
        for (i, name) in names.iter().enumerate() {
            self.add(
                608 + base + i as i32,
                &format!("{direction}{name}{suffix}"),
                if dio { "COMM Tool" } else { "" },
            );
        }
    }
    fn tools(&mut self, p: &Plan) {
        if !p.control {
            return;
        }
        if p.vacuum() {
            self.tool_pair(p.dio, 0, ["Tool_vac_on", "Tool_vac_off"]);
        }
        if p.gripper() {
            self.tool_pair(p.dio, 2, ["Tool_grip", "Tool_ungrip"]);
        }
        if p.trash() {
            self.tool_pair(p.dio, 4, ["Trash_grip", "Trash_ungrip"]);
        }
        for i in p.stage_slots() {
            let prefix = stage_name(i);
            self.tool_pair(
                p.dio,
                6 + (i - 1) * 2,
                [&format!("{prefix}_vac_on"), &format!("{prefix}_vac_off")],
            );
        }
    }
}

pub(super) fn generate(p: &Plan, out: &mut String) {
    let mut inputs = Section::new("IN");
    inputs.add(512, "xStart_prog", "Start program");
    inputs.add(513, "xStop_prog", "Stop program");
    inputs.add(514, "xReset_prog", "Program reset");
    inputs.add(515, "xReset_alarm", "Clear alarm");
    inputs.add(519, "xRobot_homing", "");
    if p.teach {
        inputs.add(520, "xTeach_mode", "");
        inputs.add(521, "xTeach_move_next", "");
        inputs.add(522, "xTeach_move_prev", "");
        inputs.add(523, "xTeach_move_offset", "");
        inputs.add(524, "xTeach_save", "");
    }
    if p.wait {
        inputs.process_bits(p, 528, "wait", "start");
    }
    inputs.process_bits(p, 544, "work", "start");
    let peeling = p.steps.iter().any(|s| s.peeling());
    if peeling {
        inputs.add(568, "xPeel_start", "");
    }
    inputs.tools(p);
    inputs.add(12800, "xReIO_run_all_static", "");
    let mut words = Section::new("INW");
    words.add(33, "xwProcess_wait_pos", "");
    words.add(34, "xwProcess_work_pos", "");
    if p.steps.iter().any(|s| s.tray.is_some()) {
        words.add(37, "xwTray_index", "Tray cell index (1-based)");
    }
    if p.multi {
        words.add(40, "xwP_file_switch", "");
    }
    words.add(41, "xwSet_speed", "Speed settings");
    if p.teach {
        words.add(42, "xwTeach_offset_X", "2 Word /10000");
        words.add(44, "xwTeach_offset_Y", "2 Word /10000");
        words.add(46, "xwTeach_offset_Z", "2 Word /10000");
        words.add(48, "xwTeach_offset_A", "2 Word /10000");
        words.add(50, "xwTeach_offset_B", "2 Word /10000");
        words.add(52, "xwTeach_offset_C", "2 Word /10000");
    }
    let mut index = 54;
    if p.steps.iter().any(|s| s.vision_io()) {
        for axis in ["X", "Y", "A"] {
            words.add(index, &format!("xwVision_offset_{axis}"), "2Word_/10000");
            index += 2;
        }
    }
    let offset_base = index;
    for s in &p.steps {
        if s.no > 10 {
            continue;
        }
        if p.preserve {
            index = offset_base + (s.no - 1) * 8;
        }
        for axis in ["X", "Y", "Z", "A"] {
            words.add(
                index,
                &format!("xwOffset_{}_{axis}", s.no),
                "2 Word, /10000",
            );
            index += 2;
        }
    }
    if peeling {
        words.add(index, "xwPeel_speed", "");
    }
    let mut outputs = Section::new("OUT");
    outputs.add(512, "yProg_run_sts", "Program run status");
    outputs.add(513, "yProg_stop_sts", "Program stopped");
    outputs.add(514, "yProg_reset_sts", "Program reset successful");
    outputs.add(515, "yAlarm_sts", "System fault status");
    outputs.add(516, "yRemote_mode_sts", "ON : PLC can control robot");
    outputs.add(519, "yRobot_home_sts", "");
    if p.teach {
        outputs.add(520, "yTeach_mode_sts", "");
        outputs.add(521, "yTeach_move_comp", "");
        outputs.add(524, "yTeach_save_comp", "");
    }
    if p.wait {
        outputs.process_bits(p, 528, "wait", "comp");
    }
    outputs.process_bits(p, 544, "work", "comp");
    if p.busy {
        if p.wait {
            outputs.process_bits(p, 560, "wait", "busy");
        }
        outputs.process_bits(p, 576, "work", "busy");
    }
    if peeling {
        outputs.add(600, "yPeel_pos_comp", "");
    }
    outputs.tools(p);
    let mut output_words = Section::new("OUTW");
    output_words.add(33, "ywProcess_wait_comp", "");
    output_words.add(34, "ywProcess_work_comp", "");
    output_words.add(35, "ywProcess_wait_busy", "");
    output_words.add(36, "ywProcess_work_busy", "");
    if p.multi {
        output_words.add(46, "ywCur_P_file", "");
    }
    output_words.add(47, "ywCur_speed", "");
    output_words.add(49, "ywCur_mode", "");
    output_words.add(50, "ywCur_alarm_code", "");
    output_words.add(51, "ywCur_pos_X", "");
    output_words.add(53, "ywCur_pos_Y", "");
    output_words.add(55, "ywCur_pos_Z", "");
    output_words.add(57, "ywCur_pos_A", "");
    output_words.add(59, "ywCur_pos_B", "");
    output_words.add(61, "ywCur_pos_C", "");
    if p.tcp {
        output_words.add(63, "ywCur_TCP_speed", "");
    }
    let axes = if p.scara { 4 } else { 6 };
    if p.torque {
        for axis in 1..=axes {
            output_words.add(63 + axis, &format!("ywCur_J{axis}_torque"), "");
        }
    }
    output_words.add(801, "ywReIO_cur_control", "");
    let mut bytes = Section::new("B");
    bytes.add(0, "B_Tool", "");
    bytes.add(1, "B_Wobj", "");
    bytes.add(2, "B_PR", "");
    bytes.add(3, "B_path", "");
    bytes.add(4, "B_Cur_process", "");
    let mut registers = Section::new("R");
    registers.add(0, "R_Cur_pos", "");
    let mut doubles = Section::new("D");
    if p.tcp {
        doubles.add(0, "D_TCP_speed", "");
    }
    if p.torque {
        for (start, kind) in [(0, "cur"), (6, "max")] {
            for axis in 1..=axes {
                doubles.add(start + axis, &format!("D_J{axis}_{kind}_torque"), "");
            }
        }
    }
    let empty = Section::new("");
    out.push_str("{\n");
    for (i, (name, section)) in [
        ("InputBitLabels", &inputs),
        ("InputByteLabels", &empty),
        ("InputWordLabels", &words),
        ("OutputBitLabels", &outputs),
        ("OutputByteLabels", &empty),
        ("OutputWordLabels", &output_words),
        ("AdLabels", &empty),
        ("DaLabels", &empty),
        ("BVarLabels", &bytes),
        ("RVarLabels", &registers),
        ("DVarLabels", &doubles),
    ]
    .iter()
    .enumerate()
    {
        if i != 0 {
            out.push_str(",\n");
        }
        write!(out,"  \"{name}\": {{\n    \"nNumberOfLabels\": {},\n    \"LabelsArray\": [\n{}\n    ]\n  }}",section.count,section.rows).unwrap();
    }
    out.push_str("\n}");
}
