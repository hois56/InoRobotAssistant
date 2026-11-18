use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("section", &[("id", "sketch-workbench"), ("class", "sketch-workbench"), ("hidden", ""), ("aria-label", "Sketch Workbench")], &[
    text("\n                "),
    tag("header", &[("class", "sketch-workbench-header")], &[
        text("\n                    "),
        tag("div", &[("class", "sketch-workbench-header-tools"), ("role", "toolbar"), ("aria-label", "Primary sketch tools")], &[
            text("\n                        "),
            tag("div", &[("class", "sketch-workbench-tool-group")], &[
                text("\n                            "),
                tag("button", &[("type", "button"), ("class", "sketch-workbench-tool active"), ("data-sketch-workbench-tool", "select"), ("aria-pressed", "true"), ("title", "Select")], &[
                    tag("i", &[("class", "fa-solid fa-arrow-pointer")], &[]),
                    tag("span", &[], &[text("Select")]),
                ]),
                text("\n                            "),
                tag("button", &[("type", "button"), ("class", "sketch-workbench-tool"), ("data-sketch-workbench-tool", "line"), ("aria-pressed", "false"), ("title", "Line")], &[
                    tag("i", &[("class", "fa-solid fa-minus")], &[]),
                    tag("span", &[], &[text("Line")]),
                ]),
                text("\n                            "),
                tag("button", &[("type", "button"), ("class", "sketch-workbench-tool"), ("data-sketch-workbench-tool", "rectangle"), ("aria-pressed", "false"), ("title", "Rectangle")], &[
                    tag("i", &[("class", "fa-regular fa-square")], &[]),
                    tag("span", &[], &[text("Rectangle")]),
                ]),
                text("\n                            "),
                tag("button", &[("type", "button"), ("class", "sketch-workbench-tool"), ("data-sketch-workbench-tool", "circle"), ("aria-pressed", "false"), ("title", "Circle")], &[
                    tag("i", &[("class", "fa-regular fa-circle")], &[]),
                    tag("span", &[], &[text("Circle")]),
                ]),
                text("\n                            "),
                tag("button", &[("type", "button"), ("class", "sketch-workbench-tool"), ("data-sketch-workbench-tool", "chamfer"), ("aria-pressed", "false"), ("title", "Chamfer")], &[
                    tag("i", &[("class", "fa-solid fa-draw-polygon")], &[]),
                    tag("span", &[], &[text("Chamfer")]),
                ]),
                text("\n                            "),
                tag("button", &[("type", "button"), ("class", "sketch-workbench-tool"), ("data-sketch-workbench-tool", "text"), ("aria-pressed", "false"), ("title", "텍스트"), ("data-i18n-title", "legacy.텍스트")], &[
                    tag("i", &[("class", "fa-solid fa-font")], &[]),
                    tag("span", &[("data-i18n", "legacy.텍스트")], &[text("텍스트")]),
                ]),
                text("\n                            "),
                tag("button", &[("type", "button"), ("class", "sketch-workbench-tool"), ("data-sketch-workbench-tool", "dimension"), ("aria-pressed", "false"), ("title", "Dimension"), ("data-i18n-title", "legacy.치수 기입")], &[
                    tag("i", &[("class", "fa-solid fa-ruler")], &[]),
                    tag("span", &[("data-i18n", "legacy.치수 기입")], &[text("Dimension")]),
                ]),
                text("\n                            "),
                tag("button", &[("id", "sketch-workbench-import-cad"), ("type", "button"), ("class", "sketch-workbench-tool"), ("title", "DXF를 스케치로 삽입"), ("aria-label", "DXF를 스케치로 삽입"), ("data-i18n-title", "legacy.DXF를 스케치로 삽입"), ("data-i18n-aria-label", "legacy.DXF를 스케치로 삽입")], &[
                    tag("i", &[("class", "fa-solid fa-file-import")], &[]),
                    tag("span", &[("data-i18n", "legacy.DXF 삽입")], &[text("DXF 삽입")]),
                ]),
                text("\n                            "),
                tag("button", &[("id", "sketch-workbench-snap"), ("type", "button"), ("class", "sketch-workbench-tool"), ("title", "스냅 켜기"), ("aria-label", "스냅 켜기"), ("data-i18n-title", "legacy.스냅 켜기"), ("data-i18n-aria-label", "legacy.스냅 켜기"), ("aria-pressed", "true")], &[
                    tag("i", &[("class", "fa-solid fa-magnet")], &[]),
                    tag("span", &[("data-i18n", "legacy.스냅")], &[text("Snap")]),
                ]),
                text("\n                            "),
                tag("button", &[("id", "sketch-workbench-clear"), ("type", "button"), ("class", "sketch-workbench-tool"), ("title", "Clear sketch"), ("aria-label", "Clear sketch")], &[
                    tag("i", &[("class", "fa-solid fa-rotate-left")], &[]),
                    tag("span", &[], &[text("Clear")]),
                ]),
                text("\n                        "),
            ]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("div", &[("class", "sketch-workbench-header-actions")], &[
            text("\n                        "),
            tag("button", &[("id", "sketch-workbench-extrude"), ("type", "button"), ("class", "sketch-workbench-extrude")], &[
                tag("i", &[("class", "fa-solid fa-cube")], &[]),
                text(" "),
                tag("span", &[], &[text("Extrude")]),
            ]),
            text("\n                        "),
            tag("button", &[("id", "sketch-workbench-extrude-cut"), ("type", "button"), ("class", "sketch-workbench-extrude-cut")], &[
                tag("i", &[("class", "fa-solid fa-scissors")], &[]),
                text(" "),
                tag("span", &[], &[text("Extrude cut")]),
            ]),
            text("\n                        "),
            tag("div", &[("id", "sketch-workbench-extrude-controls"), ("class", "sketch-workbench-extrude-controls"), ("hidden", "")], &[
                text("\n                            "),
                tag("span", &[("class", "sketch-workbench-extrude-title")], &[text("EXTRUDE")]),
                text("\n                            "),
                tag("span", &[("id", "sketch-workbench-extrude-selection-count"), ("class", "sketch-workbench-extrude-selection-count")], &[text("0 profiles")]),
                text("\n                            "),
                tag("label", &[("for", "sketch-workbench-height")], &[
                    tag("span", &[("data-i18n", "legacy.Z 높이")], &[text("Z height")]),
                    tag("span", &[("class", "sketch-workbench-input-with-unit")], &[
                        tag("input", &[("id", "sketch-workbench-height"), ("type", "number"), ("min", "0.1"), ("max", "100000"), ("step", "0.5"), ("value", "100")], &[]),
                        tag("small", &[], &[text("mm")]),
                    ]),
                ]),
                text("\n                            "),
                tag("button", &[("id", "sketch-workbench-extrude-apply"), ("type", "button"), ("class", "sketch-workbench-extrude-apply")], &[
                    tag("i", &[("class", "fa-solid fa-check")], &[]),
                    text(" "),
                    tag("span", &[], &[text("Apply")]),
                ]),
                text("\n                            "),
                tag("button", &[("id", "sketch-workbench-extrude-cancel"), ("type", "button"), ("class", "sketch-workbench-extrude-cancel"), ("aria-label", "Cancel extrusion")], &[
                    tag("i", &[("class", "fa-solid fa-xmark")], &[]),
                ]),
                text("\n                        "),
            ]),
            text("\n                        "),
            tag("button", &[("id", "sketch-workbench-cancel"), ("type", "button"), ("class", "sketch-workbench-cancel")], &[
                tag("i", &[("class", "fa-solid fa-xmark")], &[]),
                text(" "),
                tag("span", &[("data-i18n", "legacy.스케치 종료")], &[text("스케치 종료")]),
            ]),
            text("\n                        "),
            tag("button", &[("id", "sketch-workbench-finish"), ("type", "button"), ("class", "sketch-workbench-finish"), ("disabled", "")], &[
                tag("i", &[("class", "fa-solid fa-check")], &[]),
                text(" "),
                tag("span", &[("data-i18n", "legacy.스케치 완료")], &[text("스케치 완료")]),
            ]),
            text("\n                    "),
        ]),
        text("\n                "),
    ]),
    text("\n                "),
    tag("section", &[("id", "sketch-text-editor"), ("class", "sketch-text-editor"), ("hidden", ""), ("aria-label", "스케치 텍스트 입력"), ("data-i18n-aria-label", "legacy.스케치 텍스트 입력")], &[
        text("\n                    "),
        tag("div", &[("class", "sketch-text-editor-title")], &[
            tag("i", &[("class", "fa-solid fa-font"), ("aria-hidden", "true")], &[]),
            tag("span", &[("data-i18n", "legacy.스케치 텍스트 입력")], &[text("스케치 텍스트 입력")]),
        ]),
        text("\n                    "),
        tag("label", &[], &[
            text("\n                        "),
            tag("span", &[("data-i18n", "legacy.텍스트 내용")], &[text("텍스트 내용")]),
            text("\n                        "),
            tag("textarea", &[("id", "sketch-text-content"), ("rows", "3"), ("maxlength", "500"), ("placeholder", "텍스트를 입력하세요."), ("data-i18n-placeholder", "legacy.텍스트를 입력하세요.")], &[]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("div", &[("class", "sketch-text-editor-grid")], &[
            text("\n                        "),
            tag("label", &[], &[
                tag("span", &[("data-i18n", "legacy.문자 높이")], &[text("문자 높이")]),
                tag("span", &[("class", "sketch-workbench-input-with-unit")], &[
                    tag("input", &[("id", "sketch-text-height"), ("type", "number"), ("min", "0.5"), ("max", "100000"), ("step", "0.5"), ("value", "100")], &[]),
                    tag("small", &[], &[text("mm")]),
                ]),
            ]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("p", &[("id", "sketch-text-editor-error"), ("class", "sketch-editor-error"), ("role", "alert")], &[]),
        text("\n                    "),
        tag("div", &[("class", "sketch-text-editor-actions")], &[
            text("\n                        "),
            tag("button", &[("id", "sketch-text-cancel"), ("type", "button"), ("class", "sketch-workbench-extrude-cancel")], &[
                tag("i", &[("class", "fa-solid fa-xmark")], &[]),
                tag("span", &[("data-i18n", "legacy.취소")], &[text("취소")]),
            ]),
            text("\n                        "),
            tag("button", &[("id", "sketch-text-apply"), ("type", "button"), ("class", "sketch-workbench-extrude-apply")], &[
                tag("i", &[("class", "fa-solid fa-check")], &[]),
                tag("span", &[("data-i18n", "legacy.텍스트 삽입")], &[text("텍스트 삽입")]),
            ]),
            text("\n                    "),
        ]),
        text("\n                "),
    ]),
    text("\n                "),
    tag("aside", &[("class", "sketch-workbench-browser"), ("aria-label", "Sketch Browser")], &[
        text("\n                    "),
        tag("div", &[("class", "sketch-workbench-panel-heading")], &[
            tag("span", &[], &[text("SKETCH BROWSER")]),
            tag("i", &[("class", "fa-solid fa-diagram-project")], &[]),
        ]),
        text("\n                    "),
        tag("div", &[("class", "sketch-workbench-tree-section")], &[
            tag("span", &[], &[text("Elements")]),
            tag("strong", &[("id", "sketch-workbench-element-count")], &[text("0")]),
        ]),
        text("\n                    "),
        tag("div", &[("id", "sketch-workbench-entity-list"), ("class", "sketch-workbench-entity-list"), ("role", "listbox"), ("aria-label", "Sketch elements")], &[]),
        text("\n                    "),
        tag("div", &[("class", "sketch-workbench-tree-section")], &[
            tag("span", &[], &[text("Constraints")]),
            tag("strong", &[], &[text("0")]),
        ]),
        text("\n                    "),
        tag("div", &[("class", "sketch-workbench-tree-section")], &[
            tag("span", &[("data-i18n", "legacy.치수")], &[text("Dimensions")]),
            tag("strong", &[("id", "sketch-workbench-dimension-count")], &[text("0")]),
        ]),
        text("\n                    "),
        tag("div", &[("class", "sketch-workbench-empty-note")], &[text("Geometry and imported DXF entities appear here.")]),
        text("\n                "),
    ]),
    text("\n                "),
    tag("footer", &[("class", "sketch-workbench-footer")], &[
        text("\n                    "),
        tag("span", &[], &[
            tag("i", &[("class", "fa-solid fa-table-cells")], &[]),
            text(" Grid: 10 mm"),
        ]),
        text("\n                    "),
        tag("span", &[], &[
            tag("i", &[("class", "fa-solid fa-crosshairs")], &[]),
            text(" Origin "),
            tag("strong", &[("id", "sketch-workbench-footer-origin")], &[text("0.000, 0.000")]),
        ]),
        text("\n                    "),
        tag("span", &[], &[
            tag("i", &[("class", "fa-solid fa-ruler")], &[]),
            text(" Units: mm"),
        ]),
        text("\n                    "),
        tag("span", &[], &[
            tag("i", &[("class", "fa-solid fa-magnet")], &[]),
            text(" Snap: "),
            tag("strong", &[("id", "sketch-workbench-footer-snap")], &[text("ON")]),
        ]),
        text("\n                    "),
        tag("span", &[("class", "sketch-workbench-footer-right"), ("id", "sketch-workbench-footer-readout")], &[text("0 elements · 0 constraints")]),
        text("\n                "),
    ]),
    text("\n            "),
]);
