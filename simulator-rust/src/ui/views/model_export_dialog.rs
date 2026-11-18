use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("dialog", &[("id", "model-export-dialog"), ("class", "simulation-reset-dialog model-export-dialog"), ("aria-labelledby", "model-export-dialog-title")], &[
    text("\n        "),
    tag("form", &[("method", "dialog")], &[
        text("\n            "),
        tag("div", &[("class", "simulation-reset-dialog-header")], &[
            text("\n                "),
            tag("i", &[("class", "fa-solid fa-file-export"), ("aria-hidden", "true")], &[]),
            text("\n                "),
            tag("h2", &[("id", "model-export-dialog-title"), ("data-i18n", "legacy.모델 내보내기")], &[text("모델 내보내기")]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("p", &[("data-i18n", "legacy.CAD generated shape export note")], &[text("선택한 생성 도형을 STL 또는 STEP 파일로 저장합니다.")]),
        text("\n            "),
        tag("label", &[("class", "model-export-format-field"), ("for", "model-export-format")], &[
            text("\n                "),
            tag("span", &[("data-i18n", "legacy.내보내기 형식")], &[text("내보내기 형식")]),
            text("\n                "),
            tag("select", &[("id", "model-export-format")], &[
                text("\n                    "),
                tag("option", &[("value", "stl")], &[text("STL")]),
                text("\n                    "),
                tag("option", &[("value", "step")], &[text("STEP")]),
                text("\n                "),
            ]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("div", &[("class", "simulation-reset-dialog-actions")], &[
            text("\n                "),
            tag("button", &[("id", "model-export-cancel"), ("type", "button"), ("data-i18n", "legacy.취소")], &[text("취소")]),
            text("\n                "),
            tag("button", &[("id", "model-export-confirm"), ("type", "button"), ("class", "primary choice-replace"), ("data-i18n", "legacy.파일 내보내기")], &[text("파일 내보내기")]),
            text("\n            "),
        ]),
        text("\n        "),
    ]),
    text("\n    "),
]);
