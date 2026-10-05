import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const names = ['findSceneModelAncestor', 'isSceneModelObjectPickable', 'isSimulationSnapModel',
  'isModelTreeVisible', 'getModelTreeAttachedModels', 'getSimulationSnapModels',
  'getAllSimulationSnapMeshes', 'isSimulationSnapRobotModel', 'isSimulationSnapRobotMesh',
  'getSimulationSnapViewport', 'pickSimulationSnapRobotAtPointer'];
const functions = names.map(name => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0]).join('\n');

function fixture() {
  function node(userData = {}, isMesh = false) {
    return { userData, visible: true, isMesh, children: [], parent: null,
      geometry: isMesh ? { getAttribute: () => ({}) } : null,
      traverse(callback) { callback(this); this.children.forEach(child => child.traverse(callback)); },
      add(child) { this.children.push(child); child.parent = this; } };
  }
  const robot = node({ tcpFrame: {} });
  const robotMesh = node({}, true);
  const tool = node({ uploaded: true, placement: 'tcp', attachmentHost: robot });
  const toolPart = node();
  const toolMesh = node({}, true);
  robot.add(robotMesh);
  robot.add(tool);
  tool.add(toolPart);
  toolPart.add(toolMesh);
  const state = { models: [robot, tool], zeroPointEdit: {},
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } },
    camera: { updateMatrixWorld() {} },
    snapVisibilityRaycaster: { setFromCamera() {}, intersectObjects: () => [{ object: toolMesh }] } };
  const context = vm.createContext({ state, el: {}, THREE: { Vector2: class {} },
    getArticulatedRobots: () => [robot], isPrimitiveShapeModel: () => false,
    isSketchFeatureModel: () => false, isCad2dModel: () => false });
  vm.runInContext(functions, context);
  return { context, state, robot, robotMesh, tool, toolPart, toolMesh };
}

test('부착된 Tool 면은 로봇 바디 스냅으로 가로채지 않는다', () => {
  const { context, state, robot, robotMesh, toolMesh } = fixture();
  assert.equal(context.isSimulationSnapRobotMesh(toolMesh), false);
  assert.equal(context.pickSimulationSnapRobotAtPointer({ clientX: 50, clientY: 50 }), null);
  state.snapVisibilityRaycaster.intersectObjects = () => [{ object: robotMesh }];
  assert.equal(context.pickSimulationSnapRobotAtPointer({ clientX: 50, clientY: 50 }), robot);
});

test('치수·이동·간섭 스냅은 부착 Tool 메시를 중복 없이 포함한다', () => {
  const { context, toolMesh } = fixture();
  for (const scope of ['measurement', 'placement', 'scene', 'interference', 'tool']) {
    assert.equal(context.getAllSimulationSnapMeshes(scope).filter(mesh => mesh === toolMesh).length, 1, scope);
  }
});

test('로봇 바디가 숨겨져도 표시 중인 Tool은 이동 스냅 대상으로 남는다', () => {
  const { context, robot, robotMesh, toolMesh } = fixture();
  robot.userData.modelTreeHidden = true;
  robotMesh.visible = false;
  assert.ok(context.getAllSimulationSnapMeshes('placement').includes(toolMesh));
});

test('숨긴 Tool 또는 부품은 치수 스냅에서 제외한다', () => {
  const { context, tool, toolPart, toolMesh } = fixture();
  tool.visible = false;
  assert.ok(!context.getAllSimulationSnapMeshes('measurement').includes(toolMesh));
  tool.visible = true;
  toolPart.visible = false;
  assert.ok(!context.getAllSimulationSnapMeshes('measurement').includes(toolMesh));
  assert.ok(context.getAllSimulationSnapMeshes('measurement', { includeHidden: true }).includes(toolMesh));
});
