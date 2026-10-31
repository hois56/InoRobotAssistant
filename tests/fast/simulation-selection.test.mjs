import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const handler = source.match(/function handleSceneModelClick\(event\) \{[\s\S]*?\n\}/)[0];

function click({ ctrlKey = false, placement = 'scene', moved = false, activeSketch = false, hit = true } = {}) {
  const attached = placement !== 'scene';
  const root = { userData: {} };
  const model = attached ? { userData: { placement, attachmentHost: root } } : root;
  const part = { name: 'nested part' };
  const calls = [];
  const state = {
    models: attached ? [root, model] : [root],
    sceneSelectionPointer: { moved },
    sketch: { active: activeSketch },
    zeroPointEdit: { active: false }
  };
  const context = vm.createContext({
    state,
    isSimulationSnapInteractionActive: () => false,
    getSceneModelAtPointer: () => hit ? { model, part } : null,
    selectSceneEntries: (event, entries) => calls.push({ model: entries[0][1], part: entries[0][0] === entries[0][1] ? null : entries[0][0] }),
    selectSceneModelPart: (selected, selectedPart) => calls.push({ model: selected, part: selectedPart }),
    selectSceneModel: selected => calls.push({ model: selected, part: null })
  });
  vm.runInContext(`${handler}\nhandleSceneModelClick({ button: 0, ctrlKey });`,
    Object.assign(context, { ctrlKey }));
  return { calls, root, model, part, state };
}

test('일반 클릭은 클릭한 부품을 선택한다', () => {
  const { calls, model, part } = click();
  assert.deepEqual(calls, [{ model, part }]);
});

test('Ctrl+클릭은 클릭한 부품을 다중 선택 대상으로 전달한다', () => {
  const { calls, model, part } = click({ ctrlKey: true });
  assert.deepEqual(calls, [{ model, part }]);
});

for (const [name, placement] of [['Tool', 'tcp'], ['암 로드', 'arm-load'], ['그립 오브젝트', 'grip-object']]) {
  test(`${name}의 Ctrl+클릭은 로봇 대신 해당 부착 모델의 부품을 선택한다`, () => {
    const { calls, model, root, part } = click({ ctrlKey: true, placement });
    assert.deepEqual(calls, [{ model, part }]);
    assert.notEqual(calls[0].model, root);
  });

  test(`${name}의 일반 클릭은 해당 부품만 선택한다`, () => {
    const { calls, model, part } = click({ placement });
    assert.deepEqual(calls, [{ model, part }]);
  });
}

test('Ctrl을 눌러도 뷰 드래그, 스케치, 빈 공간 클릭은 선택하지 않는다', () => {
  for (const options of [{ moved: true }, { activeSketch: true }, { hit: false }]) {
    const { calls, state } = click({ ctrlKey: true, ...options });
    assert.deepEqual(calls, []);
    assert.equal(state.sceneSelectionPointer, null);
  }
});
