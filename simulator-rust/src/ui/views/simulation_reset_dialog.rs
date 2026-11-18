use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("dialog", &[("id", "simulation-reset-dialog"), ("class", "simulation-reset-dialog"), ("aria-labelledby", "simulation-reset-dialog-title")], &[
    text("\n        "),
    tag("form", &[("method", "dialog")], &[
        text("\n            "),
        tag("div", &[("class", "simulation-reset-dialog-header")], &[
            text("\n                "),
            tag("i", &[("class", "fa-solid fa-triangle-exclamation"), ("aria-hidden", "true")], &[]),
            text("\n                "),
            tag("h2", &[("id", "simulation-reset-dialog-title")], &[text("시뮬레이션 초기화")]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("p", &[], &[text("모든 설정 및 모델이 초기화됩니다. 정말로 진행하시겠습니까?")]),
        text("\n            "),
        tag("div", &[("class", "simulation-reset-dialog-actions")], &[
            text("\n                "),
            tag("button", &[("id", "btn-cancel-simulation-reset"), ("type", "button"), ("class", "secondary")], &[text("아니오")]),
            text("\n                "),
            tag("button", &[("id", "btn-confirm-simulation-reset"), ("type", "button"), ("class", "primary")], &[text("예")]),
            text("\n            "),
        ]),
        text("\n        "),
    ]),
    text("\n    "),
]);
