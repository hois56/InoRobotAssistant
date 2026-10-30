import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const threeSource = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
const THREE = await import(`data:text/javascript;base64,${Buffer.from(threeSource).toString('base64')}`);

function fixture() {
  const names = ['getSimulationSnapModelOriginCandidates', 'findSceneModelAncestor',
    'isSimulationSnapReferenceCandidate', 'getSimulationSnapWorldIndexMeshes'];
  const functions = names.map(name => {
    const body = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0];
    assert.ok(body, `${name} must exist`);
    return body;
  }).join('\n');
  const model = new THREE.Group();
  model.userData.uploaded = true;
  model.position.set(120, -60, 35);
  model.rotation.z = Math.PI / 3;
  const part = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40));
  part.position.set(80, 50, 20);
  model.add(part);
  const other = new THREE.Group();
  other.userData.uploaded = true;
  const state = { models: [model, other], placement: { active: true }, snapCandidates: [] };
  const context = vm.createContext({ THREE, state,
    isSimulationSnapModel: model => Boolean(model?.userData?.uploaded),
    isModelTreeVisible: model => model.visible });
  vm.runInContext(functions, context);
  return { context, state, model, part, other };
}

test('이동 중 선택한 면의 모델 영점은 부품 좌표와 구분하고 모델마다 한 번만 추가한다', () => {
  const { context, model, part, other } = fixture();
  const candidates = context.getSimulationSnapModelOriginCandidates('placement', [{ mesh: part }, { mesh: part }]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].type, 'model-origin');
  assert.equal(candidates[0].mesh, model);
  assert.deepEqual(candidates[0].localPoint.toArray(), [0, 0, 0]);
  model.updateMatrixWorld(true);
  assert.deepEqual(candidates[0].localPoint.clone().applyMatrix4(model.matrixWorld).toArray(), [120, -60, 35]);
  assert.equal(context.getSimulationSnapModelOriginCandidates('placement', [{ mesh: part }, { mesh: other }]).length, 2);
});

test('면 선택 전과 다른 스냅 모드에는 모델 영점을 추가하지 않는다', () => {
  const { context, state, part, model } = fixture();
  assert.equal(context.getSimulationSnapModelOriginCandidates('placement', []).length, 0);
  for (const scope of ['scene', 'zero', 'measurement', 'tool', 'interference']) {
    assert.equal(context.getSimulationSnapModelOriginCandidates(scope, [{ mesh: part }]).length, 0, scope);
  }
  model.visible = false;
  assert.equal(context.getSimulationSnapModelOriginCandidates('placement', [{ mesh: part }]).length, 0);
  model.visible = true;
  state.placement.active = false;
  assert.equal(context.getSimulationSnapModelOriginCandidates('placement', [{ mesh: part }]).length, 0);
});

test('모델 영점은 가려져도 표시하는 기준점이며 이동 시 좌표 인덱스를 갱신한다', () => {
  const { context, state, model, part } = fixture();
  const [candidate] = context.getSimulationSnapModelOriginCandidates('placement', [{ mesh: part }]);
  assert.equal(context.isSimulationSnapReferenceCandidate(candidate), true);
  state.snapCandidates = [candidate];
  assert.deepEqual(Array.from(context.getSimulationSnapWorldIndexMeshes([part])), [part, model]);
});
