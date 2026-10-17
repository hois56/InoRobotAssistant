import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCadAssemblyTree } from '../../2_3DSimulation/cad-assembly-tree.mjs';

test('CAD 조립 트리는 중간 조립품과 반복 배치의 계층을 유지한다', () => {
    const part = (path) => ({ userData: { cadAssemblyPath: path } });
    const a = { id: 'robot-1', name: 'Robot' }, b = { id: 'robot-2', name: 'Robot' };
    const arm = { id: 'arm-1', name: 'Arm' };
    const parts = [part([a]), part([a, arm]), part([a, arm]), part([b]), part([])];
    const tree = buildCadAssemblyTree(parts);
    assert.equal(tree.length, 3);
    assert.deepEqual(tree[0].members, parts.slice(0, 3));
    assert.equal(tree[0].children[1].name, 'Arm');
    assert.deepEqual(tree[0].children[1].members, parts.slice(1, 3));
    assert.deepEqual(tree[1].members, [parts[3]]);
    assert.equal(tree[2].part, parts[4]);
    // Filtering out user-grouped or deleted parts cannot leave empty folders.
    assert.deepEqual(buildCadAssemblyTree([parts[0]])[0].children, [{ part: parts[0] }]);
});
