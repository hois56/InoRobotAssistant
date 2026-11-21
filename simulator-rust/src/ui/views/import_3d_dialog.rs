use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("dialog", &[("id", "import-3d-dialog"), ("class", "import-dialog"), ("aria-labelledby", "import-dialog-title")], &[
    text("\n        "),
    tag("div", &[("class", "import-dialog-header")], &[
        text("\n            "),
        tag("h2", &[("id", "import-dialog-title")], &[text("3D/CAD File Import")]),
        text("\n            "),
        tag("button", &[("id", "btn-close-import"), ("type", "button"), ("class", "import-close-btn"), ("aria-label", "닫기")], &[
            text("\n                "),
            tag("i", &[("class", "fa-solid fa-xmark")], &[]),
            text("\n            "),
        ]),
        text("\n        "),
    ]),
    text("\n        "),
    tag("p", &[("id", "import-file-summary"), ("class", "import-file-summary")], &[text("파일을 선택하세요.")]),
    text("\n        "),
    tag("div", &[("class", "import-settings-grid")], &[
        text("\n            "),
        tag("label", &[("id", "import-placement-setting"), ("class", "import-setting"), ("for", "import-placement")], &[
            text("\n                "),
            tag("span", &[], &[text("가져오기 위치")]),
            text("\n                    "),
            tag("select", &[("id", "import-placement"), ("aria-label", "3D 모델 가져오기 위치")], &[
                text("\n                        "),
                tag("option", &[("value", "tcp")], &[text("Tool")]),
                text("\n                        "),
                tag("option", &[("value", "arm-load")], &[text("암 로드")]),
                text("\n                        "),
                tag("option", &[("value", "scene")], &[text("3D 모델링")]),
                text("\n                    "),
            ]),
            text("\n                "),
        ]),
        text("\n            "),
        tag("label", &[("id", "import-arm-load-axis-setting"), ("class", "import-setting hidden"), ("for", "import-arm-load-axis")], &[
            text("\n                "),
            tag("span", &[("data-i18n", "legacy.부착 축")], &[text("부착 축")]),
            text("\n                "),
            tag("select", &[("id", "import-arm-load-axis"), ("aria-label", "암 로드 부착 축"), ("data-i18n-aria-label", "legacy.암 로드 부착 축")], &[
                text("\n                    "),
                tag("option", &[("value", "2")], &[text("J3")]),
                text("\n                    "),
                tag("option", &[("value", "3"), ("selected", "")], &[text("J4")]),
                text("\n                "),
            ]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("label", &[("id", "import-quality-setting"), ("class", "import-setting"), ("for", "import-quality")], &[
            text("\n                "),
            tag("span", &[], &[text("모델 품질")]),
            text("\n                "),
            tag("select", &[("id", "import-quality"), ("aria-label", "가져올 3D 모델 품질")], &[
                text("\n                    "),
                tag("option", &[("value", "auto"), ("selected", "")], &[text("자동 (권장)")]),
                text("\n                    "),
                tag("option", &[("value", "lightweight")], &[text("경량 (빠른 가져오기)")]),
                text("\n                    "),
                tag("option", &[("value", "standard")], &[text("표준")]),
                text("\n                    "),
                tag("option", &[("value", "high")], &[text("고품질 (느림)")]),
                text("\n                "),
            ]),
            text("\n                "),
            tag("small", &[("id", "import-quality-note")], &[text("STEP/STP의 메시 정밀도와 처리 속도를 조절합니다.")]),
            text("\n            "),
        ]),
        text("\n        "),
    ]),
    text("\n        "),
    tag("div", &[("id", "cad-import-settings"), ("class", "cad-import-settings"), ("hidden", "")], &[
        text("\n            "),
        tag("div", &[("class", "cad-import-settings-title")], &[
            tag("i", &[("class", "fa-solid fa-drafting-compass"), ("aria-hidden", "true")], &[]),
            text(" 2D CAD"),
        ]),
        text("\n            "),
        tag("label", &[("class", "import-setting"), ("for", "cad-import-unit")], &[
            text("\n                "),
            tag("span", &[("data-i18n", "legacy.도면 단위")], &[text("도면 단위")]),
            text("\n                "),
            tag("select", &[("id", "cad-import-unit"), ("aria-label", "2D CAD 도면 단위")], &[
                text("\n                    "),
                tag("option", &[("value", "auto"), ("selected", ""), ("data-i18n", "legacy.자동 (DXF INSUNITS)")], &[text("자동 (DXF INSUNITS)")]),
                text("\n                    "),
                tag("option", &[("value", "millimeter")], &[text("mm")]),
                text("\n                    "),
                tag("option", &[("value", "centimeter")], &[text("cm")]),
                text("\n                    "),
                tag("option", &[("value", "meter")], &[text("m")]),
                text("\n                    "),
                tag("option", &[("value", "inch")], &[text("inch")]),
                text("\n                "),
            ]),
            text("\n                "),
            tag("small", &[("id", "cad-import-unit-note"), ("data-i18n", "legacy.CAD unit note")], &[text("Unknown units are interpreted as mm.")]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("label", &[("class", "cad-import-check")], &[
            text("\n                "),
            tag("input", &[("id", "cad-import-center"), ("type", "checkbox"), ("checked", "")], &[]),
            text("\n                "),
            tag("span", &[("data-i18n", "legacy.도면 중심을 원점에 배치")], &[text("도면 중심을 원점에 배치")]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("p", &[("id", "cad-import-note"), ("class", "cad-import-note"), ("data-i18n", "legacy.DXF의 블록과 LINE ARC CIRCLE POLYLINE을 전개해 평면에 표시하며 스플라인은 지원하지 않습니다")], &[text("DXF의 블록과 LINE ARC CIRCLE POLYLINE TEXT MTEXT를 전개해 평면에 표시하며 스플라인은 지원하지 않습니다")]),
        text("\n        "),
    ]),
    text("\n        "),
    tag("div", &[("class", "import-dialog-actions")], &[
        text("\n            "),
        tag("button", &[("id", "btn-cancel-import"), ("type", "button"), ("class", "import-secondary-btn")], &[text("취소")]),
        text("\n            "),
        tag("button", &[("id", "btn-confirm-import"), ("type", "button"), ("class", "import-primary-btn")], &[
            text("\n                "),
            tag("i", &[("class", "fa-solid fa-file-import")], &[]),
            text("\n                3D/CAD 가져오기\n            "),
        ]),
        text("\n        "),
    ]),
    text("\n    "),
]);

#[rustfmt::skip]
pub(super) const SOLIDWORKS_REFERENCES: Node = tag("dialog", &[
    ("id", "solidworks-reference-dialog"), ("class", "import-dialog"),
    ("aria-labelledby", "solidworks-reference-title"), ("aria-describedby", "solidworks-reference-detail"),
], &[
    tag("div", &[("class", "import-dialog-header")], &[
        tag("h2", &[("id", "solidworks-reference-title"), ("data-i18n", "legacy.SolidWorks 참조 부품")], &[text("SolidWorks 참조 부품")]),
    ]),
    tag("p", &[("id", "solidworks-reference-file"), ("class", "import-file-summary")], &[]),
    tag("p", &[("id", "solidworks-reference-detail"), ("class", "import-file-summary")], &[]),
    tag("input", &[("id", "input-solidworks-reference-folder"), ("type", "file"), ("webkitdirectory", ""), ("hidden", "")], &[]),
    tag("form", &[("class", "import-dialog-actions"), ("method", "dialog")], &[
        tag("button", &[("type", "submit"), ("class", "import-secondary-btn"), ("data-i18n", "legacy.취소")], &[text("취소")]),
        tag("button", &[("id", "btn-select-solidworks-reference-folder"), ("type", "button"), ("class", "import-primary-btn"), ("data-i18n", "legacy.폴더 선택")], &[text("폴더 선택")]),
    ]),
]);
