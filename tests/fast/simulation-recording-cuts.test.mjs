import test from 'node:test';
import assert from 'node:assert/strict';
import { RecordingCuts, timecode } from '../../2_3DSimulation/recording-cuts.mjs';

test('컷 편집은 이미 이어 붙인 구간을 가로질러 다시 자를 수 있다', () => {
    const cuts = new RecordingCuts(90);
    cuts.cut(10, 20, false);
    cuts.cut(25, 35, false);
    cuts.cut(5, 30, true);
    assert.deepEqual(cuts.segments, [[5, 10], [20, 35], [45, 50]]);
    assert.equal(cuts.length, 25);
    for (let frame = 0; frame < cuts.length; frame++) assert.equal(cuts.outputFrame(cuts.sourceFrame(frame)), frame);
    cuts.cut(0, 25, false);
    assert.equal(cuts.length, 25);
    cuts.undo();
    assert.equal(cuts.length, 70);
});

test('스톱워치 시작점과 경과 시간은 삭제된 프레임을 제외하고 되돌리면 복원된다', () => {
    const cuts = new RecordingCuts(120);
    cuts.setStopwatch(60);
    cuts.cut(10, 30, false);
    assert.equal(cuts.stopwatch, 40);
    cuts.cut(30, 50, false);
    assert.equal(cuts.stopwatch, 30);
    assert.equal(cuts.sourceFrame(30), 70);
    assert.equal(timecode(60 - cuts.stopwatch), '00:00.50');
    cuts.cut(0, 30, true);
    assert.equal(cuts.stopwatch, null);
    cuts.undo();
    assert.equal(cuts.stopwatch, 30);
    cuts.setStopwatch(null);
    cuts.undo();
    assert.equal(cuts.stopwatch, 30);
    assert.equal(timecode(3601), '01:00.01');
});

test('분할은 프레임을 보존하고, 라이브 녹화의 새 프레임은 삭제와 되돌리기 후에도 남는다', () => {
    const cuts = new RecordingCuts(30);
    assert.equal(cuts.split(0), false);
    assert.equal(cuts.split(30), false);
    assert.equal(cuts.split(10), true);
    assert.equal(cuts.split(10), false);
    assert.equal(cuts.split(20), true);
    assert.deepEqual(cuts.pieceAt(10), { index: 1, start: 10, end: 20 });
    const saved = cuts.snapshot();
    cuts.cut(20, 30, false);
    cuts.extend(34);
    assert.deepEqual(cuts.segments, [[0, 10], [10, 20], [30, 34]]);
    cuts.undo();
    assert.deepEqual(cuts.segments, [[0, 10], [10, 20], [20, 34]]);
    cuts.undo();
    assert.deepEqual(cuts.segments, [[0, 10], [10, 34]]);
    assert.equal(saved.length, 30);
    assert.equal(saved.segments.length, 3);
});

test('스톱워치는 종료 프레임에서 멈추거나 숨고 컷과 녹화 재개 후에도 종료점을 지킨다', () => {
    const cuts = new RecordingCuts(90);
    cuts.setStopwatch(15);
    cuts.setStopwatchEnd(10);
    assert.equal(cuts.stopwatchEnd, null);
    cuts.setStopwatchEnd(60);
    assert.deepEqual([14, 15, 59, 60, 89].map(n => cuts.elapsed(n)), [null, 0, 44, 45, 45]);
    cuts.setHideAfterEnd(true);
    assert.equal(cuts.elapsed(60), null);
    cuts.cut(30, 45, false);
    assert.equal(cuts.stopwatchEnd, 45);
    cuts.setStopwatchEnd(cuts.length);
    cuts.extend(120);
    assert.equal(cuts.stopwatchEnd, 75);
    cuts.setStopwatch(80);
    assert.equal(cuts.stopwatchEnd, null);
    cuts.undo();
    assert.equal(cuts.stopwatchEnd, 75);
});

test('클립 경계는 인접 클립을 넘지 않고 한 프레임까지 줄이거나 잘라낸 부분을 복구한다', () => {
    const cuts = new RecordingCuts(60);
    cuts.split(20);
    cuts.split(40);
    assert.equal(cuts.trimEdge(1, 'start', 0), false);
    assert.equal(cuts.trimEdge(1, 'end', 60), false);
    assert.equal(cuts.history.length, 2);
    cuts.trimEdge(1, 'start', 24);
    cuts.trimEdge(1, 'end', 2);
    assert.deepEqual(cuts.segments, [[0, 20], [24, 25], [40, 60]]);
    cuts.trimEdge(1, 'end', 41);
    cuts.trimEdge(1, 'start', 18);
    assert.deepEqual(cuts.segments, [[0, 20], [20, 40], [40, 60]]);
    cuts.undo();
    assert.deepEqual(cuts.segments[1], [24, 40]);
});

test('트리밍은 스톱워치와 편집본에 반영되고, 되돌려도 라이브 녹화가 늘어난 분량을 보존한다', () => {
    const cuts = new RecordingCuts(60);
    cuts.setStopwatch(12);
    cuts.setStopwatchEnd(48);
    const saved = cuts.snapshot();
    cuts.trimEdge(0, 'start', 8);
    cuts.trimEdge(0, 'end', 50);
    assert.deepEqual([cuts.length, cuts.stopwatch, cuts.stopwatchEnd], [42, 4, 40]);
    cuts.extend(72);
    assert.deepEqual(cuts.segments, [[8, 50], [60, 72]]);
    cuts.undo();
    assert.deepEqual(cuts.segments, [[8, 72]]);
    cuts.undo();
    assert.deepEqual(cuts.segments, [[0, 72]]);
    assert.deepEqual(saved.segments, [[0, 60]]);
    assert.deepEqual([saved.stopwatch, saved.stopwatchEnd], [12, 48]);
});
