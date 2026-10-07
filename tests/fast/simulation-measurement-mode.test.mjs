import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { calculateMeasurementResult } from '../../2_3DSimulation/measurement-core.mjs';

const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const handlersEnd = source.indexOf('    el.btnMeasurementRemeasure?.addEventListener');
const handlers = source.slice(source.lastIndexOf('    el.measurementDisplayInputs.forEach((input) => {', handlersEnd), handlersEnd);

function fixture(points) {
  const callbacks = {};
  const state = { measurement: { displayMode: 'diagonal', points,
    result: points[1] ? calculateMeasurementResult(points[0].worldPoint, points[1].worldPoint) : null } };
  const context = vm.createContext({ state, calculateMeasurementResult,
    el: { measurementDisplayInputs: ['diagonal', 'orthogonal', 'robot-position'].map(value => ({ value,
      addEventListener: (_, callback) => { callbacks[value] = callback; } })) },
    getSelectedRobotModel: () => ({ userData: { motionInstanceId: 'robot-1' } }),
    calculateRobotPositionMeasurement: p => ({ x: p.worldPoint.x, y: p.worldPoint.y, z: p.worldPoint.z }),
    setMeasurementPanelStatus: message => { state.measurement.statusMessage = message; },
    updateMeasurementUi() {}, updateMeasurementOverlay() {}, requestRender() {} });
  vm.runInContext(handlers, context);
  return { state, change: mode => callbacks[mode]() };
}
const p1 = { worldPoint: { x: 1, y: 2, z: 3 } };
const p2 = { worldPoint: { x: 31, y: -38, z: 123 } };

test('P1·P2 측정 후 직선과 직각 치수를 반복 전환해도 두 점과 결과를 유지한다', () => {
  const { state, change } = fixture([p1, p2]);
  for (const mode of ['orthogonal', 'diagonal', 'orthogonal']) {
    change(mode);
    assert.equal(state.measurement.points[0], p1);
    assert.equal(state.measurement.points[1], p2);
    assert.deepEqual(state.measurement.result, calculateMeasurementResult(p1.worldPoint, p2.worldPoint));
    assert.equal(state.measurement.statusMessage, '측정 완료');
  }
});
test('P1만 찍거나 선택점이 없으면 모드 전환 후에도 다음 점을 기다린다', () => {
  for (const points of [[p1, null], [null, null]]) {
    const { state, change } = fixture(points);
    change('orthogonal');
    assert.equal(state.measurement.points[0], points[0]);
    assert.equal(state.measurement.points[1], null);
    assert.equal(state.measurement.result, null);
    assert.equal(state.measurement.statusMessage, points[0] ? 'P2 선택' : 'P1 선택');
  }
});
test('로봇 위치 모드는 기존대로 P1을 사용하고 P2를 해제한다', () => {
  const { state, change } = fixture([p1, p2]);
  change('robot-position');
  assert.equal(state.measurement.points[0], p1);
  assert.equal(state.measurement.points[1], null);
  assert.equal(state.measurement.result.x, p1.worldPoint.x);
  assert.equal(state.measurement.robotPositionRobotId, 'robot-1');
  change('diagonal');
  assert.equal(state.measurement.result, null);
  assert.equal(state.measurement.statusMessage, 'P2 선택');
});
