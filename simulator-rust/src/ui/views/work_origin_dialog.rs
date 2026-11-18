use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("dialog", &[("id", "work-origin-dialog"), ("class", "work-origin-dialog"), ("tabindex", "-1"), ("aria-labelledby", "work-origin-dialog-title")], &[
    text("\n        "),
    tag("form", &[("method", "dialog")], &[
        text("\n            "),
        tag("div", &[("class", "work-origin-dialog-header")], &[
            text("\n                "),
            tag("div", &[], &[
                text("\n                    "),
                tag("span", &[("data-i18n", "legacy.Work Origin")], &[text("Work Origin")]),
                text("\n                    "),
                tag("h2", &[("id", "work-origin-dialog-title"), ("data-i18n", "legacy.Work Origin")], &[text("Work Origin")]),
                text("\n                "),
            ]),
            text("\n                "),
            tag("strong", &[("id", "work-origin-robot-name")], &[text("-")]),
            text("\n                "),
            tag("div", &[("class", "work-origin-dialog-header-actions panel-header-actions")], &[
                text("\n                    "),
                tag("button", &[("type", "button"), ("data-panel-action", "popout"), ("data-panel-id", "work-origin-dialog"), ("title", "별도 창으로 분리"), ("aria-label", "작업원점 창을 별도 창으로 분리")], &[
                    tag("i", &[("class", "fa-solid fa-up-right-from-square")], &[]),
                ]),
                text("\n                    "),
                tag("button", &[("type", "button"), ("data-panel-action", "hide"), ("data-panel-id", "work-origin-dialog"), ("title", "숨기기"), ("aria-label", "작업원점 창 숨기기")], &[
                    tag("i", &[("class", "fa-solid fa-eye-slash")], &[]),
                ]),
                text("\n                "),
            ]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("p", &[("class", "work-origin-help"), ("data-i18n", "legacy.작업원점 관절 등록 안내")], &[text("현재 로봇의 관절 위치를 작업원점으로 등록하고, 등록 위치 도달 시 출력 비트를 ON으로 표시합니다.")]),
        text("\n            "),
        tag("div", &[("class", "work-origin-fields")], &[
            text("\n                "),
            tag("label", &[], &[
                text("\n                    "),
                tag("span", &[("data-i18n", "legacy.도달 출력 비트")], &[text("도달 출력 비트")]),
                text("\n                    "),
                tag("span", &[("class", "work-origin-output-input")], &[
                    text("\n                        "),
                    tag("span", &[("aria-hidden", "true")], &[text("Out [")]),
                    text("\n                        "),
                    tag("input", &[("id", "work-origin-output-bit"), ("type", "text"), ("inputmode", "numeric"), ("pattern", "[0-9]*"), ("autocomplete", "off"), ("value", "519"), ("aria-label", "출력 비트 번호"), ("data-i18n-aria-label", "legacy.출력 비트 번호")], &[]),
                    text("\n                        "),
                    tag("span", &[("aria-hidden", "true")], &[text("]")]),
                    text("\n                    "),
                ]),
                text("\n                "),
            ]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("p", &[("id", "work-origin-summary"), ("class", "work-origin-summary"), ("role", "status")], &[]),
        text("\n            "),
        tag("p", &[("id", "work-origin-status"), ("class", "work-origin-status"), ("role", "alert")], &[]),
        text("\n            "),
        tag("div", &[("class", "work-origin-dialog-actions")], &[
            text("\n                "),
            tag("button", &[("id", "btn-move-work-origin"), ("type", "button"), ("data-i18n", "legacy.Work Origin으로 이동")], &[text("Work Origin으로 이동")]),
            text("\n                "),
            tag("button", &[("id", "btn-register-work-origin"), ("type", "button"), ("class", "primary"), ("data-i18n", "legacy.현재 위치 등록")], &[text("현재 위치 등록")]),
            text("\n            "),
        ]),
        text("\n        "),
    ]),
    text("\n    "),
]);
