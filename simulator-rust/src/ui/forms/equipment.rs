use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const BODY: &[Node] = &[
    tag("div", &[("class", "equipment-header")], &[
        tag("h2", &[], &[text("동작 설정")]),
        tag("div", &[("class", "panel-header-actions")], &[
            tag("button", &[("type", "button"), ("id", "equipment-popout"), ("title", "별도 창으로 분리"), ("aria-label", "동작 설정을 별도 창으로 분리")], &[
                tag("i", &[("class", "fa-solid fa-up-right-from-square")], &[]),
            ]),
            tag("button", &[("type", "button"), ("id", "equipment-close"), ("title", "숨기기"), ("aria-label", "동작 설정 숨기기")], &[
                tag("i", &[("class", "fa-solid fa-eye-slash")], &[]),
            ]),
        ]),
    ]),
    tag("p", &[("id", "equipment-target-label")], &[]),
    tag("form", &[("id", "equipment-form")], &[
        tag("input", &[("name", "id"), ("type", "hidden")], &[]),
        tag("fieldset", &[], &[
            tag("legend", &[], &[text("1. 동작 선택")]),
            tag("div", &[("class", "equipment-fields"), ("id", "equipment-basic")], &[
                tag("label", &[], &[
                    text("동작 종류"),
                    tag("select", &[("name", "type")], &[]),
                ]),
                tag("label", &[], &[
                    text("동작 이름"),
                    tag("input", &[("name", "name"), ("maxlength", "160")], &[]),
                ]),
                tag("label", &[], &[
                    text("방향"),
                    tag("select", &[("name", "axis")], &[
                        tag("option", &[], &[text("X")]),
                        tag("option", &[], &[text("-X")]),
                        tag("option", &[], &[text("Y")]),
                        tag("option", &[], &[text("-Y")]),
                        tag("option", &[], &[text("Z")]),
                        tag("option", &[], &[text("-Z")]),
                    ]),
                ]),
            ]),
        ]),
        tag("fieldset", &[], &[
            tag("legend", &[], &[text("2. IO 연결 (선택)")]),
            tag("p", &[("class", "equipment-help")], &[text("프로그램 실행 없이 IO 테스트 버튼으로도 동작합니다.")]),
            tag("div", &[("class", "equipment-fields"), ("id", "equipment-io")], &[
                tag("label", &[], &[
                    text("동작 조건"),
                    tag("select", &[("name", "ioTrigger")], &[
                        tag("option", &[("value", "1")], &[text("ON일 때 동작")]),
                        tag("option", &[("value", "0")], &[text("OFF일 때 동작")]),
                    ]),
                ]),
                tag("label", &[], &[
                    tag("span", &[("id", "equipment-forward-label")], &[text("전진 IO 번호")]),
                    tag("input", &[("type", "number"), ("name", "forwardAddress"), ("placeholder", "연결 안 함")], &[]),
                ]),
                tag("label", &[("id", "equipment-reverse-field")], &[
                    tag("span", &[("id", "equipment-reverse-label")], &[text("후진 IO 번호")]),
                    tag("input", &[("type", "number"), ("name", "reverseAddress"), ("placeholder", "연결 안 함")], &[]),
                ]),
            ]),
        ]),
        tag("details", &[("id", "equipment-advanced")], &[
            tag("summary", &[], &[text("추가 옵션 · 기준 모델, 로봇 연결")]),
            tag("div", &[("class", "equipment-fields"), ("id", "equipment-extra")], &[]),
        ]),
        tag("div", &[("class", "equipment-toolbar")], &[
            tag("button", &[("type", "submit")], &[text("동작 저장")]),
            tag("button", &[("type", "button"), ("id", "equipment-new")], &[text("새 동작")]),
        ]),
    ]),
    tag("p", &[("id", "equipment-error"), ("role", "status")], &[]),
    tag("div", &[("id", "equipment-current-controls")], &[]),
    tag("details", &[("id", "equipment-registered")], &[
        tag("summary", &[], &[text("등록된 동작 관리")]),
        tag("div", &[("id", "equipment-list")], &[]),
        tag("div", &[("class", "equipment-toolbar")], &[
            tag("button", &[("type", "button"), ("data-equipment-global", "start")], &[text("IO 제어 재개")]),
            tag("button", &[("type", "button"), ("data-equipment-global", "stop")], &[text("전체 정지")]),
            tag("button", &[("type", "button"), ("data-equipment-global", "reset")], &[text("모두 원위치")]),
        ]),
    ]),
];
