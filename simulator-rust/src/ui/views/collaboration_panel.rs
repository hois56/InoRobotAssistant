use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("aside", &[("id", "collaboration-panel"), ("class", "collaboration-panel panel-user-hidden"), ("aria-label", "4인 협업 시뮬레이션"), ("data-i18n-aria-label", "legacy.4인 협업 시뮬레이션")], &[
    text("\n                "),
    tag("div", &[("class", "collaboration-header")], &[
        text("\n                    "),
        tag("h2", &[], &[
            tag("i", &[("id", "collaboration-antenna"), ("class", "fa-solid fa-people-arrows collaboration-antenna idle"), ("aria-hidden", "true")], &[]),
            text(" "),
            tag("span", &[("data-i18n", "legacy.4인 협업")], &[text("4인 협업")]),
        ]),
        text("\n                    "),
        tag("div", &[("class", "panel-header-actions")], &[
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "popout"), ("data-panel-id", "collaboration-panel"), ("title", "별도 창으로 분리"), ("aria-label", "4인 협업 패널을 별도 창으로 분리"), ("data-i18n-title", "legacy.별도 창으로 분리"), ("data-i18n-aria-label", "legacy.4인 협업 패널을 별도 창으로 분리")], &[
                tag("i", &[("class", "fa-solid fa-up-right-from-square")], &[]),
            ]),
            text("\n                        "),
            tag("button", &[("type", "button"), ("data-panel-action", "hide"), ("data-panel-id", "collaboration-panel"), ("title", "숨기기"), ("aria-label", "4인 협업 패널 숨기기"), ("data-i18n-title", "legacy.숨기기"), ("data-i18n-aria-label", "legacy.4인 협업 패널 숨기기")], &[
                tag("i", &[("class", "fa-solid fa-eye-slash")], &[]),
            ]),
            text("\n                    "),
        ]),
        text("\n                "),
    ]),
    text("\n                "),
    tag("div", &[("class", "collaboration-content")], &[
        text("\n                    "),
        tag("p", &[("class", "collaboration-help"), ("data-i18n", "legacy.협업 안내")], &[text("방 코드를 공유하면 최대 4대의 컴퓨터에서 서로 다른 로봇을 동시에 제어할 수 있습니다.")]),
        text("\n                    "),
        tag("label", &[("class", "collaboration-field")], &[
            text("\n                        "),
            tag("span", &[("data-i18n", "legacy.사용자 이름")], &[text("사용자 이름")]),
            text("\n                        "),
            tag("input", &[("id", "collaboration-display-name"), ("type", "text"), ("maxlength", "32"), ("autocomplete", "nickname"), ("placeholder", "예: PC A"), ("data-i18n-placeholder", "legacy.예: PC A"), ("value", "")], &[]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("div", &[("class", "collaboration-room-actions")], &[
            text("\n                        "),
            tag("button", &[("id", "collaboration-create-room"), ("type", "button"), ("class", "primary")], &[
                tag("i", &[("class", "fa-solid fa-plus")], &[]),
                tag("span", &[("data-i18n", "legacy.방 만들기")], &[text("방 만들기")]),
            ]),
            text("\n                        "),
            tag("button", &[("id", "collaboration-leave-room"), ("type", "button"), ("class", "danger"), ("disabled", "")], &[
                tag("i", &[("class", "fa-solid fa-right-from-bracket")], &[]),
                tag("span", &[("data-i18n", "legacy.방 나가기")], &[text("방 나가기")]),
            ]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("div", &[("class", "collaboration-join-row")], &[
            text("\n                        "),
            tag("label", &[("class", "collaboration-field")], &[
                text("\n                            "),
                tag("span", &[("data-i18n", "legacy.방 코드")], &[text("방 코드")]),
                text("\n                            "),
                tag("input", &[("id", "collaboration-room-code-input"), ("type", "text"), ("maxlength", "4"), ("inputmode", "numeric"), ("pattern", "[0-9]{4}"), ("autocomplete", "off"), ("placeholder", "4자리 코드"), ("data-i18n-placeholder", "legacy.4자리 코드")], &[]),
                text("\n                        "),
            ]),
            text("\n                        "),
            tag("button", &[("id", "collaboration-join-room"), ("type", "button")], &[
                tag("i", &[("class", "fa-solid fa-arrow-right-to-bracket")], &[]),
                tag("span", &[("data-i18n", "legacy.참여")], &[text("참여")]),
            ]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("div", &[("id", "collaboration-room-summary"), ("class", "collaboration-room-summary"), ("hidden", "")], &[
            text("\n                        "),
            tag("div", &[("class", "collaboration-room-code-line")], &[
                text("\n                            "),
                tag("span", &[("data-i18n", "legacy.현재 방")], &[text("현재 방")]),
                text("\n                            "),
                tag("strong", &[("id", "collaboration-room-code")], &[text("----")]),
                text("\n                            "),
                tag("button", &[("id", "collaboration-copy-room-code"), ("type", "button"), ("title", "방 코드 복사"), ("aria-label", "방 코드 복사"), ("data-i18n-title", "legacy.방 코드 복사"), ("data-i18n-aria-label", "legacy.방 코드 복사")], &[
                    tag("i", &[("class", "fa-solid fa-copy")], &[]),
                ]),
                text("\n                        "),
            ]),
            text("\n                        "),
            tag("p", &[("id", "collaboration-role"), ("class", "collaboration-role")], &[]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("div", &[("class", "collaboration-status"), ("role", "status"), ("aria-live", "polite")], &[
            text("\n                        "),
            tag("i", &[("id", "collaboration-status-dot"), ("class", "fa-solid fa-circle idle"), ("aria-hidden", "true")], &[]),
            text("\n                        "),
            tag("span", &[("id", "collaboration-status"), ("data-i18n", "legacy.연결되지 않음")], &[text("연결되지 않음")]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("section", &[("class", "collaboration-section"), ("aria-labelledby", "collaboration-participants-title")], &[
            text("\n                        "),
            tag("h3", &[("id", "collaboration-participants-title"), ("data-i18n", "legacy.참여자")], &[text("참여자")]),
            text("\n                        "),
            tag("div", &[("id", "collaboration-participant-list"), ("class", "collaboration-participant-list")], &[
                tag("p", &[("class", "collaboration-empty"), ("data-i18n", "legacy.참여자 목록 없음")], &[text("방에 참여하면 표시됩니다.")]),
            ]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("section", &[("class", "collaboration-section"), ("aria-labelledby", "collaboration-robots-title")], &[
            text("\n                        "),
            tag("h3", &[("id", "collaboration-robots-title"), ("data-i18n", "legacy.로봇 제어권")], &[text("로봇 제어권")]),
            text("\n                        "),
            tag("div", &[("id", "collaboration-robot-list"), ("class", "collaboration-robot-list")], &[
                tag("p", &[("class", "collaboration-empty"), ("data-i18n", "legacy.로봇 선택 안내")], &[text("방에 참여하면 로봇을 선택할 수 있습니다.")]),
            ]),
            text("\n                    "),
        ]),
        text("\n                    "),
        tag("p", &[("id", "collaboration-error"), ("class", "collaboration-error"), ("role", "alert"), ("hidden", "")], &[]),
        text("\n                "),
    ]),
    text("\n            "),
]);
