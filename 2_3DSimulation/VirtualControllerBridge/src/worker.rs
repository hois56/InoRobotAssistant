use crate::{fieldbus, outbox::Outbox, sdk::Sdk};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    net::Ipv4Addr,
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::{runtime::Handle, task::JoinHandle};

pub const DEFAULT_INTERVAL: u64 = 4;

pub enum Command {
    Connect { ip: Ipv4Addr, real: bool },
    Start(u64),
    Stop,
    Disconnect,
    Status,
    Zone(i32),
    Tool(i32),
    Shutdown,
}

#[derive(Default)]
pub struct Connection {
    pub connected: bool,
    pub local_virtual: Option<Ipv4Addr>,
}

pub struct Worker {
    pub id: i32,
    pub sdk: Arc<Sdk>,
    pub out: Arc<Outbox>,
    pub connection: Arc<Mutex<Connection>>,
    pub runtime: Handle,
    pub allow_real: bool,
}

struct Session {
    worker: Worker,
    target: Option<(Ipv4Addr, bool)>,
    connected: bool,
    streaming: bool,
    interval: Duration,
    next_tick: Instant,
    failures: Option<(Instant, u64)>,
    recovery: Option<String>,
    retry: u32,
    sequence: u64,
    next_output: Instant,
    output_index: i32,
    outputs: BTreeMap<i32, i32>,
    previous_fieldbus: fieldbus::Snapshot,
    fieldbus: Arc<Mutex<fieldbus::Snapshot>>,
    fieldbus_task: Option<JoinHandle<()>>,
}

impl Worker {
    pub fn run(self, commands: mpsc::Receiver<Command>) {
        let now = Instant::now();
        let mut session = Session {
            worker: self,
            target: None,
            connected: false,
            streaming: false,
            interval: Duration::from_millis(DEFAULT_INTERVAL),
            next_tick: now,
            failures: None,
            recovery: None,
            retry: 0,
            sequence: 0,
            next_output: now,
            output_index: 0,
            outputs: BTreeMap::new(),
            previous_fieldbus: fieldbus::Snapshot::default(),
            fieldbus: Arc::new(Mutex::new(fieldbus::Snapshot::default())),
            fieldbus_task: None,
        };
        while !session.worker.out.is_closed() {
            let delay = if session.streaming && session.target.is_some() {
                session.next_tick.saturating_duration_since(Instant::now())
            } else {
                Duration::from_secs(1)
            };
            match commands.recv_timeout(delay) {
                Ok(command) => {
                    if !session.handle(command) {
                        break;
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => (),
            }
            if session.streaming && session.target.is_some() && Instant::now() >= session.next_tick
            {
                session.tick();
            }
        }
        session.disconnect();
    }
}

impl Session {
    fn reply(&self, value: Value) {
        self.worker.out.send(value, true);
    }

    fn handle(&mut self, command: Command) -> bool {
        match command {
            Command::Connect {ip, real} => {
                self.disconnect();
                self.target = None;
                self.recovery = None;
                self.retry = 0;
                let result = if real && !self.worker.allow_real {
                    Err("Real controller access is disabled by local policy.".into())
                } else { self.connect(ip, real, 5) };
                if result.is_ok() { self.target = Some((ip,real)); self.next_tick = Instant::now(); }
                if result.is_err() { self.streaming = false; }
                self.reply(json!({"type":"connectResult","success":result.is_ok(),"message":result.err().unwrap_or_else(|| "Connected".into())}));
            }
            Command::Start(interval) => {
                self.streaming = self.connected;
                self.interval = Duration::from_millis(interval);
                self.next_tick = Instant::now();
                self.reply(json!({"type":"streamStartResult","success":self.connected,"interval":interval}));
            }
            Command::Stop => {
                self.streaming = false;
                self.reply(json!({"type":"streamStopResult","success":true}));
            }
            Command::Disconnect => {
                self.streaming = false;
                self.target = None;
                self.disconnect();
                self.reply(json!({"type":"disconnectResult","success":true}));
            }
            Command::Status => self.reply(json!({"type":"status","robotConnected":self.connected,"streamRunning":self.streaming})),
            Command::Zone(number) => self.reply(json!({"type":"interferenceZoneReadResult",
                "result":self.worker.sdk.zone(self.worker.id,number,self.connected)})),
            Command::Tool(number) => self.reply(json!({"type":"interferenceToolReadResult",
                "result":self.worker.sdk.tool(self.worker.id,number,self.connected)})),
            Command::Shutdown => {
                self.disconnect();
                self.reply(json!({"type":"shutdownResult","success":true}));
                return false;
            }
        }
        true
    }

    fn connect(&mut self, ip: Ipv4Addr, real: bool, timeout: i32) -> Result<(), String> {
        self.worker.sdk.connect(self.worker.id, ip, timeout)?;
        self.connected = true;
        self.next_output = Instant::now();
        *self.worker.connection.lock().unwrap() = Connection {
            connected: true,
            local_virtual: (!real && ip.is_loopback()).then_some(ip),
        };
        if !real {
            self.fieldbus_task = Some(
                self.worker
                    .runtime
                    .spawn(fieldbus::poll(ip, Arc::clone(&self.fieldbus))),
            );
        }
        Ok(())
    }

    fn disconnect(&mut self) {
        *self.worker.connection.lock().unwrap() = Connection::default();
        if let Some(task) = self.fieldbus_task.take() {
            task.abort();
        }
        self.fieldbus = Arc::new(Mutex::new(fieldbus::Snapshot::default()));
        self.previous_fieldbus = fieldbus::Snapshot::default();
        self.outputs.clear();
        self.output_index = 0;
        self.failures = None;
        if std::mem::take(&mut self.connected) {
            self.worker.sdk.disconnect(self.worker.id);
        }
    }

    fn tick(&mut self) {
        let started = Instant::now();
        self.next_tick = started + self.interval;
        if !self.connected {
            self.reconnect();
            return;
        }
        self.sequence += 1;
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let id = self.worker.id;
        let joints = match self.worker.sdk.joints(id) {
            Ok(joints) => joints,
            Err(code) => {
                self.failed_feedback(started, code);
                return;
            }
        };
        self.failures = None;
        let tcp = self.worker.sdk.pose(id);
        let mut changed = false;
        if started >= self.next_output {
            self.next_output = started + Duration::from_millis(3);
            let index = self.output_index;
            self.output_index = (index + 1) % 17;
            if let Some(value) = self.worker.sdk.output(id, index) {
                changed = self.outputs.insert(index, value) != Some(value);
            }
        }
        let fieldbus = self.fieldbus.lock().unwrap().clone();
        changed |= fieldbus != self.previous_fieldbus;
        self.worker.out.send(json!({"type":"robotState","data":{"sequence":self.sequence,"timestamp":timestamp,
            "joints":joints,"tcp":tcp.as_ref().map_or(&[][..], |pose| &pose[..]),"outputs":self.outputs,
            "fieldbusInputs":fieldbus.inputs,"fieldbusOutputs":fieldbus.outputs}}), changed);
        self.previous_fieldbus = fieldbus;
    }

    fn failed_feedback(&mut self, now: Instant, code: i32) {
        let (start, count) = self.failures.get_or_insert((now, 0));
        *count += 1;
        let span = now.duration_since(*start);
        if span < Duration::from_millis(100) {
            return;
        }
        let message = format!("Joint feedback failed {count} consecutive times over {} ms; last failure: return code {code}.", span.as_millis());
        self.disconnect();
        self.reply(json!({"type":"controllerConnectionLost","message":format!("Controller feedback was interrupted. {message} Reconnecting...")}));
        self.recovery = Some(message);
        self.schedule_retry();
    }

    fn schedule_retry(&mut self) {
        self.next_tick = Instant::now() + Duration::from_millis(250 << self.retry);
        self.retry = (self.retry + 1).min(4);
    }

    fn reconnect(&mut self) {
        let Some((ip, real)) = self.target else {
            return;
        };
        match self.connect(ip, real, 3) {
            Ok(()) => {
                let diagnostic = self.recovery.take().unwrap_or_default();
                self.retry = 0;
                self.next_tick = Instant::now();
                self.reply(json!({"type":"controllerReconnected","success":true,"message":format!("Connected. Recovery cause: {diagnostic}")}));
            }
            Err(error) => {
                self.reply(json!({"type":"controllerReconnectFailed","success":false,"message":format!("Reconnect failed: {error}")}));
                self.schedule_retry();
            }
        }
    }
}
