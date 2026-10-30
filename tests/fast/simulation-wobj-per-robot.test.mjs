import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as core from '../../2_3DSimulation/workobject-core.mjs';

const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const names = ['getWorkObjectEditorRobot', 'refreshWorkObjectTargetRobotOptions', 'renderWorkObjectPanel',
  'selectWorkObject', 'applyWorkObjectEditor', 'ensureRobotWorkObjects'];

function element() {
  return { value: '', textContent: '', disabled: false, dataset: {}, classList: { toggle() {} },
    replaceChildren(...children) { this.children = children; }, setAttribute() {} };
}

function fixture() {
  const robots = [1, 2].map(number => ({ name: `Robot ${number}`, userData: {
    motionInstanceId: `robot-${number}`, motionDisplayName: `Robot ${number}`,
    workObjects: core.normalizeWorkObjects(), activeWorkObjectIndex: number
  } }));
  robots[0].userData.workObjects[1].position = [100, 200, 300];
  robots[1].userData.workObjects[1].position = [700, 800, 900];
  const state = { workObjectEditor: { robotId: 'robot-1', index: 1 } };
  const el = { workObjectTargetRobot: element(), workObjectList: element(),
    workObjectInputs: Object.fromEntries(['x', 'y', 'z', 'rx', 'ry', 'rz'].map(key => [key, element()])) };
  const context = vm.createContext({ ...core, state, el,
    document: { activeElement: null, createElement: element },
    getArticulatedRobots: () => robots,
    getWorkObjectRobotById: id => robots.find(robot => robot.userData.motionInstanceId === id),
    getJogTargetRobot: () => robots[0],
    getWorkObjectRotationDegrees: workObject => ({ rx: workObject.rotation[0], ry: workObject.rotation[1], rz: workObject.rotation[2] }),
    uiText: value => value, isMotionActive: () => false, captureSceneSnapshot: () => ({}),
    sceneSnapshotsEqual: () => false, recordHistory() {}, updatePanelLauncher() {},
    syncWorkObjectVisuals() {}, updateTcpPresentation() {}, updateJogWorkObjectUi() {},
    updateInterferenceZoneVisuals() {}, scheduleMotionProjectSave() {}, evaluateInterferenceZones() {},
    commitAllPendingHistories() {}, setWorkObjectStatus() {},
    readWorkObjectEditorValues: () => ({ name: 'Robot 2 frame', position: [4, 5, 6], rotation: [0, 0, 90], visible: true }) });
  for (const name of names) vm.runInContext(source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0], context);
  return { context, robots, state, el };
}

test('로봇 전환은 해당 로봇의 Wobj 번호와 편집 대상을 함께 불러온다', () => {
  const { context, robots, state, el } = fixture();
  context.renderWorkObjectPanel(robots[1]);
  assert.equal(robots[0].userData.activeWorkObjectIndex, 1);
  assert.equal(robots[1].userData.activeWorkObjectIndex, 2);
  assert.equal(state.workObjectEditor.robotId, 'robot-2');
  assert.equal(state.workObjectEditor.index, 2);
  assert.equal(el.workObjectTargetRobot.value, 'robot-2');
});

test('언어 변경과 패널 갱신은 로봇별 활성 Wobj 번호를 덮어쓰지 않는다', () => {
  const { context, robots, state } = fixture();
  state.workObjectEditor.index = 9;
  context.renderWorkObjectPanel();
  assert.equal(robots[0].userData.activeWorkObjectIndex, 1);
  assert.equal(state.workObjectEditor.index, 1);
});

test('좌표를 입력하던 중 다른 로봇을 선택해도 이전 로봇의 입력값을 남기지 않는다', () => {
  const { context, robots, el } = fixture();
  el.workObjectInputs.x.value = '1234';
  context.document.activeElement = el.workObjectInputs.x;
  context.renderWorkObjectPanel(robots[1]);
  assert.equal(el.workObjectInputs.x.value, '0');
});

test('같은 번호의 Wobj를 편집해도 다른 로봇의 원점과 활성 번호를 보존한다', () => {
  const { context, robots } = fixture();
  context.renderWorkObjectPanel(robots[1]);
  context.selectWorkObject(1);
  context.applyWorkObjectEditor();
  assert.deepEqual(robots[0].userData.workObjects[1].position, [100, 200, 300]);
  assert.deepEqual(robots[1].userData.workObjects[1].position, [4, 5, 6]);
  assert.equal(robots[0].userData.workObjects[1].name, 'Wobj 1');
  assert.equal(robots[1].userData.workObjects[1].name, 'Robot 2 frame');
});
