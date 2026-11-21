//! Controller file generation. Times and input fields are supplied by the browser.
mod labels;
mod programs;

use std::cell::RefCell;
use std::fmt::Write;

#[derive(Default)]
struct Step {
    no: i32,
    extra: u32,
    slot: i32,
    work: String,
    method: String,
    tool: String,
    name: String,
    vision: String,
    tray: Option<[String; 4]>,
}
impl Step {
    fn peeling(&self) -> bool {
        self.work == "Peeling" || self.method == "Peeling"
    }
    fn tool_no(&self) -> i32 {
        if !self.peeling() && (self.tool == "Gripper" || self.work == "Trash") {
            2
        } else {
            1
        }
    }
    fn vision_io(&self) -> bool {
        self.vision == "Use - IO"
            || (self.work == "Vision"
                && self.method == "Calibration"
                && self.tool != "Vision (Socket)")
    }
    fn socket(&self) -> bool {
        self.vision == "Use - Socket"
            || (self.work == "Vision"
                && self.method == "Calibration"
                && self.tool == "Vision (Socket)")
    }
    fn points(&self) -> Vec<(i32, String, u32)> {
        let mut p = vec![(0, "Safe".into(), 0), (1, "Wait".into(), 0)];
        for i in 2..=self.extra + 1 {
            p.push((i as i32, format!("Wait{i}"), 0));
        }
        p.extend([(10, "Pre_work".into(), 1), (11, "Work".into(), 3)]);
        if self.peeling() {
            for i in 1..=5 {
                p.push((11 + i, format!("Peel_{i}"), 2));
            }
            p.push((20, "Peel_end".into(), 2));
        }
        p
    }
}

#[derive(Default)]
struct Plan {
    steps: Vec<Step>,
    teach: bool,
    control: bool,
    multi: bool,
    tcp: bool,
    torque: bool,
    wait: bool,
    busy: bool,
    dio: bool,
    preserve: bool,
    scara: bool,
    recipes: i32,
    payload: u32,
}
impl Plan {
    fn stage_slots(&self) -> impl Iterator<Item = i32> + '_ {
        self.steps
            .iter()
            .filter(|s| s.work == "Stage")
            .enumerate()
            .map(|(i, s)| if s.slot != 0 { s.slot } else { i as i32 + 1 })
    }
    fn vacuum(&self) -> bool {
        self.steps
            .iter()
            .any(|s| s.tool == "Vacuum" || s.work == "Trash")
    }
    fn gripper(&self) -> bool {
        self.steps
            .iter()
            .any(|s| s.tool == "Gripper" || s.peeling())
    }
    fn trash(&self) -> bool {
        self.steps.iter().any(|s| s.work == "Trash")
    }
}
fn stage_name(slot: i32) -> String {
    if slot == 1 {
        "Stage".into()
    } else {
        format!("Stage{slot}")
    }
}

thread_local! {
    static PLAN: RefCell<Plan> = RefCell::default();
    static FIELDS: RefCell<Vec<u16>> = const { RefCell::new(Vec::new()) };
    static RESULT: RefCell<String> = const { RefCell::new(String::new()) };
}
#[no_mangle]
pub extern "C" fn fields(len: usize) -> *mut u16 {
    FIELDS.with_borrow_mut(|buf| {
        buf.resize(len, 0);
        buf.as_mut_ptr()
    })
}
fn strings() -> Vec<String> {
    FIELDS.with_borrow(|buf| {
        let mut data = &buf[..];
        let mut fields = Vec::new();
        while !data.is_empty() {
            let len = data[0] as usize | ((data[1] as usize) << 16);
            let (value, rest) = data[2..].split_at(len);
            fields.push(String::from_utf16_lossy(value));
            data = rest;
        }
        fields
    })
}
#[no_mangle]
pub extern "C" fn start_plan(flags: u32, recipes: i32, payload: u32) {
    let on = |bit: u32| flags & (1 << bit) != 0;
    PLAN.with_borrow_mut(|p| {
        *p = Plan {
            steps: std::mem::take(&mut p.steps),
            teach: on(0),
            control: on(1),
            multi: on(2),
            tcp: on(3),
            torque: on(4),
            wait: on(5),
            busy: on(6),
            dio: on(7),
            preserve: on(8),
            scara: on(9),
            recipes,
            payload,
        }
    });
    PLAN.with_borrow_mut(|p| p.steps.clear());
}
#[no_mangle]
pub extern "C" fn add_step(no: i32, extra: u32, slot: i32) {
    let mut f = strings().into_iter();
    let s = Step {
        no,
        extra,
        slot,
        work: f.next().unwrap(),
        method: f.next().unwrap(),
        tool: f.next().unwrap(),
        name: f.next().unwrap(),
        vision: f.next().unwrap(),
        tray: f
            .next()
            .map(|x| [x, f.next().unwrap(), f.next().unwrap(), f.next().unwrap()]),
    };
    PLAN.with_borrow_mut(|p| p.steps.push(s));
}
#[no_mangle]
pub extern "C" fn generated_ptr() -> *const u8 {
    RESULT.with_borrow(|s| s.as_ptr())
}
#[no_mangle]
pub extern "C" fn result_utf16() -> usize {
    RESULT.with_borrow(|s| {
        FIELDS.with_borrow_mut(|units| {
            units.clear();
            units.extend(s.encode_utf16());
            units.len()
        })
    })
}
macro_rules! export_program {
    ($name:ident, $body:expr) => {
        #[no_mangle]
        pub extern "C" fn $name() -> usize {
            PLAN.with_borrow(|plan| {
                RESULT.with_borrow_mut(|result| {
                    result.clear();
                    ($body)(plan, result);
                    result.len()
                })
            })
        }
    };
}
export_program!(main_program, programs::main_program);
export_program!(initial_program, programs::initial);
export_program!(teach_program, programs::teach);
export_program!(offset_program, programs::offset);
export_program!(tool_program, programs::tool);
export_program!(process_program, programs::process);
export_program!(tray_function, programs::tray);
export_program!(plc_program, programs::plc);
export_program!(tcp_program, programs::tcp);
export_program!(labels_file, labels::generate);
export_program!(warning_file, warnings);
export_program!(points_file, points);
export_program!(project_file, project);
export_program!(current_torque, |p: &Plan, out: &mut String| {
    programs::torque(p, &strings(), out)
});
export_program!(step_offset, |p: &Plan, out: &mut String| {
    programs::offset_code(&p.steps[0], &strings()[0], out)
});
export_program!(socket_exchange, |_: &Plan, out: &mut String| {
    let f = strings();
    programs::exchange(&f[0], &f[1], out);
});
export_program!(point_mapping, |p: &Plan, out: &mut String| {
    let f = strings();
    write!(out,"FileInfo\n    FileType=\"PosMappingFile\"\n    Version=\"1.0\"\n    SystemVersion=\"V4R24\"\n    RobotName=\"{}\"\n    Time=\"{}\"\n    CheckCode=\"558447AB\"\nEndFileInfo\n0-P.pts\n",f[0],f[1]).unwrap();
    if p.multi {
        for i in 1..p.recipes {
            writeln!(out, "{i}-P{i:02}.pts").unwrap();
        }
    }
});

fn points(p: &Plan, out: &mut String) {
    let named = strings()[0] == "P.pts";
    const ZERO: &str = "0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000";
    for s in &p.steps {
        let n = s.no;
        for (offset, label, _) in s.points() {
            write!(out, "P[{}] = {ZERO}; 0, 0, 0, 0;{ZERO};", 100 * n + offset).unwrap();
            if named {
                write!(out, "Name = P{n}_{label};").unwrap();
            }
            out.push_str("Notes = \"T1_W0\";\n");
        }
    }
}
fn warnings(p: &Plan, out: &mut String) {
    let mut labels = [""; 16];
    if p.vacuum() {
        labels[..2].copy_from_slice(&[
            "ERR : Tool Vacuum ON Error!",
            "ERR : Tool Vacuum OFF Error!",
        ]);
    }
    if p.gripper() || p.trash() {
        labels[2..4].copy_from_slice(&["ERR : Gripper ON Error!", "ERR : Gripper OFF Error!"]);
    }
    if p.trash() {
        labels[4..6].copy_from_slice(&[
            "ERR : Trash Gripper ON Error!",
            "ERR : Trash Gripper OFF Error!",
        ]);
    }
    if p.stage_slots().next().is_some() {
        labels[6..8].copy_from_slice(&[
            "ERR : Stage Vacuum ON Error!",
            "ERR : Stage Vacuum OFF Error!",
        ]);
    }
    for s in &p.steps {
        if s.tray.is_some() {
            labels[12] = "ERR : Tray Count Error!";
        }
        if s.method == "Check" && s.work == "MCR" {
            labels[8] = "ERR : MCR Shot Error!";
        }
        if s.method == "Check" && s.work == "Vision" {
            labels[9] = "ERR : Vision Shot Error!";
        }
    }
    if p.teach {
        labels[13] = "ERR : Teaching mode Error!";
    }
    labels[14] = "ERR : Homing Error!";
    if p.control {
        labels[15] = "ERR : Tool position Error!";
    }
    out.push_str("{\n  \"Warings\": [\n    \"");
    out.push_str(&labels.join("\",\n    \""));
    out.push_str("\"\n  ]\n}");
}
fn project(p: &Plan, out: &mut String) {
    let mut programs = vec!["main.pro".to_owned(), "PLC_internal.pro".to_owned()];
    if p.tcp {
        programs.push("PLC_TCP_Speed.pro".into());
    }
    programs.extend(["s01_initial.pro".into(), "s02_offset.pro".into()]);
    if p.teach {
        programs.push("s03_teach_mode.pro".into());
    }
    if p.control {
        programs.push("s04_Tool_Control.pro".into());
    }
    programs.extend(p.steps.iter().map(|s| format!("{}.pro", s.name)));
    let mut points = vec!["P.pts".to_owned()];
    if p.multi {
        points.extend((1..p.recipes).map(|i| format!("P{i:02}.pts")));
    }
    let tasks = if p.tcp { 2 } else { 1 };
    out.push_str("{\n  \"FileType\": \"RobotProjectConfigFile\",\n  \"Company\": \"Inovance\",\n  \"MajorVersion\": 2,\n  \"MinorVersion\": 1,\n  \"IsMainActive\": true,\n");
    write!(
        out,
        "  \"MultiTaskCount\": {tasks},\n  \"MultiTaskInfos\": [\n"
    )
    .unwrap();
    for id in 1..=tasks {
        if id > 1 {
            out.push_str(",\n");
        }
        let file = &programs[id];
        write!(out,"    {{\n      \"TaskId\": {id},\n      \"EnterProgramFile\": \"{file}\",\n      \"TaskType\": 1,\n      \"IsActive\": true\n    }}").unwrap();
    }
    for (key, files) in [("ProgramFiles", programs), ("RobPointFiles", points)] {
        write!(
            out,
            "\n  ],\n  \"{key}Count\": {},\n  \"{key}\": [\n    \"{}\"",
            files.len(),
            files.join("\",\n    \"")
        )
        .unwrap();
    }
    out.push_str("\n  ]\n}");
}
