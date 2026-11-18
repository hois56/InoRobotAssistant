use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("dialog", &[("id", "position-value-dialog"), ("class", "position-value-dialog"), ("aria-labelledby", "position-value-dialog-title")], &[
    text("\n        "),
    tag("form", &[("method", "dialog")], &[
        text("\n            "),
        tag("div", &[("class", "position-value-dialog-header")], &[
            text("\n                "),
            tag("div", &[], &[
                text("\n                    "),
                tag("span", &[], &[text("POSITION POINT")]),
                text("\n                    "),
                tag("h2", &[("id", "position-value-dialog-title")], &[text("위치 값 확인")]),
                text("\n                "),
            ]),
            text("\n                "),
            tag("strong", &[("id", "position-value-point-name")], &[text("P[0]")]),
            text("\n                "),
            tag("button", &[("id", "btn-close-position-value"), ("type", "button"), ("aria-label", "닫기")], &[
                tag("i", &[("class", "fa-solid fa-xmark")], &[]),
            ]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("section", &[("class", "position-value-section")], &[
            text("\n                "),
            tag("h3", &[], &[text("TCP 위치 / 회전")]),
            text("\n                "),
            tag("div", &[("class", "position-value-grid pose-grid")], &[
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("X")]),
                    tag("input", &[("type", "number"), ("step", "0.000001"), ("data-position-value", "x")], &[]),
                    tag("small", &[], &[text("mm")]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("Y")]),
                    tag("input", &[("type", "number"), ("step", "0.000001"), ("data-position-value", "y")], &[]),
                    tag("small", &[], &[text("mm")]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("Z")]),
                    tag("input", &[("type", "number"), ("step", "0.000001"), ("data-position-value", "z")], &[]),
                    tag("small", &[], &[text("mm")]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("A")]),
                    tag("input", &[("type", "number"), ("step", "0.000001"), ("data-position-value", "a")], &[]),
                    tag("small", &[], &[text("deg")]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("B")]),
                    tag("input", &[("type", "number"), ("step", "0.000001"), ("data-position-value", "b")], &[]),
                    tag("small", &[], &[text("deg")]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("C")]),
                    tag("input", &[("type", "number"), ("step", "0.000001"), ("data-position-value", "c")], &[]),
                    tag("small", &[], &[text("deg")]),
                ]),
                text("\n                "),
            ]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("section", &[("class", "position-value-section")], &[
            text("\n                "),
            tag("h3", &[], &[text("Arm 파라미터")]),
            text("\n                "),
            tag("div", &[("class", "position-value-grid arm-grid")], &[
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("Arm 0")]),
                    tag("input", &[("type", "number"), ("step", "1"), ("data-position-arm", "0")], &[]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("Arm 1")]),
                    tag("input", &[("type", "number"), ("step", "1"), ("data-position-arm", "1")], &[]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("Arm 2")]),
                    tag("input", &[("type", "number"), ("step", "1"), ("data-position-arm", "2")], &[]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("Arm 3")]),
                    tag("input", &[("type", "number"), ("step", "1"), ("data-position-arm", "3")], &[]),
                ]),
                text("\n                "),
            ]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("section", &[("class", "position-value-section")], &[
            text("\n                "),
            tag("h3", &[("data-i18n", "legacy.외부 축")], &[text("외부 축")]),
            text("\n                "),
            tag("div", &[("class", "position-value-grid external-grid")], &[
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("E1")]),
                    tag("input", &[("type", "number"), ("step", "0.000001"), ("data-position-external", "0")], &[]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("E2")]),
                    tag("input", &[("type", "number"), ("step", "0.000001"), ("data-position-external", "1")], &[]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("E3")]),
                    tag("input", &[("type", "number"), ("step", "0.000001"), ("data-position-external", "2")], &[]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("E4")]),
                    tag("input", &[("type", "number"), ("step", "0.000001"), ("data-position-external", "3")], &[]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("E5")]),
                    tag("input", &[("type", "number"), ("step", "0.000001"), ("data-position-external", "4")], &[]),
                ]),
                text("\n                    "),
                tag("label", &[], &[
                    tag("span", &[], &[text("E6")]),
                    tag("input", &[("type", "number"), ("step", "0.000001"), ("data-position-external", "5")], &[]),
                ]),
                text("\n                "),
            ]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("label", &[("class", "position-value-label")], &[
            text("\n                "),
            tag("span", &[], &[text("라벨")]),
            text("\n                "),
            tag("input", &[("id", "position-value-label"), ("type", "text"), ("maxlength", "19"), ("placeholder", "Point1"), ("autocomplete", "off")], &[]),
            text("\n                "),
            tag("small", &[], &[text("영문자로 시작하며 영문, 숫자, 밑줄만 사용 (19자 이하)")]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("p", &[("id", "position-value-error"), ("class", "position-value-error"), ("role", "alert")], &[]),
        text("\n            "),
        tag("div", &[("class", "position-value-dialog-actions")], &[
            text("\n                "),
            tag("button", &[("id", "btn-cancel-position-value"), ("type", "button"), ("class", "secondary")], &[text("취소")]),
            text("\n                "),
            tag("button", &[("id", "btn-apply-position-value"), ("type", "button"), ("class", "primary")], &[text("위치 값 적용")]),
            text("\n            "),
        ]),
        text("\n        "),
    ]),
    text("\n    "),
]);
