use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("div", &[("id", "program-step-context-menu"), ("class", "program-step-context-menu hidden"), ("role", "menu")], &[
    text("\n        "),
    tag("button", &[("id", "program-overwrite-point"), ("type", "button"), ("role", "menuitem"), ("title", "선택 포인트 덮어쓰기"), ("aria-label", "선택 포인트 덮어쓰기"), ("data-i18n-title", "legacy.선택 포인트 덮어쓰기"), ("data-i18n-aria-label", "legacy.선택 포인트 덮어쓰기")], &[
        text("\n            "),
        tag("i", &[("class", "fa-solid fa-rotate")], &[]),
        text("\n            "),
        tag("span", &[("data-i18n", "legacy.선택 포인트 덮어쓰기")], &[text("선택 포인트 덮어쓰기")]),
        text("\n        "),
    ]),
    text("\n        "),
    tag("button", &[("id", "program-show-position-value"), ("type", "button"), ("role", "menuitem")], &[
        text("\n            "),
        tag("i", &[("class", "fa-solid fa-location-crosshairs")], &[]),
        text("\n            위치 값 확인\n        "),
    ]),
    text("\n        "),
    tag("button", &[("id", "program-delete-context-step"), ("class", "model-context-danger"), ("type", "button"), ("role", "menuitem"), ("title", "삭제"), ("aria-label", "삭제"), ("data-i18n-title", "legacy.삭제"), ("data-i18n-aria-label", "legacy.삭제")], &[
        text("\n            "),
        tag("i", &[("class", "fa-solid fa-trash")], &[]),
        text("\n            "),
        tag("span", &[("data-i18n", "legacy.삭제")], &[text("삭제")]),
        text("\n        "),
    ]),
    text("\n    "),
]);
