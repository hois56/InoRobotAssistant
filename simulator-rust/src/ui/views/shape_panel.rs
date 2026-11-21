use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("aside", &[("id", "shape-panel"), ("class", "shape-panel panel-user-hidden panel-edge-resizable"), ("aria-label", "도형 생성 및 편집"), ("data-i18n-aria-label", "legacy.도형 생성 및 편집")], &[
    text("\n                "),
    tag("div", &[("class", "shape-panel-header")], &[
        text("\n                    "),
        tag("div", &[], &[
            text("\n                        "),
            tag("h2", &[], &[
                tag("i", &[("class", "fa-solid fa-cubes-stacked"), ("aria-hidden", "true")], &[]),
                text(" "),
                tag("span", &[("data-i18n", "legacy.도형")], &[text("도형")]),
            ]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("div", &[("class", "panel-header-actions")], &[
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "popout"), ("data-panel-id", "shape-panel"), ("title", "별도 창으로 분리"), ("aria-label", "도형 패널을 별도 창으로 분리"), ("data-i18n-title", "legacy.별도 창으로 분리"), ("data-i18n-aria-label", "legacy.도형 패널을 별도 창으로 분리")], &[
                tag("i", &[("class", "fa-solid fa-up-right-from-square")], &[]),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "hide"), ("data-panel-id", "shape-panel"), ("title", "숨기기"), ("aria-label", "도형 패널 숨기기"), ("data-i18n-title", "legacy.숨기기"), ("data-i18n-aria-label", "legacy.도형 패널 숨기기")], &[
                tag("i", &[("class", "fa-solid fa-eye-slash")], &[]),
            ]),
            text("\n                    "),
        ]),
        text("\n                "),
    ]),
    text("\n                "),
    tag("div", &[("class", "shape-panel-content")], &[
        text("\n                    "),
        tag("section", &[("class", "shape-editor-section")], &[
            text("\n                        "),
            tag("div", &[("class", "shape-section-title"), ("data-i18n", "legacy.새 도형")], &[text("새 도형")]),
            text("\n                        "),
            tag("label", &[("class", "shape-field")], &[
                text("\n                            "),
                tag("span", &[("data-i18n", "legacy.형상")], &[text("형상")]),
                text("\n                            "),
                tag("select", &[("id", "shape-type"), ("aria-label", "도형 형상"), ("data-i18n-aria-label", "legacy.도형 형상")], &[
                    text("\n                                "),
                    tag("option", &[("value", "box"), ("data-i18n", "legacy.사각형")], &[text("사각형")]),
                    text("\n                                "),
                    tag("option", &[("value", "cone"), ("data-i18n", "legacy.원뿔형")], &[text("원뿔형")]),
                    text("\n                                "),
                    tag("option", &[("value", "cylinder"), ("data-i18n", "legacy.원통형")], &[text("원통형")]),
                    text("\n                                "),
                    tag("option", &[("value", "sphere"), ("data-i18n", "legacy.구")], &[text("구")]),
                    text("\n                            "),
                ]),
                text("\n                        "),
            ]),
            text("\n                        "),
            tag("div", &[("class", "shape-dimension-grid")], &[
                text("\n                            "),
                tag("label", &[("class", "axis-x")], &[
                    tag("span", &[], &[text("X")]),
                    tag("input", &[("data-shape-create-dimension", "x"), ("type", "number"), ("min", "0.1"), ("max", "100000"), ("step", "0.5"), ("value", "100"), ("aria-label", "X 치수 (mm)")], &[]),
                    tag("small", &[], &[text("mm")]),
                ]),
                text("\n                            "),
                tag("label", &[("class", "axis-y")], &[
                    tag("span", &[], &[text("Y")]),
                    tag("input", &[("data-shape-create-dimension", "y"), ("type", "number"), ("min", "0.1"), ("max", "100000"), ("step", "0.5"), ("value", "100"), ("aria-label", "Y 치수 (mm)")], &[]),
                    tag("small", &[], &[text("mm")]),
                ]),
                text("\n                            "),
                tag("label", &[("class", "axis-z")], &[
                    tag("span", &[], &[text("Z")]),
                    tag("input", &[("data-shape-create-dimension", "z"), ("type", "number"), ("min", "0.1"), ("max", "100000"), ("step", "0.5"), ("value", "100"), ("aria-label", "Z 치수 (mm)")], &[]),
                    tag("small", &[], &[text("mm")]),
                ]),
                text("\n                        "),
            ]),
            text("\n                        "),
            tag("p", &[("id", "shape-dimension-help"), ("class", "shape-dimension-help")], &[text("원통형과 원뿔형은 X/Y 지름이 연결되고 구는 세 축이 연결됩니다.")]),
            text("\n                        "),
            tag("p", &[("id", "shape-create-error"), ("class", "shape-editor-error"), ("role", "alert")], &[]),
            text("\n                        "),
            tag("button", &[("id", "shape-create"), ("type", "button"), ("class", "shape-primary-button")], &[
                tag("i", &[("class", "fa-solid fa-plus")], &[]),
                text(" "),
                tag("span", &[("data-i18n", "legacy.도형 생성")], &[text("도형 생성")]),
            ]),
            text("\n                    "),
        ]),
        text("\n                    "),
        super::sketch_editor::VIEW,
        text("\n                    "),
        super::cad_panel::VIEW,
        text("\n                    "),
        tag("section", &[("id", "shape-selected-editor"), ("class", "shape-editor-section shape-selected-editor"), ("hidden", "")], &[
            text("\n                        "),
            tag("div", &[("class", "shape-section-title"), ("data-i18n", "legacy.선택 도형")], &[text("선택 도형")]),
            text("\n                        "),
            tag("div", &[("class", "shape-selected-name-row")], &[
                tag("span", &[("data-i18n", "legacy.이름")], &[text("이름")]),
                tag("strong", &[("id", "shape-selected-name")], &[text("-")]),
            ]),
            text("\n                        "),
            tag("div", &[("class", "shape-selected-name-row")], &[
                tag("span", &[("data-i18n", "legacy.형상")], &[text("형상")]),
                tag("strong", &[("id", "shape-selected-type")], &[text("-")]),
            ]),
            text("\n                        "),
            tag("div", &[("class", "shape-dimension-grid shape-selected-dimensions")], &[
                text("\n                            "),
                tag("label", &[("class", "axis-x")], &[
                    tag("span", &[], &[text("X")]),
                    tag("input", &[("data-shape-selected-dimension", "x"), ("type", "number"), ("min", "0.1"), ("max", "100000"), ("step", "0.5"), ("aria-label", "선택 도형 X 치수 (mm)")], &[]),
                    tag("small", &[], &[text("mm")]),
                ]),
                text("\n                            "),
                tag("label", &[("class", "axis-y")], &[
                    tag("span", &[], &[text("Y")]),
                    tag("input", &[("data-shape-selected-dimension", "y"), ("type", "number"), ("min", "0.1"), ("max", "100000"), ("step", "0.5"), ("aria-label", "선택 도형 Y 치수 (mm)")], &[]),
                    tag("small", &[], &[text("mm")]),
                ]),
                text("\n                            "),
                tag("label", &[("class", "axis-z")], &[
                    tag("span", &[], &[text("Z")]),
                    tag("input", &[("data-shape-selected-dimension", "z"), ("type", "number"), ("min", "0.1"), ("max", "100000"), ("step", "0.5"), ("aria-label", "선택 도형 Z 치수 (mm)")], &[]),
                    tag("small", &[], &[text("mm")]),
                ]),
                text("\n                        "),
            ]),
            text("\n                        "),
            tag("p", &[("id", "shape-selected-status"), ("class", "shape-selected-status"), ("role", "status")], &[]),
            text("\n                    "),
        ]),
        text("\n                "),
    ]),
    text("\n            "),
]);
