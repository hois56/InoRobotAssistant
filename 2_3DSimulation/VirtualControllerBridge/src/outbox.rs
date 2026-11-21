use serde_json::Value;
use std::{collections::VecDeque, sync::Mutex};
use tokio::sync::Notify;

#[derive(Default)]
struct Queue {
    reliable: VecDeque<Value>,
    latest_pose: Option<Value>,
    closed: bool,
}

#[derive(Default)]
pub struct Outbox {
    queue: Mutex<Queue>,
    changed: Notify,
}

impl Outbox {
    pub fn send(&self, message: Value, reliable: bool) {
        let mut queue = self.queue.lock().unwrap();
        if queue.closed {
            return;
        }
        if reliable {
            // A control reply or new IO state supersedes an unsent older pose.
            // Never silently discard an observed IO transition or a reply.
            queue.latest_pose = None;
            if queue.reliable.len() == 128 {
                queue.closed = true;
                queue.reliable.clear();
            } else {
                queue.reliable.push_back(message);
            }
        } else {
            queue.latest_pose = Some(message);
        }
        drop(queue);
        self.changed.notify_one();
    }

    pub fn close(&self) {
        self.queue.lock().unwrap().closed = true;
        self.changed.notify_one();
    }

    pub fn is_closed(&self) -> bool {
        self.queue.lock().unwrap().closed
    }

    pub async fn receive(&self) -> Option<Value> {
        loop {
            let notified = self.changed.notified();
            {
                let mut queue = self.queue.lock().unwrap();
                if queue.closed {
                    return None;
                }
                if let Some(message) = queue
                    .reliable
                    .pop_front()
                    .or_else(|| queue.latest_pose.take())
                {
                    return Some(message);
                }
            }
            notified.await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn a_slow_writer_keeps_io_edges_and_only_the_latest_pose() {
        let out = Outbox::default();
        out.send(json!("io-on"), true);
        out.send(json!("pose-1"), false);
        out.send(json!("io-off"), true);
        for n in 2..10_000 {
            out.send(json!(n), false);
        }
        assert_eq!(out.receive().await, Some(json!("io-on")));
        assert_eq!(out.receive().await, Some(json!("io-off")));
        assert_eq!(out.receive().await, Some(json!(9999)));
        out.close();
        assert_eq!(out.receive().await, None);
    }

    #[tokio::test]
    async fn control_overflow_closes_the_session() {
        let out = Outbox::default();
        for n in 0..129 {
            out.send(json!(n), true);
        }
        assert_eq!(out.receive().await, None);
    }
}
