use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("div", &[("id", "base-jog-view"), ("class", "jog-view hidden"), ("role", "tabpanel")], &[
    text("\n                    "),
    tag("label", &[("class", "jog-frame-setting")], &[
        text("\n                        "),
        tag("span", &[("data-i18n", "legacy.Coordinate system")], &[text("좌표계")]),
        text("\n                        "),
        tag("select", &[("id", "jog-cartesian-frame"), ("aria-label", "좌표계"), ("data-i18n-aria-label", "legacy.Coordinate system")], &[
            text("\n                            "),
            tag("option", &[("value", "base"), ("data-i18n", "legacy.BASE")], &[text("베이스")]),
            text("\n                            "),
            tag("option", &[("value", "tool"), ("data-i18n-skip", "")], &[text("Tool")]),
            text("\n                            "),
            tag("option", &[("value", "wobj"), ("data-i18n-skip", "")], &[text("Wobj")]),
            text("\n                        "),
        ]),
        text("\n                    "),
    ]),
    text("\n                    "),
    tag("p", &[("id", "jog-tool-frame-hint"), ("class", "jog-tool-frame-hint hidden"), ("data-i18n", "legacy.Tool jog offset hint")], &[text("Tool 값은 현재 TCP 기준 상대 이동값입니다.")]),
    text("\n                    "),
    tag("div", &[("class", "base-gizmo-mode"), ("role", "group"), ("aria-label", "BASE 3D handle mode")], &[
        text("\n                        "),
        tag("button", &[("id", "btn-base-gizmo-translate"), ("type", "button"), ("class", "active"), ("title", "X/Y/Z translate handle")], &[
            text("\n                            "),
            tag("i", &[("class", "fa-solid fa-up-down-left-right")], &[]),
            text(" X · Y · Z\n                        "),
        ]),
        text("\n                        "),
        tag("button", &[("id", "btn-base-gizmo-rotate"), ("type", "button"), ("title", "RX/RY/RZ rotate handle")], &[
            text("\n                            "),
            tag("i", &[("class", "fa-solid fa-rotate")], &[]),
            text(" "),
            tag("span", &[("id", "base-gizmo-rotate-label")], &[text("RZ · RY · RX")]),
            text("\n                        "),
        ]),
        text("\n                    "),
    ]),
    text("\n                    "),
    tag("div", &[("class", "base-step-settings")], &[
        text("\n                        "),
        tag("label", &[], &[
            tag("span", &[], &[text("Move")]),
            text(" "),
            tag("input", &[("id", "base-move-step"), ("type", "number"), ("min", "0.1"), ("max", "100"), ("step", "0.1"), ("value", "10")], &[]),
            text(" mm"),
        ]),
        text("\n                        "),
        tag("label", &[], &[
            tag("span", &[], &[text("Rotate")]),
            text(" "),
            tag("input", &[("id", "base-rotate-step"), ("type", "number"), ("min", "0.1"), ("max", "30"), ("step", "0.1"), ("value", "5")], &[]),
            text(" deg"),
        ]),
        text("\n                    "),
    ]),
    text("\n                    "),
    tag("div", &[("class", "base-jog-section")], &[
        text("\n                        "),
        tag("span", &[("class", "base-jog-title")], &[text("TCP POSITION / BASE")]),
        text("\n                        "),
        tag("div", &[("class", "base-jog-grid")], &[
            text("\n                            "),
            tag("div", &[("class", "base-jog-row")], &[
                tag("strong", &[], &[text("X")]),
                tag("div", &[("class", "base-jog-buttons")], &[
                    tag("button", &[("type", "button"), ("data-base-jog", "move"), ("data-axis", "x"), ("data-direction", "-1")], &[text("−")]),
                    tag("button", &[("type", "button"), ("data-base-jog", "move"), ("data-axis", "x"), ("data-direction", "1")], &[text("+")]),
                ]),
                tag("label", &[("class", "base-jog-value")], &[
                    tag("input", &[("id", "tcp-x"), ("type", "number"), ("step", "0.5"), ("value", "0.00"), ("aria-label", "TCP X (mm)")], &[]),
                    tag("span", &[], &[text("mm")]),
                ]),
            ]),
            text("\n                            "),
            tag("div", &[("class", "base-jog-row")], &[
                tag("strong", &[], &[text("Y")]),
                tag("div", &[("class", "base-jog-buttons")], &[
                    tag("button", &[("type", "button"), ("data-base-jog", "move"), ("data-axis", "y"), ("data-direction", "-1")], &[text("−")]),
                    tag("button", &[("type", "button"), ("data-base-jog", "move"), ("data-axis", "y"), ("data-direction", "1")], &[text("+")]),
                ]),
                tag("label", &[("class", "base-jog-value")], &[
                    tag("input", &[("id", "tcp-y"), ("type", "number"), ("step", "0.5"), ("value", "0.00"), ("aria-label", "TCP Y (mm)")], &[]),
                    tag("span", &[], &[text("mm")]),
                ]),
            ]),
            text("\n                            "),
            tag("div", &[("class", "base-jog-row")], &[
                tag("strong", &[], &[text("Z")]),
                tag("div", &[("class", "base-jog-buttons")], &[
                    tag("button", &[("type", "button"), ("data-base-jog", "move"), ("data-axis", "z"), ("data-direction", "-1")], &[text("−")]),
                    tag("button", &[("type", "button"), ("data-base-jog", "move"), ("data-axis", "z"), ("data-direction", "1")], &[text("+")]),
                ]),
                tag("label", &[("class", "base-jog-value")], &[
                    tag("input", &[("id", "tcp-z"), ("type", "number"), ("step", "0.5"), ("value", "0.00"), ("aria-label", "TCP Z (mm)")], &[]),
                    tag("span", &[], &[text("mm")]),
                ]),
            ]),
            text("\n                        "),
        ]),
        text("\n                    "),
    ]),
    text("\n                    "),
    tag("div", &[("class", "base-jog-section")], &[
        text("\n                        "),
        tag("span", &[("class", "base-jog-title")], &[text("TCP ROTATION / BASE")]),
        text("\n                        "),
        tag("div", &[("class", "base-jog-grid")], &[
            text("\n                            "),
            tag("div", &[("class", "base-jog-row"), ("data-base-rotation-row", "z")], &[
                tag("strong", &[], &[text("RZ")]),
                tag("div", &[("class", "base-jog-buttons")], &[
                    tag("button", &[("type", "button"), ("data-base-jog", "rotate"), ("data-axis", "z"), ("data-direction", "-1")], &[text("−")]),
                    tag("button", &[("type", "button"), ("data-base-jog", "rotate"), ("data-axis", "z"), ("data-direction", "1")], &[text("+")]),
                ]),
                tag("label", &[("class", "base-jog-value")], &[
                    tag("input", &[("id", "tcp-rz"), ("type", "number"), ("step", "0.5"), ("value", "0.00"), ("aria-label", "TCP RZ (deg)")], &[]),
                    tag("span", &[], &[text("deg")]),
                ]),
            ]),
            text("\n                            "),
            tag("div", &[("class", "base-jog-row"), ("data-base-rotation-row", "y")], &[
                tag("strong", &[], &[text("RY")]),
                tag("div", &[("class", "base-jog-buttons")], &[
                    tag("button", &[("type", "button"), ("data-base-jog", "rotate"), ("data-axis", "y"), ("data-direction", "-1")], &[text("−")]),
                    tag("button", &[("type", "button"), ("data-base-jog", "rotate"), ("data-axis", "y"), ("data-direction", "1")], &[text("+")]),
                ]),
                tag("label", &[("class", "base-jog-value")], &[
                    tag("input", &[("id", "tcp-ry"), ("type", "number"), ("step", "0.5"), ("value", "0.00"), ("aria-label", "TCP RY (deg)")], &[]),
                    tag("span", &[], &[text("deg")]),
                ]),
            ]),
            text("\n                            "),
            tag("div", &[("class", "base-jog-row"), ("data-base-rotation-row", "x")], &[
                tag("strong", &[], &[text("RX")]),
                tag("div", &[("class", "base-jog-buttons")], &[
                    tag("button", &[("type", "button"), ("data-base-jog", "rotate"), ("data-axis", "x"), ("data-direction", "-1")], &[text("−")]),
                    tag("button", &[("type", "button"), ("data-base-jog", "rotate"), ("data-axis", "x"), ("data-direction", "1")], &[text("+")]),
                ]),
                tag("label", &[("class", "base-jog-value")], &[
                    tag("input", &[("id", "tcp-rx"), ("type", "number"), ("step", "0.5"), ("value", "0.00"), ("aria-label", "TCP RX (deg)")], &[]),
                    tag("span", &[], &[text("deg")]),
                ]),
            ]),
            text("\n                        "),
        ]),
        text("\n                        "),
        tag("div", &[("id", "snap-face-orientation-actions"), ("class", "snap-face-orientation-actions hidden"), ("role", "group"), ("aria-label", "선택 면 기준 TCP 방향"), ("data-i18n-aria-label", "legacy.선택 면 기준 TCP 방향")], &[
            text("\n                            "),
            tag("button", &[("id", "btn-snap-face-horizontal"), ("type", "button"), ("title", "선택 면과 수평"), ("aria-label", "선택 면과 수평"), ("data-i18n-title", "legacy.선택 면과 수평"), ("data-i18n-aria-label", "legacy.선택 면과 수평"), ("data-snap-face-orientation", "horizontal")], &[
                text("\n        "),
                tag("i", &[("class", "fa-solid fa-arrows-left-right"), ("aria-hidden", "true")], &[]),
                tag("span", &[("data-i18n", "legacy.선택 면과 수평")], &[text("선택 면과 수평")]),
                text("\n                            "),
            ]),
            text("\n                            "),
            tag("button", &[("id", "btn-snap-face-vertical"), ("type", "button"), ("title", "선택 면과 수직"), ("aria-label", "선택 면과 수직"), ("data-i18n-title", "legacy.선택 면과 수직"), ("data-i18n-aria-label", "legacy.선택 면과 수직"), ("data-snap-face-orientation", "vertical")], &[
                text("\n                                "),
                tag("i", &[("class", "fa-solid fa-arrows-up-down"), ("aria-hidden", "true")], &[]),
                tag("span", &[("data-i18n", "legacy.선택 면과 수직")], &[text("선택 면과 수직")]),
                text("\n                            "),
            ]),
            text("\n                        "),
        ]),
        text("\n                    "),
    ]),
    text("\n                "),
]);
