use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("dialog", &[("id", "test-model-dialog"), ("class", "simulation-reset-dialog test-model-picker"), ("aria-labelledby", "test-model-dialog-title")], &[
    text("\n        "),
    tag("form", &[("method", "dialog")], &[
        text("\n            "),
        tag("div", &[("class", "simulation-reset-dialog-header")], &[
            text("\n                "),
            tag("i", &[("class", "fa-solid fa-flask"), ("aria-hidden", "true")], &[]),
            text("\n                "),
            tag("h2", &[("id", "test-model-dialog-title")], &[text("테스트 모델링 불러오기")]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("p", &[], &[text("모델별 가져올 수량을 입력한 뒤 일괄 가져오기를 누르세요. (모델별 최대 20개, 전체 최대 100개)")]),
        text("\n            "),
        tag("div", &[("class", "test-model-picker-body")], &[
            text("\n                "),
            tag("section", &[], &[
                tag("h3", &[], &[text("3D 모델링")]),
                tag("div", &[("class", "test-model-grid"), ("data-test-category", "model")], &[]),
            ]),
            text("\n                "),
            tag("section", &[], &[
                tag("h3", &[], &[text("툴 (Tool)")]),
                text("\n                    "),
                tag("p", &[], &[text("선택된 로봇에 Tool로 부착합니다. 로봇이 선택되어 있지 않으면 마지막으로 선택한 로봇에 부착합니다.")]),
                text("\n                    "),
                tag("div", &[("class", "test-model-grid"), ("data-test-category", "tool")], &[]),
                text("\n                "),
            ]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("p", &[("id", "test-model-total"), ("aria-live", "polite")], &[text("선택 수량: 0개")]),
        text("\n            "),
        tag("div", &[("class", "simulation-reset-dialog-actions")], &[
            text("\n                "),
            tag("button", &[("id", "btn-tracking-test-model"), ("type", "button"), ("class", "secondary")], &[text("컨베이어 트래킹 모델링 생성")]),
            text("\n                "),
            tag("button", &[("id", "btn-educational-test-model"), ("type", "button"), ("class", "secondary")], &[text("교육용 모델링 생성")]),
            text("\n                "),
            tag("button", &[("id", "btn-cancel-test-model"), ("type", "button"), ("class", "secondary")], &[text("취소")]),
            text("\n                "),
            tag("button", &[("id", "btn-confirm-test-model"), ("type", "button"), ("class", "primary"), ("disabled", "")], &[text("일괄 가져오기")]),
            text("\n            "),
        ]),
        text("\n        "),
    ]),
    text("\n    "),
]);
