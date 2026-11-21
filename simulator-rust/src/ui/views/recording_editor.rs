use crate::ui::{tag, text, Node};

#[rustfmt::skip]
pub(super) const VIEW: Node = tag("dialog", &[("id", "recording-editor"), ("aria-labelledby", "recording-editor-title")], &[
    tag("header", &[("class", "recording-editor-header")], &[
        tag("h2", &[("id", "recording-editor-title")], &[text("녹화 편집")]),
        tag("select", &[("data-edit", "source"), ("aria-label", "검토할 녹화"), ("hidden", "")], &[
            tag("option", &[("value", "current")], &[text("현재 녹화")]),
            tag("option", &[("value", "last")], &[text("마지막 녹화")]),
            tag("option", &[("value", "file")], &[text("열어 둔 파일")]),
        ]),
        tag("button", &[("type", "button"), ("data-edit", "open")], &[text("녹화 파일 열기")]),
        tag("input", &[("type", "file"), ("accept", ".webm,video/webm"), ("data-edit", "file"), ("hidden", "")], &[]),
        tag("button", &[("type", "button"), ("data-edit", "close"), ("aria-label", "닫기")], &[text("×")]),
    ]),
    tag("p", &[("data-edit", "empty")], &[text("편집할 시뮬레이션 녹화 파일(.webm)을 열어 주세요.")]),
    tag("div", &[("data-edit", "workspace"), ("hidden", "")], &[
        tag("canvas", &[("data-edit", "preview"), ("width", "640"), ("height", "360"), ("aria-label", "편집 미리보기")], &[]),
        tag("div", &[("class", "recording-transport")], &[
            tag("button", &[("type", "button"), ("data-edit", "play"), ("aria-label", "영상 재생")], &[text("▶")]),
            tag("button", &[("type", "button"), ("data-edit", "live"), ("aria-pressed", "false"), ("hidden", "")], &[text("라이브")]),
            tag("span", &[("data-edit", "position"), ("class", "recording-time")], &[]),
        ]),
        tag("fieldset", &[("class", "recording-cut-controls")], &[
            tag("legend", &[], &[text("컷 편집")]),
            tag("div", &[("class", "recording-timeline"), ("data-edit", "timeline")], &[
                tag("div", &[("class", "recording-ruler"), ("data-edit", "ruler"), ("aria-hidden", "true")], &[
                    tag("span", &[], &[]), tag("span", &[], &[]), tag("span", &[], &[]), tag("span", &[], &[]), tag("span", &[], &[]),
                ]),
                tag("input", &[("type", "range"), ("data-edit", "seek"), ("aria-label", "재생 위치"), ("min", "0"), ("step", "1"), ("value", "0")], &[]),
                tag("div", &[("class", "recording-track")], &[
                    tag("canvas", &[("data-edit", "filmstrip"), ("aria-hidden", "true")], &[]),
                    tag("div", &[("class", "recording-pieces"), ("data-edit", "pieces"), ("role", "group"), ("aria-label", "분할 조각")], &[]),
                    tag("div", &[("class", "recording-handles"), ("data-edit", "handles")], &[
                        tag("span", &[("data-edge", "start"), ("role", "slider"), ("tabindex", "0"), ("aria-label", "시작점 지정"), ("title", "시작점 지정")], &[]),
                        tag("span", &[("data-edge", "end"), ("role", "slider"), ("tabindex", "0"), ("aria-label", "끝점 지정"), ("title", "끝점 지정")], &[]),
                    ]),
                    tag("span", &[("class", "recording-trim-guide"), ("data-edit", "guide"), ("hidden", "")], &[]),
                    tag("span", &[("class", "recording-clock-mark"), ("data-edit", "clock-mark"), ("hidden", ""), ("aria-hidden", "true")], &[]),
                    tag("span", &[("class", "recording-clock-mark"), ("data-edit", "clock-end-mark"), ("hidden", ""), ("aria-hidden", "true")], &[]),
                ]),
                tag("span", &[("class", "recording-playhead"), ("data-edit", "playhead"), ("aria-hidden", "true")], &[]),
            ]),
            tag("div", &[("class", "recording-edit-row")], &[
                tag("button", &[("type", "button"), ("data-edit", "split")], &[text("현재 위치에서 분할")]),
                tag("button", &[("type", "button"), ("data-edit", "delete-piece")], &[text("선택 조각 삭제")]),
                tag("button", &[("type", "button"), ("data-edit", "keep-piece")], &[text("선택 구간만 남기기")]),
            ]),
        ]),
        tag("fieldset", &[], &[
            tag("legend", &[], &[text("스톱워치")]),
            tag("div", &[("class", "recording-stopwatch-controls")], &[
                tag("button", &[("type", "button"), ("data-edit", "clock")], &[text("현재 위치부터 시작")]),
                tag("span", &[("data-edit", "clock-time"), ("class", "recording-time")], &[]),
                tag("button", &[("type", "button"), ("data-edit", "clock-end")], &[text("현재 위치에서 종료")]),
                tag("span", &[("data-edit", "clock-end-time"), ("class", "recording-time")], &[]),
                tag("button", &[("type", "button"), ("data-edit", "clear-clock")], &[text("스톱워치 해제")]),
            ]),
            tag("label", &[("class", "recording-clock-option")], &[
                tag("input", &[("type", "checkbox"), ("data-edit", "hide-clock")], &[]),
                text("종료 후 숨기기"),
            ]),
        ]),
        tag("footer", &[], &[
            tag("button", &[("type", "button"), ("data-edit", "undo")], &[text("편집 되돌리기")]),
            tag("button", &[("type", "button"), ("data-edit", "save")], &[text("편집본 저장")]),
        ]),
    ]),
    tag("p", &[("role", "status"), ("data-edit", "status")], &[]),
]);
