use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("aside", &[("id", "model-browser-panel"), ("class", "model-browser-panel"), ("aria-label", "장면 모델 트리와 위치 편집기")], &[
    text("\n                "),
    tag("div", &[("class", "model-browser-header")], &[
        text("\n                    "),
        tag("div", &[], &[
            text("\n                        "),
            tag("h2", &[], &[text("모델 트리")]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("div", &[("class", "panel-header-actions")], &[
            text("\n                        "),
            tag("span", &[("id", "model-tree-count"), ("class", "model-tree-count")], &[text("0")]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "popout"), ("data-panel-id", "model-browser-panel"), ("title", "별도 창으로 분리"), ("aria-label", "모델 트리를 별도 창으로 분리")], &[
                tag("i", &[("class", "fa-solid fa-up-right-from-square")], &[]),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "hide"), ("data-panel-id", "model-browser-panel"), ("title", "숨기기"), ("aria-label", "모델 트리 숨기기")], &[
                tag("i", &[("class", "fa-solid fa-eye-slash")], &[]),
            ]),
            text("\n                    "),
        ]),
        text("\n                "),
    ]),
    text("\n                "),
    tag("div", &[("id", "model-tree"), ("class", "model-tree"), ("role", "tree"), ("aria-label", "불러온 모델")], &[
        text("\n                    "),
        tag("p", &[("id", "model-tree-empty"), ("class", "model-tree-empty")], &[text("불러온 모델이 없습니다.")]),
        text("\n                "),
    ]),
    text("\n                "),
    tag("div", &[("id", "model-transform-resize-handle"), ("class", "model-transform-resize-handle hidden"), ("role", "separator"), ("aria-orientation", "horizontal"), ("aria-label", "모델 변환 패널 크기 조절"), ("data-i18n-aria-label", "legacy.모델 변환 패널 크기 조절"), ("tabindex", "0")], &[]),
    text("\n                "),
    super::model_transform_panel::VIEW,
    text("\n            "),
]);
