use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("aside", &[("id", "arm-load-panel"), ("class", "arm-load-panel panel-user-hidden panel-edge-resizable"), ("aria-label", "암 로드 설정"), ("data-i18n-aria-label", "legacy.암 로드 설정")], &[
    text("\n                "),
    tag("div", &[("class", "arm-load-panel-header")], &[
        text("\n                    "),
        tag("div", &[], &[
            text("\n                        "),
            tag("span", &[("data-i18n", "legacy.암 로드")], &[text("암 로드")]),
            text("\n                        "),
            tag("h2", &[], &[
                tag("i", &[("class", "fa-solid fa-gears"), ("aria-hidden", "true")], &[]),
                text(" "),
                tag("span", &[("data-i18n", "legacy.암 로드")], &[text("암 로드")]),
            ]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("div", &[("class", "panel-header-actions")], &[
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "popout"), ("data-panel-id", "arm-load-panel"), ("title", "별도 창으로 분리"), ("aria-label", "암 로드 설정을 별도 창으로 분리"), ("data-i18n-title", "legacy.별도 창으로 분리"), ("data-i18n-aria-label", "legacy.암 로드 설정을 별도 창으로 분리")], &[
                tag("i", &[("class", "fa-solid fa-up-right-from-square")], &[]),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "hide"), ("data-panel-id", "arm-load-panel"), ("title", "숨기기"), ("aria-label", "암 로드 설정 숨기기"), ("data-i18n-title", "legacy.숨기기"), ("data-i18n-aria-label", "legacy.암 로드 설정 숨기기")], &[
                tag("i", &[("class", "fa-solid fa-eye-slash")], &[]),
            ]),
            text("\n                    "),
        ]),
        text("\n                "),
    ]),
    text("\n                "),
    tag("div", &[("class", "arm-load-content")], &[
        text("\n                    "),
        tag("div", &[("class", "arm-load-list-heading")], &[
            text("\n                        "),
            tag("strong", &[("data-i18n", "legacy.등록된 암 로드")], &[text("등록된 암 로드")]),
            text("\n                        "),
            tag("span", &[("id", "arm-load-count"), ("class", "arm-load-count")], &[text("0")]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("div", &[("id", "arm-load-list"), ("class", "arm-load-list"), ("role", "list")], &[]),
        text("\n                    "),
        tag("p", &[("id", "arm-load-empty"), ("class", "arm-load-empty")], &[text("3D 파일 불러오기에서 암 로드를 선택하세요.")]),
        text("\n                    "),
        super::arm_load_editor::VIEW,
        text("\n                "),
    ]),
    text("\n            "),
]);
