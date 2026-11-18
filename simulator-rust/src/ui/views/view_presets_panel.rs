use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("aside", &[("id", "view-presets-panel"), ("class", "view-presets-panel panel-user-hidden"), ("aria-label", "사용자 뷰 저장")], &[
    text("\n                "),
    tag("div", &[("class", "view-presets-header")], &[
        text("\n                    "),
        tag("h2", &[], &[
            tag("i", &[("class", "fa-solid fa-camera")], &[]),
            text(" 사용자 뷰"),
        ]),
        text("\n                    "),
        tag("div", &[("class", "panel-header-actions")], &[
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "popout"), ("data-panel-id", "view-presets-panel"), ("title", "새 창으로 열기"), ("aria-label", "사용자 뷰 패널을 새 창으로 열기")], &[
                tag("i", &[("class", "fa-solid fa-up-right-from-square")], &[]),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "hide"), ("data-panel-id", "view-presets-panel"), ("title", "숨기기"), ("aria-label", "사용자 뷰 창 숨기기")], &[
                tag("i", &[("class", "fa-solid fa-eye-slash")], &[]),
            ]),
            text("\n                    "),
        ]),
        text("\n                "),
    ]),
    text("\n                "),
    tag("div", &[("class", "view-presets-content")], &[
        text("\n                    "),
        tag("p", &[("class", "view-presets-help")], &[
            text("카메라를 원하는 위치로 조정한 뒤 슬롯의 저장 버튼을 누르세요. 저장하지 않은 뷰도 화면 버튼으로 실행할 수 있으며, 이 경우 현재 메인 뷰의 각도에서 시작합니다. 뷰 버튼은 페이지 안의 고정 뷰 창으로 열리고, 다른 뷰를 누르면 같은 창에 분할되어 추가됩니다. 패널 헤더의 새 창 버튼은 패널을 화면 밖의 별도 창으로 엽니다."),
        ]),
        text("\n                    "),
        tag("p", &[("class", "view-presets-help")], &[text("각 뷰 이름 옆에 전환 시간(초)을 입력하고 저장하세요. IO 매핑과 프로그램의 View 명령은 해당 뷰에 저장된 시간으로 전환합니다. 0초는 즉시 전환합니다.")]),
        text("\n                    "),
        super::view_presets_list::VIEW,
        text("\n                "),
    ]),
    text("\n            "),
]);
