use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("aside", &[("id", "tool-load-info-panel"), ("class", "tool-load-info-panel panel-user-hidden panel-edge-resizable"), ("aria-label", "Tool 부하 정보"), ("data-i18n-aria-label", "legacy.Tool 부하 정보")], &[
    text("\n                "),
    tag("div", &[("class", "tool-load-info-panel-header")], &[
        text("\n                    "),
        tag("div", &[], &[
            text("\n                        "),
            tag("h2", &[], &[
                tag("i", &[("class", "fa-solid fa-weight-hanging"), ("aria-hidden", "true")], &[]),
                text(" "),
                tag("span", &[("data-i18n", "legacy.Tool 부하 정보")], &[text("Tool 부하 정보")]),
            ]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("div", &[("class", "panel-header-actions")], &[
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "popout"), ("data-panel-id", "tool-load-info-panel"), ("title", "별도 창으로 분리"), ("aria-label", "Tool 부하 정보를 별도 창으로 분리"), ("data-i18n-title", "legacy.별도 창으로 분리"), ("data-i18n-aria-label", "legacy.Tool 부하 정보를 별도 창으로 분리")], &[
                tag("i", &[("class", "fa-solid fa-up-right-from-square")], &[]),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "hide"), ("data-panel-id", "tool-load-info-panel"), ("title", "숨기기"), ("aria-label", "Tool 부하 정보 숨기기"), ("data-i18n-title", "legacy.숨기기"), ("data-i18n-aria-label", "legacy.Tool 부하 정보 숨기기")], &[
                tag("i", &[("class", "fa-solid fa-eye-slash")], &[]),
            ]),
            text("\n                    "),
        ]),
        text("\n                "),
    ]),
    text("\n                "),
    tag("div", &[("class", "tool-load-info-content")], &[
        text("\n                    "),
        tag("div", &[("class", "tool-load-info-target")], &[
            text("\n                        "),
            tag("span", &[("data-i18n", "legacy.선택한 Tool")], &[text("선택한 Tool")]),
            text("\n                        "),
            tag("strong", &[("id", "tool-load-selected-name")], &[text("-")]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("div", &[("class", "tool-load-mode-tabs"), ("role", "group"), ("aria-label", "부하 계산 방식"), ("data-i18n-aria-label", "legacy.부하 계산 방식")], &[
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-tool-load-mode", "material"), ("class", "active"), ("aria-pressed", "true")], &[
                text("\n                            "),
                tag("i", &[("class", "fa-solid fa-cubes")], &[]),
                text(" "),
                tag("span", &[("data-i18n", "legacy.부품·재질로 계산")], &[text("부품·재질로 계산")]),
                text("\n                        "),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-tool-load-mode", "mass"), ("aria-pressed", "false")], &[
                text("\n                            "),
                tag("i", &[("class", "fa-solid fa-scale-balanced")], &[]),
                text(" "),
                tag("span", &[("data-i18n", "legacy.질량 직접 입력")], &[text("질량 직접 입력")]),
                text("\n                        "),
            ]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("section", &[("id", "tool-load-material-mode"), ("class", "tool-load-mode-section")], &[
            text("\n                        "),
            tag("p", &[("class", "tool-load-info-help")], &[text("각 부품의 재질과 밀도를 입력하면 부하 값이 실시간으로 계산됩니다.")]),
            text("\n                        "),
            tag("div", &[("id", "tool-load-material-list"), ("class", "tool-load-material-list")], &[]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("section", &[("id", "tool-load-mass-mode"), ("class", "tool-load-mode-section"), ("hidden", "")], &[
            text("\n                        "),
            tag("p", &[("class", "tool-load-info-help")], &[text("여러 부품 또는 여러 재질을 하나의 모델로 불러온 경우 총 질량을 직접 입력합니다. 형상의 무게중심과 균일 밀도 기준 관성모멘트를 질량에 맞춰 계산합니다.")]),
            text("\n                        "),
            tag("label", &[("class", "tool-load-mass-field")], &[
                text("\n                            "),
                tag("span", &[("data-i18n", "legacy.툴 총 질량")], &[text("툴 총 질량")]),
                text("\n                            "),
                tag("input", &[("id", "tool-load-mass"), ("type", "number"), ("min", "0.000001"), ("step", "0.001"), ("value", "1")], &[]),
                text("\n                            "),
                tag("small", &[], &[text("kg")]),
                text("\n                        "),
            ]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("section", &[("class", "tool-load-result"), ("aria-label", "부하 계산 결과"), ("data-i18n-aria-label", "legacy.부하 계산 결과")], &[
            text("\n                        "),
            tag("div", &[("class", "tool-load-result-heading")], &[
                tag("span", &[("data-i18n", "legacy.실시간 부하 정보")], &[text("실시간 부하 정보")]),
                tag("small", &[("data-i18n", "legacy.Tool 좌표계 기준")], &[text("Tool 좌표계 기준")]),
            ]),
            text("\n                        "),
            tag("div", &[("class", "tool-load-result-grid")], &[
                text("\n                            "),
                tag("div", &[], &[
                    tag("span", &[("data-i18n", "legacy.질량")], &[text("질량")]),
                    tag("strong", &[("id", "tool-load-result-mass")], &[text("-")]),
                ]),
                text("\n                            "),
                tag("div", &[("class", "tool-load-result-wide")], &[
                    tag("span", &[("class", "tool-load-result-label"), ("data-i18n", "legacy.무게중심 (Tool 원점 기준)")], &[text("무게중심 (Tool 원점 기준)")]),
                    tag("output", &[("id", "tool-load-result-cog")], &[text("-")]),
                    tag("small", &[], &[text("mm")]),
                ]),
                text("\n                            "),
                tag("div", &[("class", "tool-load-result-wide")], &[
                    tag("span", &[("class", "tool-load-result-label"), ("data-i18n", "legacy.Tool 원점 기준 관성모멘트")], &[text("Tool 원점 기준 관성모멘트")]),
                    tag("output", &[("id", "tool-load-result-origin-inertia")], &[text("-")]),
                    tag("small", &[], &[text("kg·m²")]),
                ]),
                text("\n                            "),
                tag("div", &[("class", "tool-load-result-wide")], &[
                    tag("span", &[("class", "tool-load-result-label"), ("data-i18n", "legacy.부하중심 기준 관성모멘트")], &[text("부하중심 기준 관성모멘트")]),
                    tag("output", &[("id", "tool-load-result-center-inertia")], &[text("-")]),
                    tag("small", &[], &[text("kg·m²")]),
                ]),
                text("\n                        "),
            ]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("p", &[("id", "tool-load-status"), ("class", "tool-load-status"), ("role", "status"), ("aria-live", "polite")], &[text("재질을 선택하면 값을 계산합니다.")]),
        text("\n                "),
    ]),
    text("\n            "),
]);
