use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("aside", &[("id", "view-presets-panel"), ("class", "view-presets-panel panel-user-hidden"), ("aria-label", "사용자 뷰 저장")], &[
    text("\n                "),
    tag("div", &[("class", "view-presets-header")], &[
        text("\n                    "),
        tag("h2", &[], &[
            tag("i", &[("class", "fa-solid fa-camera")], &[]),
            text(" 사용자 뷰"),
        ]),
        text("\n                    "),
        tag("div", &[("class", "panel-header-actions")], &[
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "popout"), ("data-panel-id", "view-presets-panel"), ("title", "새 창으로 열기"), ("aria-label", "사용자 뷰 패널을 새 창으로 열기")], &[
                tag("i", &[("class", "fa-solid fa-up-right-from-square")], &[]),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "hide"), ("data-panel-id", "view-presets-panel"), ("title", "숨기기"), ("aria-label", "사용자 뷰 창 숨기기")], &[
                tag("i", &[("class", "fa-solid fa-eye-slash")], &[]),
            ]),
            text("\n                    "),
        ]),
        text("\n                "),
    ]),
    text("\n                "),
    tag("div", &[("class", "view-presets-content")], &[
        text("\n                    "),
        tag("div", &[("class", "view-record-actions")], &[
            tag("button", &[("id", "view-record"), ("type", "button"), ("aria-pressed", "false")], &[
                tag("span", &[("class", "record-symbol"), ("aria-hidden", "true")], &[]),
                tag("span", &[("data-record-label", "")], &[text("녹화 시작")]),
            ]),
            tag("button", &[("id", "view-record-edit"), ("type", "button"), ("aria-haspopup", "dialog"), ("aria-controls", "recording-editor")], &[
                tag("i", &[("class", "fa-solid fa-scissors"), ("aria-hidden", "true")], &[]),
                text("편집"),
            ]),
        ]),
        tag("div", &[("class", "view-record-actions")], &[
            tag("button", &[("id", "view-record-end"), ("type", "button"), ("disabled", "")], &[text("녹화 종료")]),
            tag("button", &[("id", "view-record-save"), ("type", "button"), ("disabled", "")], &[text("녹화 저장")]),
        ]),
        text("\n                    "),
        super::view_presets_list::VIEW,
        text("\n                "),
    ]),
    text("\n            "),
]);
