import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { TEST_MODEL_CATALOG, getTestModelSelection, getTestModelSelectionForRobot, getEducationalModelSelection } from '../../2_3DSimulation/test-model-catalog.mjs';
import { getTestModelTreePreset } from '../../2_3DSimulation/test-model-tree-presets.mjs';

test('테스트 모델 그룹은 다른 부품 수에 적용하지 않고 복사별 편집을 분리한다',()=>{
    const first=getTestModelTreePreset('Conveyor.step',41),second=getTestModelTreePreset('C:/models/CONVEYOR.STEP',41);
    assert.equal(first.groups.length,4);
    first.groups[0].parts.length=0;first.groups[0].name='수정';
    assert.equal(second.groups[0].parts.length,29);assert.equal(second.groups[0].name,'Base');
    assert.equal(getTestModelTreePreset('Conveyor.step',40),null);
    assert.equal(getTestModelTreePreset('Test_Equipment_CAD.step',41),null);
    assert.equal(getTestModelTreePreset('Square_object_40x40x40.step',1).folder,'Object');
});

test('테스트 모델과 툴 카탈로그는 실제 파일을 구분하고 수량을 검증한다', () => {
    assert.equal(TEST_MODEL_CATALOG.filter(asset => asset.category === 'model').length, 9);
    assert.equal(TEST_MODEL_CATALOG.filter(asset => asset.category === 'tool').length, 6);
    for (const asset of TEST_MODEL_CATALOG) {
        assert.ok(existsSync(new URL(`../../2_3DSimulation/test-assets/${asset.file}`, import.meta.url)), asset.file);
        assert.ok(existsSync(new URL(`../../2_3DSimulation/test-assets/previews/${asset.id}.png`, import.meta.url)), asset.image);
    }
    assert.deepEqual(getTestModelSelection({}), []);
    assert.equal(getTestModelSelection({ 'square-object': '3' })[0].quantity, 3);
    for (const quantity of [-1, 21, 1.5, '', 'invalid']) {
        if (quantity === '') continue;
        assert.throws(() => getTestModelSelection({ base: quantity }));
    }
    assert.throws(() => getTestModelSelection(Object.fromEntries(TEST_MODEL_CATALOG.map(asset => [asset.id, 20]))));
});

test('SCARA 테스트 툴에만 새 어댑터를 한 번 추가하고 명시적 선택과 기존 장착은 중복하지 않는다', () => {
    const tools = getTestModelSelection({ 'single-vac': 2, 'teaching-pointer': 1 });
    const scara = getTestModelSelectionForRobot(tools, 'scara');
    assert.equal(scara[0].asset.file, 'Tool/Scara_adapter.step');
    assert.equal(scara[0].quantity, 1);
    assert.deepEqual(scara.slice(1), tools);
    assert.deepEqual(getTestModelSelectionForRobot(tools, 'articulated'), tools);
    assert.deepEqual(getTestModelSelectionForRobot(tools, 'scara', true), tools);
    const explicit = getTestModelSelection({ 'scara-adapter': 1, 'single-vac': 2 });
    assert.deepEqual(getTestModelSelectionForRobot(explicit, 'scara'), explicit);
    const models = getTestModelSelection({ base: 1 });
    assert.deepEqual(getTestModelSelectionForRobot(models, 'scara'), models);
    assert.equal(getTestModelTreePreset('Scara_adapter.step', 6).groups.length, 2);
});

test('SCARA 교육용 구성에만 로봇 XY 위치의 높이 200 mm 베이스를 추가한다', () => {
    const normal = getEducationalModelSelection();
    const scara = getEducationalModelSelection({ robotType: 'scara', robotPosition: [120, -30, 200] });
    assert.deepEqual(scara.slice(0, -1), normal);
    assert.equal(scara.at(-1).asset.file, '3D_model/SCARA_height_base.step');
    assert.deepEqual(scara.at(-1).position, [120, -30, 0]);
    assert.equal(getEducationalModelSelection({ robotType: 'articulated' }).length, 14);
    assert.equal(getTestModelTreePreset('SCARA_height_base.step', 7).groups.length, 3);
});

test('교육용 구성은 스테이지 버큠 없이 베이스와 모듈 4개, 트레이 오브젝트 9개를 생성한다', () => {
    const selection = getEducationalModelSelection();
    assert.deepEqual(selection.slice(0, 5).map(item => [item.asset.id, item.position]), [
        ['conveyor', [100, 350, 0]], ['square-tray', [650, -350, 0]],
        ['vision', [650, 0, 0]], ['square-tray', [-50, -350, 0]],
        ['base', [0, 0, 0]]
    ]);
    assert.ok(selection.every(item => item.asset.id !== 'stage-vac'));
    assert.equal(getTestModelSelection({'stage-vac': 1})[0].asset.id, 'stage-vac');
    const objects = selection.filter(item => item.asset.id === 'square-object');
    assert.equal(objects.length, 9);
    assert.equal(new Set(objects.map(item => item.position.join(','))).size, 9);
    assert.ok(objects.every(item => item.position[2] === 176));
});

test('지정한 짧은 리치 모델만 교육용 XY 간격을 줄이고 트레이 슬롯과 베이스를 보존한다', () => {
    const cases = [['IR-S4-40Z15',400], ['IR-S7-50Z20',500], ['IR-S7-60Z20',600],
        ['IR-S7-70Z20',700], ['IR-S10-60Z20',600], ['IR-S10-70Z20',700],
        ['IR-R4-56',560], ['IR-R4H-54',540], ['IR-R7H-70',700]];
    for (const [robotModel, reach] of cases) {
        const selection = getEducationalModelSelection({ robotModel, robotPosition: [20,-30,200] });
        const tray = selection[1].position;
        assert.ok(tray[0] - 20 < 650 && Math.abs(tray[1] + 30) < 350, robotModel);
        assert.deepEqual(selection.find(item => item.asset.id === 'base').position, [0,0,0]);
        const objects = selection.filter(item => item.asset.id === 'square-object');
        assert.deepEqual(objects.map(item => item.position.map((v,i) => v-tray[i])),
            [-58,0,58].flatMap(x => [-58,0,58].map(y => [x,y,176])));
        for (const item of selection.filter(item => item.asset.id !== 'base')) {
            assert.ok(Math.hypot(item.position[0]-20,item.position[1]+30) < reach, robotModel);
        }
    }
    const original = getEducationalModelSelection();
    for (const robotModel of ['IR-S10-80Z20','IR-S25-80Z42','IR-R7H-90','IR-R10H-120','IR-TS4-35Z15',undefined]) {
        assert.deepEqual(getEducationalModelSelection({robotModel,robotPosition:[20,-30,0]}),original,robotModel);
    }
});
