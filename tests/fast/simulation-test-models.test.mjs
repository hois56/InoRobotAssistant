import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { TEST_MODEL_CATALOG, getTestModelSelection, getTestModelSelectionForRobot, getEducationalModelSelection } from '../../2_3DSimulation/test-model-catalog.mjs';
import { getStepTessellationParameters } from '../../2_3DSimulation/step-tessellation-parameters.mjs';
import { getTestModelTreePreset } from '../../2_3DSimulation/test-model-tree-presets.mjs';
import { normalizeConveyorDimensions, resizeConveyorContent } from '../../2_3DSimulation/conveyor-model.mjs';

test('테스트 STEP의 사전 변환 메시가 현재 원본과 자동 품질 설정에 일치한다', () => {
    for (const asset of TEST_MODEL_CATALOG.filter(item => /\.st(?:e)?p$/i.test(item.file))) {
        const url = new URL(`../../2_3DSimulation/test-assets/${asset.file}`, import.meta.url);
        const source = readFileSync(url);
        const mesh = JSON.parse(gunzipSync(readFileSync(new URL(`${url.href}.mesh.json.gz`))));
        assert.equal(mesh.sourceSha256, createHash('sha256').update(source).digest('hex'), asset.id);
        assert.deepEqual(mesh.parameters, {
            linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', ...getStepTessellationParameters(source.length)
        }, asset.id);
        assert.ok(mesh.meshes.length > 0 && mesh.meshes.every(entry => entry.partId && entry.positions && entry.indices), asset.id);
    }
});

test('컨베이어 치수는 선택된 모델에만 적용하고 유효 범위를 검증한다', () => {
    const dimensions = { length: 1000, width: 400, height: 700 };
    assert.deepEqual(normalizeConveyorDimensions(), { length: 500, width: 200, height: 200 });
    assert.deepEqual(getTestModelSelection({ conveyor: 2 }, dimensions)[0].dimensions, dimensions);
    assert.doesNotThrow(() => getTestModelSelection({ base: 1 }, { width: 0 }));
    for (const value of [{ length: 0 }, { width: 159 }, { height: 119 }, { height: 10001 }, { length: 'invalid' }, { width: '' }])
        assert.throws(() => getTestModelSelection({ conveyor: 1 }, value));
});

test('실제 컨베이어 STEP의 전체 치수를 바꾸면서 모터와 롤러 지름·벨트 곡률을 보존한다', async () => {
    const three = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
    const THREE = await import(`data:text/javascript;base64,${Buffer.from(three).toString('base64')}`);
    const require = createRequire(import.meta.url);
    const occt = await require('../../3_ToolSelector/vendor/occt/occt-import-js.js')();
    const parsed = occt.ReadStepFile(readFileSync(new URL('../../2_3DSimulation/test-assets/3D_model/Conveyor.step', import.meta.url)), null);
    assert.equal(parsed.success, true);
    for (const dimensions of [{ length: 500, width: 200, height: 200 }, { length: 1000, width: 400, height: 700 }, { length: 300, width: 160, height: 120 }]) {
        const root = new THREE.Group();
        for (const mesh of parsed.meshes) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
            const object = new THREE.Mesh(geometry);
            object.name = mesh.name;
            root.add(object);
        }
        resizeConveyorContent(root, dimensions);
        const size = object => new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).toArray();
        assert.deepEqual(size(root), Object.values(dimensions));
        assert.deepEqual(size(root.children.find(m => m.name === 'Drive_motor')), [52, 28, 36]);
        assert.equal(size(root.children.find(m => m.name === 'Roller_220_D54'))[2], 54);
        assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
        const belt = root.children[0].geometry.attributes.position;
        const halfStraight = dimensions.length / 2 - 30;
        // All vertices on the curved right end remain on one of the original 27/30 mm radii.
        for (let i = 0; i < belt.count; i++) if (belt.getX(i) > halfStraight + .01) {
            const radius = Math.hypot(belt.getX(i) - halfStraight, belt.getZ(i) - (dimensions.height - 40));
            assert.ok(Math.abs(radius - 30) < .001 || Math.abs(radius - 27) < .001, String(radius));
        }
    }
});

test('교육용 TCP는 Tool 1의 Z ±100을 적용하고 기존 안내용 TCP와 다른 Tool을 보존한다', async () => {
    const three = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
    const THREE = await import(`data:text/javascript;base64,${Buffer.from(three).toString('base64')}`);
    const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
    for (const robotType of ['articulated', 'scara']) {
        const profiles = [0, 1, 2].map(() => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }));
        profiles[2].position.set(7, 8, 9);
        const robot = { userData: { manifest: { robotType }, tcpFrame: { position: new THREE.Vector3() } } };
        const context = vm.createContext({
            state: { activeArticulatedModel: robot },
            ensureRobotTcpProfiles: () => profiles,
            syncActiveTcpFrame: model => model.userData.tcpFrame.position.copy(profiles[model.userData.activeTcpProfileIndex].position),
            captureSceneSnapshot: () => ({}),
            renderJogControls() {}, commitAllPendingHistories() {}, clearTcpProfileLive() {},
            captureCurrentTcpTarget() {}, refreshTcpProfileUi() {}, setTcpProfileStatus() {}, recordHistory() {}
        });
        vm.runInContext(source.match(/function applyTestTcpProfile\([^]*?\n\}/)[0], context);
        context.applyTestTcpProfile(robot);
        assert.deepEqual(robot.userData.tcpFrame.position.toArray(), [200, 0, robotType === 'scara' ? -33 : 33]);
        context.applyTestTcpProfile(robot, [0, 0, robotType === 'scara' ? -100 : 100]);
        assert.equal(robot.userData.activeTcpProfileIndex, 1);
        assert.deepEqual(robot.userData.tcpFrame.position.toArray(), [0, 0, robotType === 'scara' ? -100 : 100]);
        assert.deepEqual(profiles[0].position.toArray(), [0, 0, 0]);
        assert.deepEqual(profiles[2].position.toArray(), [7, 8, 9]);
    }
});

test('평면 트레이 STEP은 연속된 240 mm 작업면과 기존 트레이 높이를 유지한다', async () => {
    const asset = getTestModelSelection({ 'flat-tray': 1 })[0].asset;
    const require = createRequire(import.meta.url);
    const occt = await require('../../3_ToolSelector/vendor/occt/occt-import-js.js')();
    const result = occt.ReadStepFile(readFileSync(new URL(`../../2_3DSimulation/test-assets/${asset.file}`, import.meta.url)), null);
    assert.equal(result.success, true);
    assert.equal(result.meshes.length, 15);
    const bounds = mesh => [0, 1, 2].map(axis => {
        const values = mesh.attributes.position.array.filter((_, index) => index % 3 === axis);
        return [Math.min(...values), Math.max(...values)];
    });
    const preset = getTestModelTreePreset(asset.file, result.meshes.length);
    assert.deepEqual(preset.groups.find(group => group.name === 'Tray').parts, [0]);
    assert.deepEqual(bounds(result.meshes[0]), [[-120, 120], [-120, 120], [164, 176]]);
    assert.ok(result.meshes.slice(1).every(mesh => bounds(mesh)[2][1] <= 164));
    assert.equal(Math.min(...result.meshes.map(mesh => bounds(mesh)[2][0])), 0);
    // A single convex, eight-corner top face has no pockets or dividers.
    const top = result.meshes[0].brep_faces.filter(face => {
        const indices = result.meshes[0].index.array.slice(face.first * 3, (face.last + 1) * 3);
        return indices.every(index => result.meshes[0].attributes.position.array[index * 3 + 2] === 176);
    });
    assert.equal(top.length, 1);
    assert.equal(top[0].last - top[0].first + 1, 6);
});

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
    assert.equal(TEST_MODEL_CATALOG.filter(asset => asset.category === 'model').length, 10);
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
    assert.deepEqual(scara.filter(item => item.asset.category === 'model').slice(0, -1), normal);
    assert.equal(scara.at(-1).asset.file, '3D_model/SCARA_height_base.step');
    assert.deepEqual(scara.at(-1).position, [120, -30, 0]);
    assert.equal(getEducationalModelSelection({ robotType: 'articulated' }).length, 16);
    assert.equal(getTestModelTreePreset('SCARA_height_base.step', 7).groups.length, 3);
});

test('교육용 구성은 배치된 로봇에 Single VAC Tool을 추가하고 SCARA 어댑터를 재사용한다', () => {
    assert.equal(getEducationalModelSelection().filter(item => item.asset.category === 'tool').length, 0);
    for (const robotType of ['articulated', 'scara']) {
        const selection = getEducationalModelSelection({ robotType });
        const tool = selection.find(item => item.asset.id === 'single-vac');
        assert.equal(tool?.quantity, 1);
        assert.equal(tool?.asset.category, 'tool');
        const prepared = getTestModelSelectionForRobot(selection, robotType);
        assert.equal(prepared.filter(item => item.asset.id === 'scara-adapter').length, robotType === 'scara' ? 1 : 0);
        assert.deepEqual(getTestModelSelectionForRobot(selection, robotType, true), selection);
    }
});

test('교육용 구성은 평면 트레이를 X650 Y350에 추가하고 기존 모듈과 오브젝트를 보존한다', () => {
    const selection = getEducationalModelSelection();
    assert.deepEqual(selection.slice(0, 6).map(item => [item.asset.id, item.position]), [
        ['conveyor', [100, 350, 0]], ['square-tray', [650, -350, 0]],
        ['vision', [650, 0, 0]], ['square-tray', [-50, -350, 0]],
        ['base', [0, 0, 0]], ['flat-tray', [650, 350, 0]]
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
        assert.deepEqual(selection.find(item => item.asset.id === 'flat-tray').position, [650,350,0]);
        for (const item of selection.filter(item => !['base','flat-tray'].includes(item.asset.id))) {
            assert.ok(Math.hypot(item.position[0]-20,item.position[1]+30) < reach, robotModel);
        }
    }
    const original = getEducationalModelSelection();
    for (const robotModel of ['IR-S10-80Z20','IR-S25-80Z42','IR-R7H-90','IR-R10H-120','IR-TS4-35Z15',undefined]) {
        assert.deepEqual(getEducationalModelSelection({robotModel,robotPosition:[20,-30,0]}),original,robotModel);
    }
});
