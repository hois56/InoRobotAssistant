import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const functions = ['shouldDisplayModelTreeParts', 'modelTreeHasChildren'].map(name => (
    source.match(new RegExp(`function ${name}\\(model\\) \\{[\\s\\S]*?\\n\\}`))[0]
)).join('\n');

test('파츠가 하나인 모든 모델은 하위 파츠와 펼치기 버튼을 표시하지 않는다', () => {
    const context = vm.createContext({
        state: { models: [] },
        getImportedModelParts: model => model.parts,
        isPrimitiveShapeModel: () => false,
        isSketchFeatureModel: () => false
    });
    vm.runInContext(functions, context);
    for (const placement of ['scene', 'tcp', 'arm-load', 'grip-object']) {
        const model = { parts: [{}], userData: { placement } };
        assert.equal(context.shouldDisplayModelTreeParts(model), false, placement);
        assert.equal(context.modelTreeHasChildren(model), false, placement);
        model.parts.push({});
        assert.equal(context.shouldDisplayModelTreeParts(model), true, placement);
        assert.equal(context.modelTreeHasChildren(model), true, placement);
    }
    const host = { parts: [{}], userData: {} };
    context.state.models.push({ userData: { attachmentHost: host } });
    assert.equal(context.modelTreeHasChildren(host), true, '부착 모델의 상위 항목은 유지한다');
});

test('모델 폴더 복원은 중복·삭제된 모델·부착 모델을 제외하고 기존 프로젝트를 허용한다', () => {
    const first = { id: 'a', userData: {} }, second = { id: 'b', userData: {} };
    const tool = { id: 'tool', userData: { attachmentHost: first } };
    const context = vm.createContext({ state: { models: [first, second, tool] }, ensureWorkspaceModelId: model => model.id });
    const names = ['isGroupableModel', 'normalizeModelGroups'];
    vm.runInContext(names.map(name => source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0]).join('\n'), context);
    assert.equal(JSON.stringify(context.normalizeModelGroups(undefined)), '[]');
    assert.equal(JSON.stringify(context.normalizeModelGroups([
        { name: ' 첫 그룹 ', modelIds: ['a', 'a', 'missing', 'tool'], collapsed: true },
        { name: '둘째 그룹', modelIds: ['a', 'b'] },
        { name: '빈 그룹', modelIds: [] }, null, { name: '잘못된 그룹', modelIds: 'a' }
    ])), JSON.stringify([
        { name: '첫 그룹', modelIds: ['a'], collapsed: true },
        { name: '둘째 그룹', modelIds: ['b'], collapsed: false }
    ]));
    assert.equal(tool.userData.attachmentHost, first);
});


test('모델 트리 표시 이름은 파일 확장자만 숨기고 순번과 점이 들어간 이름을 보존한다', () => {
    const context = vm.createContext({});
    const helper = source.match(/function modelTreeDisplayName\(name\) \{[\s\S]*?\n\}/);
    assert.ok(helper, '모델 트리 표시 이름 함수가 필요합니다.');
    vm.runInContext(helper[0], context);
    for (const [input, expected] of [['Conveyor.step','Conveyor'],['제품.v2.STP','제품.v2'],['Tool.stl #2','Tool #2'],['부품.obj (3)','부품 (3)'],['장면.glb','장면'],['도면.dxf','도면'],['패드.01','패드.01'],['모델','모델']]) assert.equal(context.modelTreeDisplayName(input), expected);
});


test('임시로 잡힌 오브젝트의 그룹 소속과 폴더 상태를 유지하고 놓으면 같은 순서로 표시한다', () => {
 const robot={id:'robot',userData:{}},held={id:'held',userData:{attachmentHost:robot,placement:'grip-object'}},peer={id:'peer',userData:{}};
 const context=vm.createContext({state:{models:[robot,held,peer]},ensureWorkspaceModelId:model=>model.id});
 vm.runInContext(['isGroupableModel','normalizeModelGroups','getModelGroupMembers'].map(name=>source.match(new RegExp('function '+name+'\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0]).join('\n'),context);
 const group={name:'제품',modelIds:['held','peer'],collapsed:true,treeOrderId:'products'};
 const normalized=context.normalizeModelGroups([group]);assert.equal(JSON.stringify(normalized),JSON.stringify([group]));
 assert.deepEqual(Array.from(context.getModelGroupMembers(normalized[0]),model=>model.id),['peer']);
 delete held.userData.attachmentHost;held.userData.placement='scene';
 assert.deepEqual(Array.from(context.getModelGroupMembers(context.normalizeModelGroups(normalized)[0]),model=>model.id),['held','peer']);
 context.state.models.splice(context.state.models.indexOf(held),1);
 assert.deepEqual(Array.from(context.normalizeModelGroups(normalized)[0].modelIds),['peer']);
});
