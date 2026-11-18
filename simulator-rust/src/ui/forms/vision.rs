use crate::ui::{tag, text, translated, Node};

#[rustfmt::skip]
pub(super) const BODY: &[Node] = &[
    text("\n            "),
    tag("div", &[("class", "vision-empty"), ("data-vision-empty", "")], &[
        text("\n                "),
        tag("p", &[], &[text("가상 비전 카메라를 배치해 FOV 확인, 9점·회전 캘리브레이션, 작업물 위치 보정과 로봇 통신을 실습합니다.")]),
        text("\n                "),
        tag("button", &[("type", "button"), ("class", "vision-button primary"), ("data-vision-action", "enable")], &[
            tag("i", &[("class", "fa-solid fa-camera"), ("aria-hidden", "true")], &[]),
            text(" 가상 비전 배치"),
        ]),
        text("\n            "),
    ]),
    text("\n            "),
    tag("div", &[("class", "vision-main"), ("data-vision-main", "")], &[
        text("\n                "),
        tag("div", &[("class", "vision-view")], &[
            text("\n                    "),
            tag("canvas", &[("data-vision-canvas", ""), ("width", "640"), ("height", "512"), ("aria-label", "가상 비전 영상")], &[]),
            text("\n                    "),
            tag("div", &[("class", "vision-view-bar")], &[
                text("\n                        "),
                tag("span", &[("class", "vision-link-badge"), ("data-vision-out", "link-badge")], &[]),
                text("\n                        "),
                tag("label", &[("class", "vision-check")], &[
                    tag("input", &[("type", "checkbox"), ("data-vision-field", "camera.showFrustum")], &[]),
                    tag("span", &[], &[text("FOV 표시")]),
                ]),
                text("\n                    "),
            ]),
            text("\n                    "),
            tag("div", &[("class", "vision-result"), ("data-vision-out", "result")], &[]),
            text("\n                "),
        ]),
        text("\n                "),
        tag("div", &[("class", "vision-tabs"), ("role", "tablist")], &[
            text("\n                    "),
            tag("button", &[("type", "button"), ("role", "tab"), ("data-vision-tab", "camera")], &[text("카메라")]),
            text("\n                    "),
            tag("button", &[("type", "button"), ("role", "tab"), ("data-vision-tab", "calibration")], &[text("캘리브레이션")]),
            text("\n                    "),
            tag("button", &[("type", "button"), ("role", "tab"), ("data-vision-tab", "workpiece")], &[text("작업물")]),
            text("\n                    "),
            tag("button", &[("type", "button"), ("role", "tab"), ("data-vision-tab", "link")], &[text("통신")]),
            text("\n                "),
        ]),
        text("\n                "),
        tag("section", &[("class", "vision-page"), ("data-vision-page", "camera")], &[
            text("\n                    "),
            tag("div", &[("class", "vision-mount"), ("data-vision-out", "mount")], &[]),
            text("\n                    "),
            tag("div", &[("class", "vision-grid three")], &[
                text("\n                        "),
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("촬상 방향")]),
                    tag("select", &[("data-vision-field", "camera.direction")], &[
                        tag("option", &[("value", "down")], &[text("하향 (위 → 아래)")]),
                        tag("option", &[("value", "up")], &[text("상향 (아래 → 위)")]),
                    ]),
                ]),
                text("\n                        "),
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("초점 거리")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "camera.focalLengthMm"), ("step", "0.5")], &[]),
                    tag("em", &[], &[text("mm")]),
                ]),
                text("\n                        "),
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("해상도")]),
                    tag("select", &[("data-vision-resolution", "")], &[
                        tag("option", &[("value", "1280x1024")], &[text("1.3MP (1280×1024)")]),
                        tag("option", &[("value", "1920x1200")], &[text("2.3MP (1920×1200)")]),
                        tag("option", &[("value", "2448x2048")], &[text("5MP (2448×2048)")]),
                        tag("option", &[("value", "640x480")], &[text("VGA (640×480)")]),
                        tag("option", &[("value", "custom")], &[text("사용자 지정")]),
                    ]),
                ]),
                text("\n                    "),
            ]),
            text("\n                    "),
            tag("p", &[("class", "vision-summary"), ("data-vision-out", "fov")], &[]),
            text("\n                    "),
            tag("div", &[("class", "vision-actions")], &[
                tag("button", &[("type", "button"), ("class", "vision-button primary"), ("data-vision-action", "capture")], &[
                    tag("i", &[("class", "fa-solid fa-camera"), ("aria-hidden", "true")], &[]),
                    text(" 촬상"),
                ]),
            ]),
            text("\n                    "),
            tag("div", &[("class", "vision-actions")], &[
                tag("button", &[("type", "button"), ("class", "vision-button "), ("data-vision-action", "place")], &[
                    tag("i", &[("class", "fa-solid fa-wand-magic-sparkles"), ("aria-hidden", "true")], &[]),
                    text(" 로봇 작업 영역에 자동 배치"),
                ]),
            ]),
            text("\n                    "),
            tag("details", &[("class", "vision-details")], &[
                text("\n                        "),
                tag("summary", &[("data-panel-drag-ignore", "")], &[text("고급 설정")]),
                text("\n                        "),
                tag("div", &[("class", "vision-grid three")], &[
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("화소 크기")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "camera.pixelSizeUm"), ("step", "0.1")], &[]),
                        tag("em", &[], &[text("µm")]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("가로 화소")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "camera.resolutionWidth"), ("step", "1")], &[]),
                        tag("em", &[], &[text("px")]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("세로 화소")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "camera.resolutionHeight"), ("step", "1")], &[]),
                        tag("em", &[], &[text("px")]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("FOV 표시 높이")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "camera.workPlaneZ"), ("step", "1")], &[]),
                        tag("em", &[], &[text("mm")]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("검출 노이즈")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "camera.noisePx"), ("step", "0.01")], &[]),
                        tag("em", &[], &[text("px")]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("처리 시간")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "camera.processingMs"), ("step", "10")], &[]),
                        tag("em", &[], &[text("ms")]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("이름")]),
                        tag("input", &[("type", "text"), ("data-type", "text"), ("data-vision-field", "name"), ("spellcheck", "false")], &[]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field wide")], &[
                        tag("span", &[], &[text("캘리브레이션 로봇")]),
                        tag("select", &[("data-vision-field", "robotId"), ("data-vision-robots", "")], &[]),
                    ]),
                    text("\n                        "),
                ]),
                text("\n                    "),
            ]),
            text("\n                "),
        ]),
        text("\n                "),
        tag("section", &[("class", "vision-page"), ("data-vision-page", "calibration")], &[
            text("\n                    "),
            tag("p", &[("class", "vision-help")], &[text("Tool 마크를 3×3 격자로 움직여 화소와 로봇 좌표를 맞추고, 제자리 회전으로 회전 중심을 보정합니다.")]),
            text("\n                    "),
            tag("div", &[("class", "vision-grid three")], &[
                text("\n                        "),
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("중심 X")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "calibration.centerX"), ("step", "1")], &[]),
                ]),
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("중심 Y")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "calibration.centerY"), ("step", "1")], &[]),
                ]),
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("높이 Z")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "calibration.z"), ("step", "1")], &[]),
                ]),
                text("\n                        "),
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("간격 X")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "calibration.pitchX"), ("step", "1")], &[]),
                ]),
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("간격 Y")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "calibration.pitchY"), ("step", "1")], &[]),
                ]),
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("회전 각도 ±")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "calibration.rotationAngle"), ("step", "1")], &[]),
                    tag("em", &[], &[text("°")]),
                ]),
                text("\n                    "),
            ]),
            text("\n                    "),
            tag("div", &[("class", "vision-actions")], &[
                text("\n                        "),
                tag("button", &[("type", "button"), ("class", "vision-button "), ("data-vision-action", "cal-center")], &[
                    tag("i", &[("class", "fa-solid fa-location-crosshairs"), ("aria-hidden", "true")], &[]),
                    text(" 현재 TCP를 중심으로"),
                ]),
                text("\n                        "),
                tag("button", &[("type", "button"), ("class", "vision-button primary"), ("data-vision-action", "cal-auto")], &[
                    tag("i", &[("class", "fa-solid fa-play"), ("aria-hidden", "true")], &[]),
                    text(" 자동 캘리브레이션"),
                ]),
                text("\n                        "),
                tag("button", &[("type", "button"), ("class", "vision-button "), ("data-vision-action", "cal-export-lab")], &[
                    tag("i", &[("class", "fa-solid fa-file-export"), ("aria-hidden", "true")], &[]),
                    text(" K12 보정값 내보내기"),
                ]),
                text("\n                        "),
                tag("button", &[("type", "button"), ("class", "vision-button danger"), ("data-vision-action", "cal-clear")], &[
                    tag("i", &[("class", "fa-solid fa-eraser"), ("aria-hidden", "true")], &[]),
                    text(" 초기화"),
                ]),
                text("\n                    "),
            ]),
            text("\n                    "),
            tag("div", &[("class", "vision-grid three")], &[
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("K12 비전 좌표계")]),
                    tag("select", &[("data-vision-field", "calibration.controllerCoordinate"), ("data-type", "number")], &[
                        tag("option", &[("value", "0")], &[text("0")]),
                        tag("option", &[("value", "1")], &[text("1")]),
                        tag("option", &[("value", "2")], &[text("2")]),
                        tag("option", &[("value", "3")], &[text("3")]),
                        tag("option", &[("value", "4")], &[text("4")]),
                        tag("option", &[("value", "5")], &[text("5")]),
                        tag("option", &[("value", "6")], &[text("6")]),
                        tag("option", &[("value", "7")], &[text("7")]),
                        tag("option", &[("value", "8")], &[text("8")]),
                        tag("option", &[("value", "9")], &[text("9")]),
                        tag("option", &[("value", "10")], &[text("10")]),
                        tag("option", &[("value", "11")], &[text("11")]),
                        tag("option", &[("value", "12")], &[text("12")]),
                        tag("option", &[("value", "13")], &[text("13")]),
                        tag("option", &[("value", "14")], &[text("14")]),
                        tag("option", &[("value", "15")], &[text("15")]),
                    ]),
                ]),
            ]),
            text("\n                    "),
            tag("p", &[("class", "vision-help")], &[translated("K12 내보내기는 로봇 BASE 좌표 기준입니다. 기존 Lab 보정 파일과 다른 좌표계는 보존됩니다.")]),
            text("\n                    "),
            tag("div", &[("class", "vision-info"), ("data-vision-out", "calibration")], &[]),
            text("\n                    "),
            tag("details", &[("class", "vision-details")], &[
                text("\n                        "),
                tag("summary", &[("data-panel-drag-ignore", "")], &[text("점별 결과")]),
                text("\n                        "),
                tag("div", &[("data-vision-out", "calibration-table")], &[]),
                text("\n                    "),
            ]),
            text("\n                    "),
            tag("details", &[("class", "vision-details")], &[
                text("\n                        "),
                tag("summary", &[("data-panel-drag-ignore", "")], &[text("고급 설정")]),
                text("\n                        "),
                tag("div", &[("class", "vision-grid three")], &[
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("변환 모델")]),
                        tag("select", &[("data-vision-field", "calibration.method")], &[
                            tag("option", &[("value", "affine")], &[text("어파인")]),
                            tag("option", &[("value", "homography")], &[text("호모그래피 (원근)")]),
                        ]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("이동 순서")]),
                        tag("select", &[("data-vision-field", "calibration.order")], &[
                            tag("option", &[("value", "snake")], &[text("지그재그")]),
                            tag("option", &[("value", "raster")], &[text("행 순서")]),
                        ]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("기준 R")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "calibration.r"), ("step", "1")], &[]),
                        tag("em", &[], &[text("°")]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("회전 점 수")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "calibration.rotationCount"), ("step", "1"), ("min", "0"), ("max", "11")], &[]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("마크 X")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "calibration.markOffsetX"), ("step", "1")], &[]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("마크 Y")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "calibration.markOffsetY"), ("step", "1")], &[]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("마크 지름")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "calibration.markSize"), ("step", "1")], &[]),
                    ]),
                    text("\n                        "),
                ]),
                text("\n                        "),
                tag("div", &[("class", "vision-checks")], &[
                    tag("label", &[("class", "vision-check")], &[
                        tag("input", &[("type", "checkbox"), ("data-vision-field", "calibration.showMark")], &[]),
                        tag("span", &[], &[text("마크 표시")]),
                    ]),
                ]),
                text("\n                    "),
            ]),
            text("\n                "),
        ]),
        text("\n                "),
        tag("section", &[("class", "vision-page"), ("data-vision-page", "workpiece")], &[
            text("\n                    "),
            tag("div", &[("class", "vision-grid three")], &[
                text("\n                        "),
                tag("label", &[("class", "vision-field wide")], &[
                    tag("span", &[], &[text("작업물 오브젝트")]),
                    tag("select", &[("data-vision-field", "detection.targetId"), ("data-vision-targets", "")], &[]),
                ]),
                text("\n                    "),
            ]),
            text("\n                    "),
            tag("div", &[("class", "vision-grid three")], &[
                text("\n                        "),
                tag("label", &[("class", "vision-field"), ("data-vision-if", "generated")], &[
                    tag("span", &[], &[text("형상")]),
                    tag("select", &[("data-vision-field", "generator.shape")], &[
                        tag("option", &[("value", "box")], &[text("사각형")]),
                        tag("option", &[("value", "cylinder")], &[text("원통")]),
                    ]),
                ]),
                text("\n                        "),
                tag("label", &[("class", "vision-field"), ("data-vision-if", "generated")], &[
                    tag("span", &[], &[text("크기 X")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "generator.sizeX"), ("step", "1")], &[]),
                ]),
                tag("label", &[("class", "vision-field"), ("data-vision-if", "generated")], &[
                    tag("span", &[], &[text("크기 Y")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "generator.sizeY"), ("step", "1")], &[]),
                ]),
                text("\n                        "),
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("편차 X ±")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "generator.rangeX"), ("step", "1")], &[]),
                ]),
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("편차 Y ±")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "generator.rangeY"), ("step", "1")], &[]),
                ]),
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("편차 Rz ±")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "generator.rangeRz"), ("step", "1")], &[]),
                    tag("em", &[], &[text("°")]),
                ]),
                text("\n                    "),
            ]),
            text("\n                    "),
            tag("div", &[("class", "vision-actions")], &[
                text("\n                        "),
                tag("button", &[("type", "button"), ("class", "vision-button "), ("data-vision-action", "spawn-nominal")], &[
                    tag("i", &[("class", "fa-solid fa-cube"), ("aria-hidden", "true")], &[]),
                    text(" "),
                    tag("span", &[], &[text("기준 위치에 생성")]),
                ]),
                text("\n                        "),
                tag("button", &[("type", "button"), ("class", "vision-button primary"), ("data-vision-action", "spawn")], &[
                    tag("i", &[("class", "fa-solid fa-shuffle"), ("aria-hidden", "true")], &[]),
                    text(" 무작위 생성"),
                ]),
                text("\n                        "),
                tag("span", &[("data-vision-if", "generated")], &[
                    tag("button", &[("type", "button"), ("class", "vision-button danger"), ("data-vision-action", "spawn-clear")], &[
                        tag("i", &[("class", "fa-solid fa-trash"), ("aria-hidden", "true")], &[]),
                        text(" 생성물 삭제"),
                    ]),
                ]),
                text("\n                    "),
            ]),
            text("\n                    "),
            tag("div", &[("class", "vision-grid three")], &[
                text("\n                        "),
                tag("label", &[("class", "vision-field wide")], &[
                    tag("span", &[], &[text("회전 중심")]),
                    tag("select", &[("data-vision-field", "detection.rotationCenter")], &[
                        tag("option", &[("value", "object")], &[text("작업물 중심")]),
                        tag("option", &[("value", "pick")], &[text("로봇 픽업점")]),
                    ]),
                ]),
                text("\n                    "),
            ]),
            text("\n                    "),
            tag("div", &[("class", "vision-actions")], &[
                text("\n                        "),
                tag("button", &[("type", "button"), ("class", "vision-button primary"), ("data-vision-action", "master")], &[
                    tag("i", &[("class", "fa-solid fa-bookmark"), ("aria-hidden", "true")], &[]),
                    text(" 기준 위치 등록"),
                ]),
                text("\n                        "),
                tag("button", &[("type", "button"), ("class", "vision-button "), ("data-vision-action", "pick-tcp")], &[
                    tag("i", &[("class", "fa-solid fa-hand-pointer"), ("aria-hidden", "true")], &[]),
                    text(" 현재 TCP를 픽업점으로"),
                ]),
                text("\n                    "),
            ]),
            text("\n                    "),
            tag("div", &[("class", "vision-info"), ("data-vision-out", "workpiece")], &[]),
            text("\n                    "),
            tag("details", &[("class", "vision-details")], &[
                text("\n                        "),
                tag("summary", &[("data-panel-drag-ignore", "")], &[text("고급 설정")]),
                text("\n                        "),
                tag("div", &[("class", "vision-grid three")], &[
                    text("\n                            "),
                    tag("label", &[("class", "vision-field"), ("data-vision-if", "generated")], &[
                        tag("span", &[], &[text("높이")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "generator.sizeZ"), ("step", "1")], &[]),
                    ]),
                    tag("label", &[("class", "vision-field"), ("data-vision-if", "generated")], &[
                        tag("span", &[], &[text("색상")]),
                        tag("input", &[("type", "color"), ("data-type", "text"), ("data-vision-field", "generator.color")], &[]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("난수 시드")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "generator.seed"), ("step", "1"), ("min", "0")], &[]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("기준 X")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "generator.nominalX"), ("step", "1")], &[]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("기준 Y")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "generator.nominalY"), ("step", "1")], &[]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("바닥 Z")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "generator.nominalZ"), ("step", "1")], &[]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("기준 Rz")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "generator.nominalRz"), ("step", "1")], &[]),
                        tag("em", &[], &[text("°")]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("픽업 X")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "detection.pickX"), ("step", "1")], &[]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("픽업 Y")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "detection.pickY"), ("step", "1")], &[]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("생성 신호 OUT")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "generator.triggerBit"), ("step", "1"), ("min", "-1")], &[]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("공급 지연")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "generator.supplyDelayMs"), ("step", "100")], &[]),
                        tag("em", &[], &[text("ms")]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("회전 대칭")]),
                        tag("select", &[("data-vision-field", "detection.symmetry"), ("data-type", "number")], &[
                            tag("option", &[("value", "1")], &[text("없음 (360°)")]),
                            tag("option", &[("value", "2")], &[text("2회 (180°)")]),
                            tag("option", &[("value", "4")], &[text("4회 (90°)")]),
                        ]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("최소 점수")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "detection.minScore"), ("step", "1"), ("min", "0"), ("max", "100")], &[]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("한계 X ±")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "detection.limitX"), ("step", "1")], &[]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("한계 Y ±")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "detection.limitY"), ("step", "1")], &[]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("한계 θ ±")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "detection.limitTheta"), ("step", "1")], &[]),
                        tag("em", &[], &[text("°")]),
                    ]),
                    text("\n                        "),
                ]),
                text("\n                        "),
                tag("div", &[("class", "vision-checks")], &[
                    tag("label", &[("class", "vision-check")], &[
                        tag("input", &[("type", "checkbox"), ("data-vision-field", "generator.autoSupply")], &[]),
                        tag("span", &[], &[text("작업물을 가져가면 자동 공급")]),
                    ]),
                    tag("label", &[("class", "vision-check")], &[
                        tag("input", &[("type", "checkbox"), ("data-vision-field", "generator.captureOnSpawn")], &[]),
                        tag("span", &[], &[text("생성 후 자동 검사")]),
                    ]),
                ]),
                text("\n                        "),
                tag("div", &[("class", "vision-actions")], &[
                    tag("button", &[("type", "button"), ("class", "vision-button danger"), ("data-vision-action", "master-clear")], &[
                        tag("i", &[("class", "fa-solid fa-eraser"), ("aria-hidden", "true")], &[]),
                        text(" 기준 삭제"),
                    ]),
                ]),
                text("\n                    "),
            ]),
            text("\n                "),
        ]),
        text("\n                "),
        tag("section", &[("class", "vision-page"), ("data-vision-page", "link")], &[
            text("\n                    "),
            tag("div", &[("class", "vision-grid three")], &[
                text("\n                        "),
                tag("label", &[("class", "vision-field wide")], &[
                    tag("span", &[], &[text("연결 대상")]),
                    tag("select", &[("data-vision-field", "link.target"), ("disabled", "")], &[
                        tag("option", &[("value", "external")], &[text("가상/실제 컨트롤러")]),
                    ]),
                ]),
                text("\n                        "),
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("프로토콜")]),
                    tag("select", &[("data-vision-field", "link.protocol")], &[
                        tag("option", &[("value", "socket")], &[text("Socket")]),
                        tag("option", &[("value", "eip")], &[text("Ethernet/IP")]),
                    ]),
                ]),
                text("\n                        "),
                tag("label", &[("class", "vision-field"), ("data-vision-if", "role")], &[
                    tag("span", &[], &[text("비전 역할")]),
                    tag("select", &[("data-vision-field", "link.role")], &[
                        tag("option", &[("value", "server")], &[text("서버")]),
                        tag("option", &[("value", "client")], &[text("클라이언트")]),
                    ]),
                ]),
                text("\n                        "),
                tag("label", &[("class", "vision-field")], &[
                    tag("span", &[], &[text("비전 IP")]),
                    tag("input", &[("type", "text"), ("data-type", "text"), ("data-vision-field", "ip"), ("placeholder", "127.0.0.11"), ("spellcheck", "false")], &[]),
                ]),
                text("\n                        "),
                tag("label", &[("class", "vision-field"), ("data-vision-if", "role server")], &[
                    tag("span", &[], &[text("비전 포트")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "link.port"), ("step", "1")], &[]),
                ]),
                text("\n                        "),
                tag("label", &[("class", "vision-field"), ("data-vision-if", "external client")], &[
                    tag("span", &[], &[text("대상 IP")]),
                    tag("input", &[("type", "text"), ("data-type", "text"), ("data-vision-field", "link.targetIp"), ("placeholder", "127.0.0.1"), ("spellcheck", "false")], &[]),
                ]),
                text("\n                        "),
                tag("label", &[("class", "vision-field"), ("data-vision-if", "external client")], &[
                    tag("span", &[], &[text("대상 포트")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "link.targetPort"), ("step", "1")], &[]),
                ]),
                text("\n                        "),
                tag("label", &[("class", "vision-field"), ("data-vision-if", "words")], &[
                    tag("span", &[], &[text("결과 InW 시작")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "output.resultWord"), ("step", "1")], &[]),
                ]),
                text("\n                        "),
                tag("label", &[("class", "vision-field"), ("data-vision-if", "words")], &[
                    tag("span", &[], &[text("명령 OutW 시작")]),
                    tag("input", &[("type", "number"), ("data-vision-field", "output.commandWord"), ("step", "1"), ("min", "-1")], &[]),
                ]),
                text("\n                        "),
                tag("label", &[("class", "vision-field"), ("data-vision-if", "words")], &[
                    tag("span", &[], &[text("형식")]),
                    tag("select", &[("data-vision-field", "output.dataType")], &[
                        tag("option", &[("value", "float32")], &[text("32비트 실수")]),
                        tag("option", &[("value", "int32")], &[text("32비트 정수 × 배율")]),
                    ]),
                ]),
                text("\n                    "),
            ]),
            text("\n                    "),
            tag("div", &[("class", "vision-actions")], &[
                tag("button", &[("type", "button"), ("class", "vision-button primary"), ("data-vision-action", "connect")], &[
                    tag("i", &[("class", "fa-solid fa-plug"), ("aria-hidden", "true")], &[]),
                    text(" "),
                    tag("span", &[], &[text("연결")]),
                ]),
            ]),
            text("\n                    "),
            tag("div", &[("class", "vision-info"), ("data-vision-out", "link")], &[]),
            text("\n                    "),
            tag("details", &[("class", "vision-details"), ("data-vision-if", "words")], &[
                text("\n                        "),
                tag("summary", &[("data-panel-drag-ignore", "")], &[text("주소 맵")]),
                text("\n                        "),
                tag("div", &[("data-vision-out", "map")], &[]),
                text("\n                    "),
            ]),
            text("\n                    "),
            tag("details", &[("class", "vision-details"), ("data-vision-if", "socket")], &[
                text("\n                        "),
                tag("summary", &[("data-panel-drag-ignore", "")], &[text("문자열 형식")]),
                text("\n                        "),
                tag("div", &[("class", "vision-grid three")], &[
                    text("\n                            "),
                    tag("label", &[("class", "vision-field wide")], &[
                        tag("span", &[], &[text("정상 응답")]),
                        tag("input", &[("type", "text"), ("data-type", "text"), ("data-vision-field", "output.template"), ("placeholder", "{dx},{dy},{dt}"), ("spellcheck", "false")], &[]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("NG 응답")]),
                        tag("input", &[("type", "text"), ("data-type", "text"), ("data-vision-field", "output.ngTemplate"), ("spellcheck", "false")], &[]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("트리거 명령")]),
                        tag("input", &[("type", "text"), ("data-type", "text"), ("data-vision-field", "output.triggerCommands"), ("spellcheck", "false")], &[]),
                    ]),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("소수 자리")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "output.decimals"), ("step", "1"), ("min", "0"), ("max", "6")], &[]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("종단 문자")]),
                        tag("select", &[("data-vision-field", "output.terminator")], &[
                            tag("option", &[("value", "none")], &[text("없음")]),
                            tag("option", &[("value", "cr")], &[text("CR")]),
                            tag("option", &[("value", "lf")], &[text("LF")]),
                            tag("option", &[("value", "crlf")], &[text("CR+LF")]),
                            tag("option", &[("value", "lab")], &[text("V (RobotLab)")]),
                        ]),
                    ]),
                    text("\n                        "),
                ]),
                text("\n                        "),
                tag("p", &[("class", "vision-help")], &[text("{dx} {dy} {dt} 보정값 · {x} {y} {t} 절대 위치 · {ok} 1/0 · {score} 점수 · {count} 순번")]),
                text("\n                    "),
            ]),
            text("\n                    "),
            tag("details", &[("class", "vision-details"), ("data-vision-if", "words")], &[
                text("\n                        "),
                tag("summary", &[("data-panel-drag-ignore", "")], &[text("고급 설정")]),
                text("\n                        "),
                tag("div", &[("class", "vision-grid three")], &[
                    text("\n                            "),
                    tag("label", &[("class", "vision-field wide")], &[
                        tag("span", &[], &[text("배치")]),
                        tag("select", &[("data-vision-field", "output.layout")], &[
                            tag("option", &[("value", "standard")], &[text("표준 (상태+핸드셰이크)")]),
                            tag("option", &[("value", "values")], &[text("값만 (X,Y,θ)")]),
                        ]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("배율")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "output.scale"), ("step", "1")], &[]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field")], &[
                        tag("span", &[], &[text("워드 순서")]),
                        tag("select", &[("data-vision-field", "output.wordOrder")], &[
                            tag("option", &[("value", "low-high")], &[text("하위 워드 먼저")]),
                            tag("option", &[("value", "high-low")], &[text("상위 워드 먼저")]),
                        ]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field"), ("data-vision-if", "external")], &[
                        tag("span", &[], &[text("주기")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "link.pollMs"), ("step", "5")], &[]),
                        tag("em", &[], &[text("ms")]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field"), ("data-vision-if", "eip")], &[
                        tag("span", &[], &[text("EIP 방식")]),
                        tag("select", &[("data-vision-field", "link.eipMode")], &[
                            tag("option", &[("value", "implicit")], &[text("Class 1 I/O")]),
                            tag("option", &[("value", "explicit")], &[text("명시적 메시지 (진단)")]),
                        ]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field"), ("data-vision-if", "eip")], &[
                        tag("span", &[], &[text("RPI")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "link.eipRpiMs"), ("step", "1")], &[]),
                        tag("em", &[], &[text("ms")]),
                    ]),
                    tag("label", &[("class", "vision-field"), ("data-vision-if", "eip")], &[
                        tag("span", &[], &[text("UDP 포트")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "link.eipUdpPort"), ("step", "1")], &[]),
                    ]),
                    text("\n                            "),
                    tag("label", &[("class", "vision-field"), ("data-vision-if", "eip")], &[
                        tag("span", &[], &[text("O→T 인스턴스")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "link.eipInputInstance"), ("step", "1")], &[]),
                    ]),
                    tag("label", &[("class", "vision-field"), ("data-vision-if", "eip")], &[
                        tag("span", &[], &[text("T→O 인스턴스")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "link.eipOutputInstance"), ("step", "1")], &[]),
                    ]),
                    tag("label", &[("class", "vision-field"), ("data-vision-if", "eip")], &[
                        tag("span", &[], &[text("구성 인스턴스")]),
                        tag("input", &[("type", "number"), ("data-vision-field", "link.eipConfigInstance"), ("step", "1")], &[]),
                    ]),
                    text("\n                        "),
                ]),
                text("\n                    "),
            ]),
            text("\n                    "),
            tag("details", &[("class", "vision-details"), ("open", "")], &[
                text("\n                        "),
                tag("summary", &[("data-panel-drag-ignore", "")], &[text("통신 로그")]),
                text("\n                        "),
                tag("div", &[("class", "vision-log"), ("data-vision-out", "log"), ("aria-live", "off"), ("data-panel-drag-ignore", "")], &[]),
                text("\n                        "),
                tag("div", &[("class", "vision-actions")], &[
                    tag("button", &[("type", "button"), ("class", "vision-button "), ("data-vision-action", "log-clear")], &[
                        tag("i", &[("class", "fa-solid fa-eraser"), ("aria-hidden", "true")], &[]),
                        text(" 지우기"),
                    ]),
                ]),
                text("\n                    "),
            ]),
            text("\n                    "),
            tag("details", &[("class", "vision-details"), ("data-vision-guide", "")], &[
                text("\n                        "),
                tag("summary", &[("data-panel-drag-ignore", "")], &[text("로봇 예제 프로그램")]),
                text("\n                        "),
                tag("div", &[("data-vision-out", "guide")], &[]),
                text("\n                    "),
            ]),
            text("\n                "),
        ]),
        text("\n            "),
    ]),
];
