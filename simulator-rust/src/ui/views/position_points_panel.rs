use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("aside", &[("id", "position-points-panel"), ("class", "position-points-panel panel-user-hidden panel-edge-resizable"), ("aria-label", "P.pts")], &[
    text("\n                "),
    tag("div", &[("class", "tcp-profile-panel-header")], &[
        text("\n                    "),
        tag("h2", &[], &[
            tag("i", &[("class", "fa-solid fa-location-dot")], &[]),
            text(" P.pts "),
            tag("small", &[("data-pts-count", "")], &[text("0")]),
        ]),
        text("\n                    "),
        tag("div", &[("class", "panel-header-actions")], &[
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "popout"), ("data-panel-id", "position-points-panel"), ("title", "별도 창으로 분리"), ("aria-label", "별도 창으로 분리"), ("data-i18n-title", "legacy.별도 창으로 분리"), ("data-i18n-aria-label", "legacy.별도 창으로 분리")], &[
                tag("i", &[("class", "fa-solid fa-up-right-from-square")], &[]),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "hide"), ("data-panel-id", "position-points-panel"), ("title", "숨기기"), ("aria-label", "숨기기"), ("data-i18n-title", "legacy.숨기기"), ("data-i18n-aria-label", "legacy.숨기기")], &[
                tag("i", &[("class", "fa-solid fa-eye-slash")], &[]),
            ]),
            text("\n                    "),
        ]),
        text("\n                "),
    ]),
    text("\n                "),
    tag("div", &[("class", "position-points-body"), ("data-panel-drag-ignore", "")], &[
        text("\n                    "),
        tag("div", &[("class", "position-points-toolbar")], &[
            text("\n                        "),
            tag("select", &[("data-pts-robot", ""), ("aria-label", "로봇"), ("data-i18n-aria-label", "legacy.ROBOT")], &[]),
            text("\n                        "),
            tag("label", &[("class", "position-points-standardization")], &[
                tag("input", &[("type", "checkbox"), ("data-pts-standardized", ""), ("checked", "")], &[]),
                tag("span", &[("data-i18n", "legacy.표준화 모드")], &[text("표준화 모드")]),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-pts-trajectory", ""), ("data-i18n", "legacy.곡선에서 위치 생성")], &[text("곡선에서 위치 생성")]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-pts-new", ""), ("aria-keyshortcuts", "A")], &[
                tag("span", &[("data-i18n", "legacy.위치 추가")], &[text("위치 추가")]),
                tag("kbd", &[], &[text("A")]),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-pts-update", ""), ("disabled", ""), ("aria-keyshortcuts", "U")], &[
                tag("span", &[("data-i18n", "legacy.위치 덮어쓰기")], &[text("위치 덮어쓰기")]),
                tag("kbd", &[], &[text("U")]),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-pts-delete", ""), ("disabled", ""), ("aria-keyshortcuts", "Delete")], &[
                tag("span", &[("data-i18n", "legacy.위치 삭제")], &[text("위치 삭제")]),
                tag("kbd", &[], &[text("Del")]),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-pts-move", ""), ("disabled", ""), ("aria-keyshortcuts", "M")], &[
                tag("span", &[("data-i18n", "legacy.위치로 이동")], &[text("위치로 이동")]),
                tag("kbd", &[], &[text("M")]),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-pts-export", ""), ("disabled", ""), ("data-i18n", "legacy.pts 내보내기")], &[text("P.pts 내보내기")]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("div", &[("class", "position-points-table-scroll")], &[
            text("\n                        "),
            tag("table", &[("aria-label", "P.pts"), ("role", "grid"), ("aria-multiselectable", "true")], &[
                tag("thead", &[], &[
                    tag("tr", &[], &[
                        tag("th", &[], &[text("ID")]),
                        tag("th", &[], &[text("Name")]),
                        tag("th", &[], &[text("X")]),
                        tag("th", &[], &[text("Y")]),
                        tag("th", &[], &[text("Z")]),
                        tag("th", &[], &[text("A")]),
                        tag("th", &[], &[text("B")]),
                        tag("th", &[], &[text("C")]),
                        tag("th", &[], &[text("Arm 0")]),
                        tag("th", &[], &[text("Arm 1")]),
                        tag("th", &[], &[text("Arm 2")]),
                        tag("th", &[], &[text("Arm 3")]),
                        tag("th", &[], &[text("E1")]),
                        tag("th", &[], &[text("E2")]),
                        tag("th", &[], &[text("E3")]),
                        tag("th", &[], &[text("E4")]),
                        tag("th", &[], &[text("E5")]),
                        tag("th", &[], &[text("E6")]),
                    ]),
                ]),
                tag("tbody", &[], &[]),
            ]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("p", &[("data-pts-empty", ""), ("data-i18n", "legacy.포인트 레코드가 없습니다.")], &[text("포인트 레코드가 없습니다.")]),
        text("\n                    "),
        tag("p", &[("data-pts-error", ""), ("role", "alert")], &[]),
        text("\n                "),
    ]),
    text("\n            "),
]);
