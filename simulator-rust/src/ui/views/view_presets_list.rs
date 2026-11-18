use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("div", &[("id", "view-presets-list"), ("class", "view-presets-list")], &[
    text("\n                        "),
    tag("div", &[("class", "view-preset-row"), ("data-view-slot", "0")], &[
        text("\n                            "),
        tag("span", &[("class", "view-preset-index")], &[text("1")]),
        text("\n                            "),
        tag("input", &[("type", "text"), ("data-view-name", ""), ("value", "View 1"), ("maxlength", "24"), ("aria-label", "뷰 1 이름")], &[]),
        text("\n                            "),
        tag("label", &[("class", "view-preset-duration")], &[
            tag("input", &[("type", "number"), ("data-view-seconds", ""), ("min", "0"), ("max", "3600"), ("step", "0.1"), ("value", "1"), ("aria-label", "뷰 1 전환 시간 (초)")], &[]),
            tag("span", &[], &[text("s")]),
        ]),
        text("\n                            "),
        tag("button", &[("type", "button"), ("data-view-save", ""), ("title", "현재 뷰 저장"), ("aria-label", "뷰 1에 현재 뷰 저장")], &[
            tag("i", &[("class", "fa-solid fa-floppy-disk")], &[]),
        ]),
        text("\n                            "),
        tag("button", &[("type", "button"), ("data-view-apply", ""), ("title", "뷰 적용"), ("aria-label", "뷰 1 적용"), ("disabled", "")], &[
            tag("i", &[("class", "fa-solid fa-eye")], &[]),
        ]),
        text("\n                            "),
        tag("button", &[("type", "button"), ("data-view-monitor", ""), ("title", "페이지 안의 고정 뷰 창에 보기"), ("aria-label", "뷰 1을 페이지 안의 고정 뷰 창에 보기")], &[
            tag("i", &[("class", "fa-solid fa-display")], &[]),
        ]),
        text("\n                        "),
    ]),
    text("\n                        "),
    tag("div", &[("class", "view-preset-row"), ("data-view-slot", "1")], &[
        text("\n                            "),
        tag("span", &[("class", "view-preset-index")], &[text("2")]),
        text("\n                            "),
        tag("input", &[("type", "text"), ("data-view-name", ""), ("value", "View 2"), ("maxlength", "24"), ("aria-label", "뷰 2 이름")], &[]),
        text("\n                            "),
        tag("label", &[("class", "view-preset-duration")], &[
            tag("input", &[("type", "number"), ("data-view-seconds", ""), ("min", "0"), ("max", "3600"), ("step", "0.1"), ("value", "1"), ("aria-label", "뷰 2 전환 시간 (초)")], &[]),
            tag("span", &[], &[text("s")]),
        ]),
        text("\n                            "),
        tag("button", &[("type", "button"), ("data-view-save", ""), ("title", "현재 뷰 저장"), ("aria-label", "뷰 2에 현재 뷰 저장")], &[
            tag("i", &[("class", "fa-solid fa-floppy-disk")], &[]),
        ]),
        text("\n                            "),
        tag("button", &[("type", "button"), ("data-view-apply", ""), ("title", "뷰 적용"), ("aria-label", "뷰 2 적용"), ("disabled", "")], &[
            tag("i", &[("class", "fa-solid fa-eye")], &[]),
        ]),
        text("\n                            "),
        tag("button", &[("type", "button"), ("data-view-monitor", ""), ("title", "페이지 안의 고정 뷰 창에 보기"), ("aria-label", "뷰 2를 페이지 안의 고정 뷰 창에 보기")], &[
            tag("i", &[("class", "fa-solid fa-display")], &[]),
        ]),
        text("\n                        "),
    ]),
    text("\n                        "),
    tag("div", &[("class", "view-preset-row"), ("data-view-slot", "2")], &[
        text("\n                            "),
        tag("span", &[("class", "view-preset-index")], &[text("3")]),
        text("\n                            "),
        tag("input", &[("type", "text"), ("data-view-name", ""), ("value", "View 3"), ("maxlength", "24"), ("aria-label", "뷰 3 이름")], &[]),
        text("\n                            "),
        tag("label", &[("class", "view-preset-duration")], &[
            tag("input", &[("type", "number"), ("data-view-seconds", ""), ("min", "0"), ("max", "3600"), ("step", "0.1"), ("value", "1"), ("aria-label", "뷰 3 전환 시간 (초)")], &[]),
            tag("span", &[], &[text("s")]),
        ]),
        text("\n                            "),
        tag("button", &[("type", "button"), ("data-view-save", ""), ("title", "현재 뷰 저장"), ("aria-label", "뷰 3에 현재 뷰 저장")], &[
            tag("i", &[("class", "fa-solid fa-floppy-disk")], &[]),
        ]),
        text("\n                            "),
        tag("button", &[("type", "button"), ("data-view-apply", ""), ("title", "뷰 적용"), ("aria-label", "뷰 3 적용"), ("disabled", "")], &[
            tag("i", &[("class", "fa-solid fa-eye")], &[]),
        ]),
        text("\n                            "),
        tag("button", &[("type", "button"), ("data-view-monitor", ""), ("title", "페이지 안의 고정 뷰 창에 보기"), ("aria-label", "뷰 3을 페이지 안의 고정 뷰 창에 보기")], &[
            tag("i", &[("class", "fa-solid fa-display")], &[]),
        ]),
        text("\n                        "),
    ]),
    text("\n                        "),
    tag("div", &[("class", "view-preset-row"), ("data-view-slot", "3")], &[
        text("\n                            "),
        tag("span", &[("class", "view-preset-index")], &[text("4")]),
        text("\n                            "),
        tag("input", &[("type", "text"), ("data-view-name", ""), ("value", "View 4"), ("maxlength", "24"), ("aria-label", "뷰 4 이름")], &[]),
        text("\n                            "),
        tag("label", &[("class", "view-preset-duration")], &[
            tag("input", &[("type", "number"), ("data-view-seconds", ""), ("min", "0"), ("max", "3600"), ("step", "0.1"), ("value", "1"), ("aria-label", "뷰 4 전환 시간 (초)")], &[]),
            tag("span", &[], &[text("s")]),
        ]),
        text("\n                            "),
        tag("button", &[("type", "button"), ("data-view-save", ""), ("title", "현재 뷰 저장"), ("aria-label", "뷰 4에 현재 뷰 저장")], &[
            tag("i", &[("class", "fa-solid fa-floppy-disk")], &[]),
        ]),
        text("\n                            "),
        tag("button", &[("type", "button"), ("data-view-apply", ""), ("title", "뷰 적용"), ("aria-label", "뷰 4 적용"), ("disabled", "")], &[
            tag("i", &[("class", "fa-solid fa-eye")], &[]),
        ]),
        text("\n                            "),
        tag("button", &[("type", "button"), ("data-view-monitor", ""), ("title", "페이지 안의 고정 뷰 창에 보기"), ("aria-label", "뷰 4를 페이지 안의 고정 뷰 창에 보기")], &[
            tag("i", &[("class", "fa-solid fa-display")], &[]),
        ]),
        text("\n                        "),
    ]),
    text("\n                    "),
]);
