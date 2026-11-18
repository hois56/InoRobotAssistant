use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("aside", &[("id", "jog-panel"), ("class", "jog-panel hidden"), ("aria-label", "JOG Panel")], &[
    text("\n                "),
    tag("div", &[("class", "jog-panel-header")], &[
        text("\n                    "),
        tag("div", &[], &[
            text("\n                        "),
            tag("h2", &[], &[text("JOG Panel")]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("div", &[("class", "panel-header-actions")], &[
            text("\n                        "),
            tag("button", &[("id", "btn-reset-joints"), ("type", "button"), ("class", "jog-reset-btn"), ("title", "Reset all joints to 0 degrees")], &[
                tag("i", &[("class", "fa-solid fa-rotate-left")], &[]),
                text(" ZERO POINT"),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "popout"), ("data-panel-id", "jog-panel"), ("title", "별도 창으로 분리"), ("aria-label", "JOG 패널을 별도 창으로 분리")], &[
                tag("i", &[("class", "fa-solid fa-up-right-from-square")], &[]),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "hide"), ("data-panel-id", "jog-panel"), ("title", "숨기기"), ("aria-label", "JOG 패널 숨기기")], &[
                tag("i", &[("class", "fa-solid fa-eye-slash")], &[]),
            ]),
            text("\n                    "),
        ]),
        text("\n                "),
    ]),
    text("\n                "),
    tag("section", &[("id", "jog-robot-selection"), ("class", "jog-robot-selection hidden"), ("aria-label", "동시 JOG"), ("data-i18n-aria-label", "legacy.동시 JOG")], &[
        text("\n                    "),
        tag("div", &[("class", "jog-robot-selection-heading")], &[
            text("\n                        "),
            tag("strong", &[("data-i18n", "legacy.동시 JOG")], &[text("동시 JOG")]),
            text("\n                        "),
            tag("label", &[], &[
                tag("input", &[("id", "jog-select-all"), ("type", "checkbox")], &[]),
                tag("span", &[("data-i18n", "legacy.전체 선택")], &[text("전체 선택")]),
            ]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("div", &[("id", "jog-robot-list"), ("class", "jog-robot-list")], &[]),
        text("\n                "),
    ]),
    text("\n                "),
    tag("div", &[("class", "jog-mode-tabs"), ("role", "group"), ("aria-label", "JOG coordinate mode")], &[
        text("\n                    "),
        tag("button", &[("id", "btn-jog-joint-mode"), ("type", "button"), ("class", "jog-mode-btn"), ("aria-pressed", "false")], &[text("JOINT")]),
        text("\n                    "),
        tag("button", &[("id", "btn-jog-base-mode"), ("type", "button"), ("class", "jog-mode-btn active"), ("aria-pressed", "true"), ("data-i18n", "legacy.Cartesian")], &[text("직교")]),
        text("\n                    "),
        tag("button", &[("id", "btn-snap-move"), ("type", "button"), ("class", "jog-mode-btn jog-snap-move"), ("title", "스냅 이동"), ("aria-label", "스냅 이동"), ("aria-pressed", "false")], &[text("스냅 이동")]),
        text("\n                "),
    ]),
    text("\n                "),
    tag("div", &[("id", "joint-jog-view"), ("class", "jog-view"), ("role", "tabpanel")], &[
        text("\n                    "),
        tag("div", &[("id", "jog-controls"), ("class", "jog-controls")], &[]),
        text("\n                "),
    ]),
    text("\n                "),
    super::base_jog_view::VIEW,
    text("\n                "),
    tag("p", &[("id", "base-jog-status"), ("class", "base-jog-status hidden"), ("role", "status")], &[]),
    text("\n            "),
]);
