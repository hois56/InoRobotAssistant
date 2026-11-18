use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("dialog", &[("id", "tool-attachment-dialog"), ("class", "simulation-reset-dialog tool-attachment-dialog"), ("aria-labelledby", "tool-attachment-dialog-title"), ("aria-describedby", "tool-attachment-dialog-description")], &[
    text("\n        "),
    tag("form", &[("method", "dialog")], &[
        text("\n            "),
        tag("div", &[("class", "simulation-reset-dialog-header")], &[
            text("\n                "),
            tag("i", &[("class", "fa-solid fa-screwdriver-wrench"), ("aria-hidden", "true")], &[]),
            text("\n                "),
            tag("h2", &[("id", "tool-attachment-dialog-title"), ("data-i18n", "legacy.Tool 설치 로봇 선택")], &[text("Tool 설치 로봇 선택")]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("p", &[("id", "tool-attachment-dialog-description")], &[]),
        text("\n            "),
        tag("div", &[("class", "robot-model-choice-target")], &[
            text("\n                "),
            tag("span", &[("id", "tool-attachment-source-label"), ("data-i18n", "legacy.설치할 모델")], &[text("설치할 모델")]),
            text("\n                "),
            tag("strong", &[("id", "tool-attachment-source-name")], &[text("-")]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("label", &[("class", "tool-attachment-robot-field"), ("for", "tool-attachment-robot")], &[
            text("\n                "),
            tag("span", &[("id", "tool-attachment-robot-label"), ("data-i18n", "legacy.설치할 로봇")], &[text("설치할 로봇")]),
            text("\n                "),
            tag("select", &[("id", "tool-attachment-robot"), ("aria-label", "설치할 로봇"), ("data-i18n-aria-label", "legacy.설치할 로봇")], &[]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("div", &[("class", "simulation-reset-dialog-actions")], &[
            text("\n                "),
            tag("button", &[("id", "btn-cancel-tool-attachment"), ("type", "button"), ("class", "secondary"), ("data-i18n", "legacy.취소")], &[text("취소")]),
            text("\n                "),
            tag("button", &[("id", "btn-confirm-tool-attachment"), ("type", "button"), ("class", "primary"), ("data-i18n", "legacy.Tool에 설치")], &[text("Tool에 설치")]),
            text("\n            "),
        ]),
        text("\n        "),
    ]),
    text("\n    "),
]);
