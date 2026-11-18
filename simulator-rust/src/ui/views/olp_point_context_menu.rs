use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("div", &[("id", "olp-point-context-menu"), ("class", "program-step-context-menu hidden"), ("role", "menu")], &[
    text("\n        "),
    tag("button", &[("id", "olp-point-write-current"), ("type", "button"), ("role", "menuitem")], &[
        text("\n            "),
        tag("i", &[("class", "fa-solid fa-location-crosshairs")], &[]),
        text("\n            현재 위치로 수정\n        "),
    ]),
    text("\n        "),
    tag("button", &[("id", "olp-point-move-target"), ("type", "button"), ("role", "menuitem")], &[
        text("\n            "),
        tag("i", &[("class", "fa-solid fa-person-walking")], &[]),
        text("\n            해당 위치로 이동\n        "),
    ]),
    text("\n    "),
]);
