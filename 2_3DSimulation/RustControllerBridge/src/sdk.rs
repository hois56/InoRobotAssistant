use libloading::os::windows::Library;
use serde::Serialize;
use serde_json::{json, Value};
use std::{net::Ipv4Addr, path::Path};

#[derive(Default)]
#[repr(C)]
struct Joints {
    data: [f64; 8],
    external: [f64; 6],
}
#[derive(Default)]
#[repr(C)]
struct Pose {
    data: [f64; 6],
    arm: [i32; 4],
    external: [f64; 6],
}
#[derive(Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
#[repr(C)]
struct Zone {
    input: i32,
    output: i32,
    scope: u16,
    is_alert: u16,
    safe_l: i32,
    wobj_num: u16,
    set_type: u16,
    diagonal: [f32; 6],
    point_l: [f32; 6],
}
#[derive(Clone, Copy, Default)]
#[repr(C)]
struct TcpBox {
    is_use: [u16; 4],
    tool_num: [u16; 4],
}
#[derive(Clone, Copy, Default)]
#[repr(C)]
struct BallBox {
    z_pos: f32,
    ball_r: f32,
}
#[derive(Clone, Copy, Default)]
#[repr(C)]
struct SquareBox {
    set_type: u16,
    diagonal: [f32; 6],
    point_l: [f32; 6],
    point_h: [f32; 13],
}
#[derive(Default)]
#[repr(C, packed)]
struct Tool {
    kind: u16,
    tcp: TcpBox,
    ball: BallBox,
    square: SquareBox,
}

const _: () = {
    assert!(size_of::<Joints>() == 112);
    assert!(size_of::<Pose>() == 112);
    assert!(size_of::<Zone>() == 68);
    assert!(size_of::<Tool>() == 130);
};

type Connect = unsafe extern "system" fn(u32, u16, i32, i32) -> i32;
type Close = unsafe extern "system" fn(i32) -> i32;
type Read<T> = unsafe extern "system" fn(*mut T, i32) -> i32;
type ReadIndexed<T> = unsafe extern "system" fn(i32, *mut T, i32) -> i32;

pub struct Sdk {
    connect: Connect,
    close: Close,
    remove_permit: Close,
    joints: Read<Joints>,
    pose: Read<Pose>,
    output: ReadIndexed<i32>,
    zone: ReadIndexed<Zone>,
    tool: ReadIndexed<Tool>,
    _library: Library,
    _runtime: Library,
}

impl Sdk {
    pub fn load(directory: &Path) -> Result<Self, libloading::Error> {
        // The SDK and its VC++ runtime are loaded from the executable's folder.
        unsafe {
            let runtime = Library::new(directory.join("MSVCR120.dll"))?;
            let library = Library::new(directory.join("IMC100API.dll"))?;
            Ok(Self {
                connect: *library.get(b"IMC100_Init_ETH\0")?,
                close: *library.get(b"IMC100_Exit_ETH\0")?,
                remove_permit: *library.get(b"IMC100_RemovePermit\0")?,
                joints: *library.get(b"IMC100_Get_RobJPosHere\0")?,
                pose: *library.get(b"IMC100_Get_RobPosHere\0")?,
                output: *library.get(b"IMC100_Get_DO\0")?,
                zone: *library.get(b"IMC100_Get_InterferZonePara\0")?,
                tool: *library.get(b"IMC100_Get_InterferToolPara\0")?,
                _library: library,
                _runtime: runtime,
            })
        }
    }
    pub fn connect(&self, id: i32, ip: Ipv4Addr, timeout: i32) -> Result<(), String> {
        let result = unsafe { (self.connect)(u32::from(ip), 2222, timeout, id) };
        if result < 0 {
            self.disconnect(id);
            return Err(format!("Controller connection failed ({result})."));
        }
        if let Err(result) = self.joints(id) {
            self.disconnect(id);
            return Err(format!("Joint position verification failed ({result})."));
        }
        Ok(())
    }
    pub fn disconnect(&self, id: i32) {
        unsafe {
            (self.remove_permit)(id);
            (self.close)(id);
        }
    }
    pub fn joints(&self, id: i32) -> Result<[f64; 8], i32> {
        let mut sample = Joints::default();
        let result = unsafe { (self.joints)(&mut sample, id) };
        if result < 0 {
            Err(result)
        } else {
            Ok(sample.data)
        }
    }
    pub fn pose(&self, id: i32) -> Option<[f64; 6]> {
        let mut sample = Pose::default();
        let result = unsafe { (self.pose)(&mut sample, id) };
        (result >= 0).then_some(sample.data)
    }
    pub fn output(&self, id: i32, index: i32) -> Option<i32> {
        let mut value = 0;
        let result = unsafe { (self.output)(index, &mut value, id) };
        (result >= 0).then_some((value != 0) as i32)
    }
    pub fn zone(&self, id: i32, number: i32, connected: bool) -> Value {
        let mut zone = Zone::default();
        let (result, message) = if !connected {
            (0, "실제 컨트롤러에 연결되어 있지 않습니다")
        } else if !(0..16).contains(&number) {
            (0, "간섭영역 번호가 유효하지 않습니다")
        } else {
            let result = unsafe { (self.zone)(number, &mut zone, id) };
            (
                result,
                if result >= 0 {
                    "간섭영역 조회 성공"
                } else {
                    "간섭영역 조회 실패"
                },
            )
        };
        let success = connected && (0..16).contains(&number) && result >= 0;
        json!({"success":success,"message":message,"zoneNumber":number,"readReturnCode":result,"zone":success.then_some(zone)})
    }
    pub fn tool(&self, id: i32, number: i32, connected: bool) -> Value {
        let mut value = Tool::default();
        let (result, message) = if !connected {
            (0, "Controller session is disconnected.")
        } else if !(0..16).contains(&number) {
            (0, "Interference Tool number is out of range.")
        } else {
            let result = unsafe { (self.tool)(number, &mut value, id) };
            (
                result,
                if result >= 0 {
                    "Interference Tool parameters read successfully"
                } else {
                    "Interference Tool parameter read failed"
                },
            )
        };
        let success = connected && (0..16).contains(&number) && result >= 0;
        let tool = success.then(|| {
            // Copy packed fields into aligned locals before serializing.
            let kind = value.kind;
            let tcp = value.tcp;
            let ball = value.ball;
            let square = value.square;
            json!({"type":kind,"isUse":tcp.is_use,"toolNum":tcp.tool_num,"zPos":ball.z_pos,"ballR":ball.ball_r,
                "setType":square.set_type,"diagonal":square.diagonal,"pointL":square.point_l,"pointH":square.point_h})
        });
        json!({"success":success,"message":message,"toolNumber":number,"readReturnCode":result,"tool":tool})
    }
}
