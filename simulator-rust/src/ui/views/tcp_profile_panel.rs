use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("aside", &[("id", "tcp-profile-panel"), ("class", "tcp-profile-panel frame-settings-panel panel-user-hidden"), ("aria-label", "Tool 설정")], &[
    text("\n                "),
    tag("div", &[("class", "tcp-profile-panel-header")], &[
        text("\n                    "),
        tag("h2", &[], &[
            tag("i", &[("class", "fa-solid fa-crosshairs")], &[]),
            text(" Tool 설정"),
        ]),
        text("\n                    "),
        tag("div", &[("class", "panel-header-actions")], &[
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "popout"), ("data-panel-id", "tcp-profile-panel"), ("title", "별도 창으로 분리"), ("aria-label", "Tool 설정")], &[
                tag("i", &[("class", "fa-solid fa-up-right-from-square")], &[]),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "hide"), ("data-panel-id", "tcp-profile-panel"), ("title", "숨기기"), ("aria-label", "숨기기")], &[
                tag("i", &[("class", "fa-solid fa-eye-slash")], &[]),
            ]),
            text("\n                    "),
        ]),
        text("\n                "),
    ]),
    text("\n                "),
    super::tcp_profile_manager::VIEW,
    text("\n            "),
]);
