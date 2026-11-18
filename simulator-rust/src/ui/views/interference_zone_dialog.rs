use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("dialog", &[("id", "interference-zone-dialog"), ("class", "interference-zone-dialog"), ("aria-labelledby", "interference-zone-dialog-title")], &[
    text("\n        "),
    tag("form", &[("method", "dialog"), ("id", "interference-zone-form")], &[
        text("\n            "),
        tag("div", &[("class", "interference-zone-dialog-header")], &[
            text("\n                "),
            tag("div", &[], &[
                text("\n                    "),
                tag("span", &[], &[text("INTERFERENCE ZONE")]),
                text("\n                    "),
                tag("h2", &[("id", "interference-zone-dialog-title")], &[text("간섭영역 0 설정")]),
                text("\n                "),
            ]),
            text("\n                "),
            tag("button", &[("id", "interference-zone-close"), ("type", "button"), ("aria-label", "닫기")], &[
                tag("i", &[("class", "fa-solid fa-xmark")], &[]),
            ]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("div", &[("class", "interference-zone-step-tabs")], &[
            text("\n                "),
            tag("span", &[("class", "active"), ("data-interference-step-indicator", "basic")], &[text("1 기본 설정")]),
            text("\n                "),
            tag("span", &[("data-interference-step-indicator", "geometry")], &[text("2 영역 형상")]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("section", &[("class", "interference-zone-step"), ("data-interference-step", "basic")], &[
            text("\n                "),
            tag("div", &[("class", "interference-zone-field-grid")], &[
                text("\n                    "),
                tag("label", &[("class", "wide")], &[
                    tag("span", &[], &[text("Remarks")]),
                    tag("input", &[("id", "interference-zone-remarks"), ("type", "text"), ("maxlength", "120"), ("autocomplete", "off")], &[]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("적용 로봇")]),
                    tag("select", &[("id", "interference-zone-target-robot")], &[]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[("data-i18n", "legacy.좌표 기준 로봇")], &[text("좌표 기준 로봇")]),
                    tag("select", &[("id", "interference-zone-coordinate-robot")], &[]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[("data-i18n", "legacy.좌표 기준 Wobj")], &[text("좌표 기준 Wobj")]),
                    tag("select", &[("id", "interference-zone-coordinate-wobj")], &[]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("Inside and outside")]),
                    tag("select", &[("id", "interference-zone-inside-outside")], &[
                        tag("option", &[("value", "inside")], &[text("Inside")]),
                        tag("option", &[("value", "outside")], &[text("Outside")]),
                    ]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("Trigger alarm and stop")]),
                    tag("select", &[("id", "interference-zone-trigger")], &[
                        tag("option", &[("value", "yes")], &[text("YES")]),
                        tag("option", &[("value", "no")], &[text("NO")]),
                    ]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("Safety distance")]),
                    tag("input", &[("id", "interference-zone-safety"), ("type", "number"), ("min", "0"), ("max", "10000"), ("step", "0.001")], &[]),
                    tag("small", &[], &[text("mm")]),
                ]),
                text("\n                "),
            ]),
            text("\n                "),
            tag("div", &[("class", "interference-signal-grid")], &[
                text("\n                    "),
                tag("label", &[("class", "interference-signal-row")], &[
                    tag("input", &[("id", "interference-zone-in-enabled"), ("type", "checkbox")], &[]),
                    tag("span", &[], &[text("IN")]),
                    tag("input", &[("id", "interference-zone-in-signal"), ("type", "number"), ("min", "0"), ("max", "255"), ("step", "1"), ("value", "0")], &[]),
                    tag("small", &[], &[text("-1: OFF")]),
                ]),
                text("\n                    "),
                tag("label", &[("class", "interference-signal-row")], &[
                    tag("input", &[("id", "interference-zone-out-enabled"), ("type", "checkbox")], &[]),
                    tag("span", &[], &[text("OUT")]),
                    tag("input", &[("id", "interference-zone-out-signal"), ("type", "number"), ("min", "0"), ("max", "255"), ("step", "1"), ("value", "0")], &[]),
                    tag("small", &[], &[text("-1: OFF")]),
                ]),
                text("\n                "),
            ]),
            text("\n                "),
            tag("p", &[("class", "interference-zone-note")], &[text("IN이 ON이면 해당 영역은 비활성화됩니다. OUT은 영역 밖에서 ON, 영역 안에서 OFF입니다.")]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("section", &[("class", "interference-zone-step hidden"), ("data-interference-step", "geometry")], &[
            text("\n                "),
            tag("label", &[("class", "interference-zone-method")], &[
                tag("span", &[], &[text("Setting method")]),
                tag("select", &[("id", "interference-zone-method")], &[
                    tag("option", &[("value", "diagonal")], &[text("Diagonal point")]),
                    tag("option", &[("value", "datumOffset")], &[text("Datum point + offset")]),
                ]),
            ]),
            text("\n                "),
            tag("div", &[("id", "interference-zone-diagonal-fields"), ("class", "interference-point-block")], &[
                text("\n                    "),
                tag("div", &[("class", "interference-point-heading")], &[
                    tag("strong", &[("data-interference-point-title", "p1")], &[text("P1 (World mm)")]),
                    tag("div", &[("class", "interference-point-actions")], &[
                        tag("button", &[("type", "button"), ("data-interference-get-point", "p1")], &[text("Get current point")]),
                        tag("button", &[("type", "button"), ("data-interference-snap-point", "p1")], &[text("Get snap point")]),
                    ]),
                ]),
                text("\n                    "),
                tag("div", &[("class", "interference-coordinate-grid")], &[
                    tag("label", &[], &[
                        text("X"),
                        tag("input", &[("data-interference-point", "p1"), ("data-axis", "0"), ("type", "number"), ("min", "-10000"), ("max", "10000"), ("step", "0.001")], &[]),
                    ]),
                    tag("label", &[], &[
                        text("Y"),
                        tag("input", &[("data-interference-point", "p1"), ("data-axis", "1"), ("type", "number"), ("min", "-10000"), ("max", "10000"), ("step", "0.001")], &[]),
                    ]),
                    tag("label", &[], &[
                        text("Z"),
                        tag("input", &[("data-interference-point", "p1"), ("data-axis", "2"), ("type", "number"), ("min", "-10000"), ("max", "10000"), ("step", "0.001")], &[]),
                    ]),
                ]),
                text("\n                    "),
                tag("div", &[("class", "interference-point-heading")], &[
                    tag("strong", &[("data-interference-point-title", "p2")], &[text("P2 (World mm)")]),
                    tag("div", &[("class", "interference-point-actions")], &[
                        tag("button", &[("type", "button"), ("data-interference-get-point", "p2")], &[text("Get current point")]),
                        tag("button", &[("type", "button"), ("data-interference-snap-point", "p2")], &[text("Get snap point")]),
                    ]),
                ]),
                text("\n                    "),
                tag("div", &[("class", "interference-coordinate-grid")], &[
                    tag("label", &[], &[
                        text("X"),
                        tag("input", &[("data-interference-point", "p2"), ("data-axis", "0"), ("type", "number"), ("min", "-10000"), ("max", "10000"), ("step", "0.001")], &[]),
                    ]),
                    tag("label", &[], &[
                        text("Y"),
                        tag("input", &[("data-interference-point", "p2"), ("data-axis", "1"), ("type", "number"), ("min", "-10000"), ("max", "10000"), ("step", "0.001")], &[]),
                    ]),
                    tag("label", &[], &[
                        text("Z"),
                        tag("input", &[("data-interference-point", "p2"), ("data-axis", "2"), ("type", "number"), ("min", "-10000"), ("max", "10000"), ("step", "0.001")], &[]),
                    ]),
                ]),
                text("\n                "),
            ]),
            text("\n                "),
            tag("div", &[("id", "interference-zone-datum-fields"), ("class", "interference-point-block hidden")], &[
                text("\n                    "),
                tag("div", &[("class", "interference-point-heading")], &[
                    tag("strong", &[("data-interference-point-title", "datum")], &[text("Datum point (World mm)")]),
                    tag("div", &[("class", "interference-point-actions")], &[
                        tag("button", &[("type", "button"), ("data-interference-get-point", "datum")], &[text("Get datum point")]),
                        tag("button", &[("type", "button"), ("data-interference-snap-point", "datum")], &[text("Get snap point")]),
                    ]),
                ]),
                text("\n                    "),
                tag("div", &[("class", "interference-coordinate-grid")], &[
                    tag("label", &[], &[
                        text("X"),
                        tag("input", &[("data-interference-point", "datum"), ("data-axis", "0"), ("type", "number"), ("min", "-10000"), ("max", "10000"), ("step", "0.001")], &[]),
                    ]),
                    tag("label", &[], &[
                        text("Y"),
                        tag("input", &[("data-interference-point", "datum"), ("data-axis", "1"), ("type", "number"), ("min", "-10000"), ("max", "10000"), ("step", "0.001")], &[]),
                    ]),
                    tag("label", &[], &[
                        text("Z"),
                        tag("input", &[("data-interference-point", "datum"), ("data-axis", "2"), ("type", "number"), ("min", "-10000"), ("max", "10000"), ("step", "0.001")], &[]),
                    ]),
                ]),
                text("\n                    "),
                tag("div", &[("class", "interference-point-heading")], &[
                    tag("strong", &[], &[text("Offset (mm)")]),
                ]),
                text("\n                    "),
                tag("div", &[("class", "interference-coordinate-grid")], &[
                    tag("label", &[], &[
                        text("Lx"),
                        tag("input", &[("data-interference-point", "offset"), ("data-axis", "0"), ("type", "number"), ("min", "-10000"), ("max", "10000"), ("step", "0.001")], &[]),
                    ]),
                    tag("label", &[], &[
                        text("Ly"),
                        tag("input", &[("data-interference-point", "offset"), ("data-axis", "1"), ("type", "number"), ("min", "-10000"), ("max", "10000"), ("step", "0.001")], &[]),
                    ]),
                    tag("label", &[], &[
                        text("Lz"),
                        tag("input", &[("data-interference-point", "offset"), ("data-axis", "2"), ("type", "number"), ("min", "-10000"), ("max", "10000"), ("step", "0.001")], &[]),
                    ]),
                ]),
                text("\n                "),
            ]),
            text("\n                "),
            tag("p", &[("id", "interference-zone-validation"), ("class", "interference-zone-validation"), ("role", "alert")], &[]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("div", &[("class", "interference-zone-dialog-actions")], &[
            text("\n                "),
            tag("button", &[("id", "interference-zone-previous"), ("type", "button"), ("class", "secondary hidden")], &[text("Previous")]),
            text("\n                "),
            tag("button", &[("id", "interference-zone-next"), ("type", "button"), ("class", "primary")], &[text("Next")]),
            text("\n                "),
            tag("button", &[("id", "interference-zone-done"), ("type", "button"), ("class", "primary hidden")], &[text("Done")]),
            text("\n            "),
        ]),
        text("\n        "),
    ]),
    text("\n    "),
]);
