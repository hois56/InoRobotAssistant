use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const BODY: &[Node] = &[
    tag("div", &[("class", "vision-header")], &[
        text("\n          "),
        tag("h2", &[("id", "conveyor-tracking-title")], &[
            tag("i", &[("class", "fa-solid fa-arrows-left-right"), ("aria-hidden", "true")], &[]),
            text(" 컨베이어"),
        ]),
        text("\n          "),
        tag("div", &[("class", "panel-header-actions")], &[
            text("\n            "),
            tag("button", &[("type", "button"), ("data-panel-action", "popout"), ("data-panel-id", "conveyor-tracking-dialog"), ("title", "별도 창으로 분리"), ("aria-label", "컨베이어를 별도 창으로 분리")], &[
                tag("i", &[("class", "fa-solid fa-up-right-from-square"), ("aria-hidden", "true")], &[]),
            ]),
            text("\n            "),
            tag("button", &[("type", "button"), ("data-panel-action", "hide"), ("data-panel-id", "conveyor-tracking-dialog"), ("title", "숨기기"), ("aria-label", "컨베이어 숨기기")], &[
                tag("i", &[("class", "fa-solid fa-eye-slash"), ("aria-hidden", "true")], &[]),
            ]),
            text("\n          "),
        ]),
    ]),
    text("\n          "),
    tag("form", &[("class", "vision-content")], &[
        tag("div", &[("class", "vision-main")], &[
            text("\n          "),
            tag("p", &[("class", "vision-help")], &[text("컨베이어의 이동을 가상 컨트롤러의 엔코더·센서·비전 입력으로 연결합니다.")]),
            text("\n          "),
            tag("section", &[("class", "vision-page"), ("aria-labelledby", "conveyor-connection-title")], &[
                text("\n          "),
                tag("h3", &[("id", "conveyor-connection-title")], &[text("연결 대상")]),
                tag("div", &[("class", "vision-grid")], &[
                    text("\n          "),
                    tag("label", &[("class", "vision-field wide")], &[
                        tag("span", &[], &[text("컨베이어")]),
                        tag("select", &[("name", "belt")], &[]),
                    ]),
                    text("\n          "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("가상 컨트롤러")]),
                        tag("select", &[("name", "controller")], &[]),
                    ]),
                    text("\n          "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("컨베이어 번호")]),
                        tag("input", &[("name", "channel"), ("type", "number"), ("min", "0"), ("max", "3"), ("value", "0")], &[]),
                    ]),
                    text("\n          "),
                ]),
            ]),
            text("\n          "),
            tag("section", &[("class", "vision-page"), ("aria-labelledby", "conveyor-test-title")], &[
                text("\n          "),
                tag("h3", &[("id", "conveyor-test-title")], &[text("테스트 운전")]),
                tag("div", &[("class", "vision-grid")], &[
                    text("\n          "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("속도 (mm/s)")]),
                        tag("input", &[("name", "testSpeed"), ("type", "number"), ("min", "0.01"), ("max", "5000"), ("step", "any"), ("value", "100")], &[]),
                    ]),
                    text("\n          "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("운전 방향")]),
                        tag("select", &[("name", "testDirection")], &[
                            tag("option", &[("value", "forward")], &[text("정방향 (설정 방향)")]),
                            tag("option", &[("value", "reverse")], &[text("역방향 (반대 방향)")]),
                        ]),
                    ]),
                    text("\n          "),
                ]),
                tag("div", &[("class", "vision-actions")], &[
                    text("\n          "),
                    tag("button", &[("type", "button"), ("class", "vision-button primary"), ("data-action", "run")], &[text("운전 시작")]),
                    text("\n          "),
                    tag("button", &[("type", "button"), ("class", "vision-button"), ("data-action", "jog"), ("aria-pressed", "false")], &[text("JOG (누르는 동안)")]),
                    text("\n          "),
                    tag("button", &[("type", "button"), ("class", "vision-button danger"), ("data-action", "stop")], &[text("정지")]),
                    text("\n          "),
                ]),
                tag("p", &[("class", "vision-summary"), ("data-test-status", ""), ("role", "status"), ("aria-live", "polite")], &[text("정지")]),
                text("\n          "),
                tag("p", &[("class", "vision-help")], &[text("운전 시작은 정지를 누를 때까지 유지되며, 다른 프로그램으로 이동하거나 이 창을 숨기고 닫아도 계속 운전합니다. JOG는 누르는 동안만 움직이며 포커스가 벗어나거나 창을 숨기면 정지합니다. 테스트 속도와 방향은 동작 설정을 바꾸지 않습니다.")]),
                text("\n          "),
            ]),
            text("\n          "),
            tag("section", &[("class", "vision-page"), ("aria-labelledby", "conveyor-feed-title")], &[
                text("\n          "),
                tag("h3", &[("id", "conveyor-feed-title")], &[text("오브젝트 자동 공급")]),
                tag("div", &[("class", "vision-grid")], &[
                    text("\n          "),
                    tag("label", &[("class", "vision-field wide")], &[
                        tag("span", &[], &[text("등록 오브젝트")]),
                        tag("select", &[("name", "feedSource")], &[]),
                    ]),
                    text("\n          "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("물체 사이 최소 간격 (mm)")]),
                        tag("input", &[("name", "feedGap"), ("type", "number"), ("min", "0"), ("max", "1000000"), ("step", "any"), ("value", "100")], &[]),
                    ]),
                    text("\n          "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("좌우 위치 편차 (±mm)")]),
                        tag("input", &[("name", "feedPositionRange"), ("type", "number"), ("min", "0"), ("max", "1000000"), ("step", "any"), ("value", "20")], &[]),
                    ]),
                    text("\n          "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("회전 편차 (±°)")]),
                        tag("input", &[("name", "feedRotationRange"), ("type", "number"), ("min", "0"), ("max", "180"), ("step", "any"), ("value", "15")], &[]),
                    ]),
                    text("\n          "),
                ]),
                tag("label", &[("class", "vision-check")], &[
                    tag("input", &[("name", "feedEnabled"), ("type", "checkbox"), ("checked", "")], &[]),
                    text(" 컨베이어 운전 중 자동 공급"),
                ]),
                text("\n          "),
                tag("button", &[("type", "button"), ("class", "vision-button"), ("data-action", "apply-feed")], &[text("자동 공급 적용")]),
                text("\n          "),
                tag("p", &[("class", "vision-summary"), ("data-feed-status", ""), ("role", "status"), ("aria-live", "polite")], &[]),
                text("\n          "),
                tag("p", &[("class", "vision-help")], &[text("운전 방향의 입구에서 좌우 위치와 회전을 무작위로 바꿔 공급하므로 비전 위치·각도 보정을 시험할 수 있습니다. 편차를 0으로 설정하면 해당 변화를 끕니다. 벨트 안에 들어가도록 편차를 제한하고 회전해도 최소 간격을 유지합니다. 생성 물체는 접힌 자동 공급 그룹에 모이며 끝단을 지나면 정리됩니다. 집은 물체는 유지합니다.")]),
                text("\n          "),
            ]),
            text("\n          "),
            tag("section", &[("class", "vision-page"), ("aria-labelledby", "conveyor-input-title")], &[
                text("\n          "),
                tag("h3", &[("id", "conveyor-input-title")], &[text("엔코더 · 센서")]),
                tag("div", &[("class", "vision-grid")], &[
                    text("\n          "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("엔코더 (counts/mm)")]),
                        tag("input", &[("name", "scale"), ("type", "number"), ("min", "0.00001"), ("max", "1000000000"), ("value", "1000")], &[]),
                    ]),
                    text("\n          "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("센서 입력 (IN)")]),
                        tag("input", &[("name", "address"), ("type", "number"), ("min", "0"), ("max", "2559"), ("value", "512")], &[]),
                    ]),
                    text("\n          "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("센서 위치 X (mm)")]),
                        tag("input", &[("name", "position"), ("type", "number"), ("step", "any"), ("value", "0")], &[]),
                    ]),
                    text("\n          "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("센서 폭 (mm)")]),
                        tag("input", &[("name", "width"), ("type", "number"), ("min", "0.1"), ("max", "1000"), ("value", "2")], &[]),
                    ]),
                    text("\n          "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("센서 높이 (벨트 위 mm)")]),
                        tag("input", &[("name", "height"), ("type", "number"), ("min", "0.1"), ("max", "500"), ("step", "any"), ("value", "20")], &[]),
                    ]),
                    text("\n          "),
                ]),
                tag("p", &[("class", "vision-help")], &[text("센서는 이동 좌표계의 X 위치에서 벨트를 가로지릅니다. 빨간 레이저는 대기, 초록색은 감지입니다. 높이가 비어 있으면 기존 전체 높이 감지 영역을 유지합니다.")]),
                text("\n          "),
                tag("button", &[("type", "button"), ("class", "vision-button"), ("data-action", "apply-sensor")], &[text("센서 설정 적용")]),
                text("\n          "),
                tag("p", &[("class", "vision-summary"), ("data-sensor-preview", ""), ("role", "status"), ("aria-live", "polite")], &[]),
            ]),
            text("\n          "),
            tag("section", &[("class", "vision-page"), ("aria-labelledby", "conveyor-vision-title")], &[
                text("\n          "),
                tag("h3", &[("id", "conveyor-vision-title")], &[text("비전")]),
                tag("div", &[("class", "vision-grid")], &[
                    text("\n          "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("비전 물체 종류")]),
                        tag("input", &[("name", "objectType"), ("type", "number"), ("min", "0"), ("max", "15"), ("value", "0")], &[]),
                    ]),
                    text("\n          "),
                ]),
                tag("label", &[("class", "vision-check")], &[
                    tag("input", &[("name", "autoCapture"), ("type", "checkbox")], &[]),
                    text(" 센서 감지 시 자동 촬영"),
                ]),
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("촬영 지연거리 (mm)")]),
                    tag("input", &[("name", "captureDistance"), ("type", "number"), ("min", "0"), ("max", "1000000"), ("step", "any"), ("value", "0"), ("disabled", "")], &[]),
                ]),
                tag("p", &[("class", "vision-help")], &[text("센서 감지 후 벨트가 이동한 거리로 촬영 시점을 정합니다. 자동 촬영을 사용할 때는 프로그램에서 CnvTrigVis를 호출하지 마세요.")]),
                tag("p", &[("class", "vision-help")], &[text("비전 패널의 카메라 시야로 장면의 물체 좌표를 검출합니다.")]),
            ]),
            text("\n          "),
            tag("div", &[("class", "vision-actions")], &[
                text("\n            "),
                tag("button", &[("type", "button"), ("class", "vision-button primary"), ("data-action", "connect")], &[text("연동 시작")]),
                text("\n            "),
                tag("button", &[("type", "button"), ("class", "vision-button"), ("data-action", "capture")], &[text("현재 화면 촬영")]),
                text("\n            "),
                tag("button", &[("type", "button"), ("class", "vision-button danger"), ("data-action", "release")], &[text("연동 해제")]),
                text("\n          "),
            ]),
            text("\n          "),
            tag("p", &[("class", "vision-summary"), ("role", "status"), ("aria-live", "polite"), ("data-status", "")], &[]),
            text("\n          "),
            tag("div", &[("class", "conveyor-tracking-links"), ("data-links", "")], &[]),
            text("\n          "),
            tag("p", &[("class", "vision-help")], &[text("연동 해제 전 벨트를 정지하세요. 연결이 끊기면 가상 엔코더는 최대 250ms 안에 정지합니다.")]),
            text("\n          "),
        ]),
    ]),
];
