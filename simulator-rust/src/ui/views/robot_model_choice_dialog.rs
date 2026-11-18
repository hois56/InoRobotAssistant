use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("dialog", &[("id", "robot-model-choice-dialog"), ("class", "simulation-reset-dialog robot-model-choice-dialog"), ("aria-labelledby", "robot-model-choice-dialog-title"), ("aria-describedby", "robot-model-choice-description")], &[
    text("\n        "),
    tag("form", &[("method", "dialog")], &[
        text("\n            "),
        tag("div", &[("class", "simulation-reset-dialog-header")], &[
            text("\n                "),
            tag("i", &[("class", "fa-solid fa-robot"), ("aria-hidden", "true")], &[]),
            text("\n                "),
            tag("h2", &[("id", "robot-model-choice-dialog-title")], &[text("로봇 모델 선택")]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("p", &[("id", "robot-model-choice-description")], &[text("로봇 모델을 변경하거나 추가할 수 있습니다. 아래에서 작업을 선택하세요.")]),
        text("\n            "),
        tag("div", &[("class", "robot-model-choice-target")], &[
            text("\n                "),
            tag("span", &[("id", "robot-model-choice-selected-label")], &[text("선택한 로봇")]),
            text("\n                "),
            tag("strong", &[("id", "robot-model-choice-name")], &[text("-")]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("div", &[("class", "simulation-reset-dialog-actions")], &[
            text("\n                "),
            tag("button", &[("id", "btn-cancel-robot-model-choice"), ("type", "button"), ("class", "secondary")], &[text("취소")]),
            text("\n                "),
            tag("button", &[("id", "btn-add-robot-model-choice"), ("type", "button"), ("class", "choice-add")], &[text("로봇 추가")]),
            text("\n                "),
            tag("button", &[("id", "btn-replace-robot-model-choice"), ("type", "button"), ("class", "primary choice-replace")], &[text("로봇 변경")]),
            text("\n            "),
        ]),
        text("\n        "),
    ]),
    text("\n    "),
]);
