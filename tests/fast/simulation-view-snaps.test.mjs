import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const names = ['getSimulationSnapViewport', 'pickSimulationSnapFaceAtPointer'];
const functions = names.map(name => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0] || '').join('\n');
function fixture() {
  const main = { name: 'main', updateMatrixWorld() {} };
  const view = { name: 'view', updateMatrixWorld() {} };
  const canvas = { getBoundingClientRect: () => ({ left: 400, top: 200, width: 200, height: 100 }) };
  const cell = { camera: view, canvas, element: {}, controls: {} };
  const state = { camera: main, renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }) } },
    viewWindow: { root: { isConnected: true, classList: { contains: () => false } }, cells: new Map([[0, cell]]) },
    snapVisibilityRaycaster: { setFromCamera(pointer, camera) { this.pointer = pointer; this.camera = camera; }, intersectObjects: () => [] } };
  const context = vm.createContext({ state, el: { canvasContainer: {} }, THREE: { Vector2: class { constructor(x, y) { this.x = x; this.y = y; } } },
    getSimulationSnapScope: () => 'scene', getAllSimulationSnapMeshes: () => [{}], isSimulationSnapRobotMesh: () => false });
  vm.runInContext(functions, context);
  return { context, state, canvas, view, main, cell };
}
test('고정 뷰 클릭은 해당 뷰의 카메라와 캔버스 좌표로 면을 선택한다', () => {
  const { context, state, canvas, view } = fixture();
  context.pickSimulationSnapFaceAtPointer({ currentTarget: canvas, target: canvas, clientX: 500, clientY: 250 });
  assert.equal(state.snapVisibilityRaycaster.camera, view);
  assert.equal(state.snapVisibilityRaycaster.pointer.x, 0);
  assert.equal(state.snapVisibilityRaycaster.pointer.y, 0);
});
test('메인 캔버스 클릭은 이전 고정 뷰에 영향을 받지 않는다', () => {
  const { context, state, cell, main } = fixture();
  state.snapViewport = cell;
  context.pickSimulationSnapFaceAtPointer({ target: state.renderer.domElement, clientX: 500, clientY: 400 });
  assert.equal(state.snapVisibilityRaycaster.camera, main);
  assert.equal(state.snapVisibilityRaycaster.pointer.x, 0);
});

test('CAD 호버 스냅은 뷰 스냅 표시를 메인 화면으로 되돌린다', () => {
  const marker = { parentElement: {}, style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null };
  const container = { clientWidth: 800, appendChild(child) { child.parentElement = this; } };
  const context = vm.createContext({ state: { cad2d: { originEdit: {} } }, el: { snapMarker: marker, canvasContainer: container }, isSimulationSnapPicking: () => false, snapTypeInfo: () => ({}) });
  vm.runInContext(source.match(/function showCadSnapMarker\([^]*?\n\}/)[0], context);
  context.showCadSnapMarker({ screenX: 50, screenY: 50, type: 'endpoint' });
  assert.equal(marker.parentElement, container);
});
