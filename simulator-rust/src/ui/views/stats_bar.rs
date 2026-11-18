use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("footer", &[("id", "stats-bar")], &[
    text("\n        "),
    tag("div", &[("class", "stat-status-block")], &[
        tag("div", &[("class", "stat-item")], &[
            tag("i", &[("id", "status-dot"), ("class", "fa-solid fa-circle")], &[]),
            tag("label", &[], &[text("Status")]),
            tag("span", &[("id", "stat-status")], &[text("Initializing...")]),
        ]),
        tag("span", &[("id", "stat-fps"), ("translate", "no")], &[text("0 FPS")]),
    ]),
    text("\n        "),
    tag("div", &[("id", "panel-launcher"), ("class", "viewer-control-dock"), ("aria-label", "뷰어 제어 도크")], &[
        text("\n            "),
        tag("button", &[("type", "button"), ("data-panel-toggle", "model-browser-panel"), ("class", "active"), ("title", "모델 트리 표시/숨김")], &[
            tag("i", &[("class", "fa-solid fa-list-ul")], &[]),
            text(" 모델"),
        ]),
        text("\n            "),
        tag("button", &[("type", "button"), ("data-panel-toggle", "jog-panel"), ("disabled", ""), ("title", "로봇 JOG 패널 표시/숨김")], &[
            tag("i", &[("class", "fa-solid fa-gamepad")], &[]),
            text(" JOG"),
        ]),
        text("\n            "),
        tag("button", &[("type", "button"), ("data-panel-toggle", "position-points-panel"), ("disabled", ""), ("title", "P.pts")], &[
            tag("i", &[("class", "fa-solid fa-location-dot")], &[]),
            text(" P.pts"),
        ]),
        text("\n            "),
        tag("button", &[("type", "button"), ("data-panel-toggle", "tcp-profile-panel"), ("disabled", ""), ("title", "Tool 설정")], &[
            tag("i", &[("class", "fa-solid fa-crosshairs")], &[]),
            text(" "),
            tag("span", &[("id", "tcp-launcher-label")], &[text("Tool 0")]),
        ]),
        text("\n            "),
        tag("button", &[("id", "btn-measurement"), ("type", "button"), ("data-panel-toggle", "measurement-panel"), ("title", "치수 측정 패널 표시/숨기기"), ("aria-label", "치수 측정 패널 표시/숨기기"), ("aria-pressed", "false")], &[
            tag("i", &[("class", "fa-solid fa-ruler-combined")], &[]),
            text(" 치수"),
        ]),
        text("\n            "),
        tag("button", &[("id", "btn-shape-panel"), ("type", "button"), ("data-panel-toggle", "shape-panel"), ("title", "도형 생성 및 편집 표시/숨기기"), ("aria-label", "도형 생성 및 편집 표시/숨기기"), ("aria-pressed", "false")], &[
            tag("i", &[("class", "fa-solid fa-cubes-stacked")], &[]),
            text(" 도형"),
        ]),
        text("\n            "),
        tag("button", &[("type", "button"), ("data-panel-toggle", "view-presets-panel"), ("title", "사용자 뷰 표시/숨김")], &[
            tag("i", &[("class", "fa-solid fa-camera")], &[]),
            text(" 뷰"),
        ]),
        text("\n            "),
        tag("button", &[("type", "button"), ("data-panel-toggle", "collaboration-panel"), ("title", "4인 협업 표시/숨김"), ("aria-label", "4인 협업 표시/숨김")], &[
            tag("i", &[("class", "fa-solid fa-people-arrows")], &[]),
            text(" "),
            tag("span", &[("data-i18n", "legacy.협업")], &[text("협업")]),
        ]),
        text("\n            "),
        tag("button", &[("type", "button"), ("data-panel-toggle", "virtual-controller-panel"), ("disabled", ""), ("title", "컨트롤러 연결 표시/숨김"), ("aria-label", "컨트롤러 연결 표시/숨김")], &[
            tag("i", &[("id", "virtual-controller-launcher-antenna"), ("class", "fa-solid fa-tower-broadcast virtual-controller-antenna disconnected")], &[]),
            text(" 컨트롤러 연결"),
        ]),
        text("\n            "),
        tag("button", &[("id", "btn-vision-panel"), ("type", "button"), ("data-panel-toggle", "vision-panel"), ("title", "가상 비전 표시/숨김"), ("aria-label", "가상 비전 표시/숨김")], &[
            tag("i", &[("class", "fa-solid fa-camera-retro")], &[]),
            text(" 비전"),
        ]),
        text("\n            "),
        tag("button", &[("id", "btn-io-simulator"), ("type", "button"), ("data-panel-toggle", "io-simulator-panel"), ("title", "IO 테스트 표시/숨김"), ("aria-label", "IO 테스트 표시/숨김")], &[
            tag("i", &[("class", "fa-solid fa-toggle-on")], &[]),
            text(" IO 테스트"),
        ]),
        text("\n            "),
        tag("span", &[("class", "viewer-control-divider")], &[]),
        text("\n            "),
        tag("button", &[("id", "btn-undo"), ("type", "button"), ("disabled", ""), ("title", "되돌리기 (Ctrl+Z)")], &[
            tag("i", &[("class", "fa-solid fa-rotate-left")], &[]),
        ]),
        text("\n            "),
        tag("button", &[("id", "btn-redo"), ("type", "button"), ("disabled", ""), ("title", "다시 실행 (Ctrl+Y)")], &[
            tag("i", &[("class", "fa-solid fa-rotate-right")], &[]),
        ]),
        text("\n            "),
        tag("span", &[("class", "viewer-control-divider")], &[]),
        text("\n            "),
        tag("button", &[("id", "btn-toggle-collision"), ("type", "button"), ("data-collision-mode", "off"), ("title", "충돌 감지 켜기"), ("aria-label", "충돌 감지 켜기"), ("aria-pressed", "false")], &[
            text("\n                "),
            tag("span", &[], &[text("Collision")]),
            text("\n                "),
            tag("i", &[("class", "fa-solid fa-shield-halved"), ("aria-hidden", "true")], &[]),
            text("\n            "),
        ]),
        text("\n            "),
        tag("button", &[("id", "btn-toggle-outline"), ("type", "button"), ("class", "active"), ("title", "외곽선 끄기"), ("aria-label", "외곽선 표시/숨김"), ("aria-pressed", "true")], &[
            tag("i", &[("class", "fa-solid fa-pen-nib")], &[]),
        ]),
        text("\n            "),
        tag("button", &[("id", "btn-reset-view"), ("type", "button"), ("title", "뷰 초기화"), ("aria-label", "뷰 초기화")], &[
            tag("i", &[("class", "fa-solid fa-arrows-rotate")], &[]),
        ]),
        text("\n            "),
        tag("button", &[("id", "btn-selected-view-pivot"), ("type", "button"), ("title", "선택 모델 중심 회전 켜기"), ("aria-label", "선택 모델 중심 회전 켜기"), ("aria-pressed", "false")], &[
            tag("i", &[("class", "fa-solid fa-crosshairs"), ("aria-hidden", "true")], &[]),
        ]),
        text("\n            "),
        tag("button", &[("id", "btn-toggle-grid"), ("type", "button"), ("class", "active"), ("title", "그리드 표시/숨김"), ("aria-label", "그리드 표시/숨김")], &[
            tag("i", &[("class", "fa-solid fa-border-all")], &[]),
        ]),
        text("\n        "),
    ]),
    text("\n    "),
]);
