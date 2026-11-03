import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { TOOL_COUNT, normalizeToolLoad, buildToolProgram, buildFrameProgram, combineToolLoads } from '../../2_3DSimulation/tool-data-core.mjs';
import * as toolData from '../../2_3DSimulation/tool-data-core.mjs';

for (const kind of ['tool', 'wobj']) test(`${kind} dat 내보내기는 컨트롤러 샘플의 형식과 검증 코드를 그대로 재현한다`, () => {
  const sample = readFileSync(new URL(`../fixtures/simulation-${kind}-params.dat`, import.meta.url), 'utf8');
  const records = JSON.parse(sample.split('EndFileInfo\r\n')[1]);
  const robotName = sample.match(/RobotName="([^"]+)"/)[1];
  const date = new Date(sample.match(/Time="([^"]+)"/)[1].replace(' ', 'T'));
  const frames = records.map(record => {
    const data = (record.TFrame || record.UFrame).Data;
    return { position: data.slice(0, 3), rotation: data.slice(3).reverse(), load: record.TLoad };
  });
  const build = kind === 'tool' ? toolData.buildToolParamFile : toolData.buildWobjParamFile;
  assert.equal(build(frames, { robotName, date }), sample);
});

test('dat 파일은 전체 16개 번호와 ABC 축·작은 관성 값을 보존하고 0번은 기본값으로 내보낸다', () => {
  const slots = Array.from({ length: TOOL_COUNT }, () => ({ position: [1, 2, 3], rotation: [10, 20, 30] }));
  slots[15].load = { mass: 7, cog: [0.1, -0.2, 0], inertia: [0.000000123, 0.02, 0] };
  const tool = JSON.parse(toolData.buildToolParamFile(slots).split('EndFileInfo\r\n')[1]);
  assert.equal(tool.length, 16);
  assert.deepEqual(tool[0].TFrame.Data, [0, 0, 0, 0, 0, 0]);
  assert.equal(tool[0].TLoad.mass, 0);
  assert.deepEqual(tool[15].TFrame.Data, [1, 2, 3, 30, 20, 10]);
  assert.deepEqual(tool[15].TLoad, { ...slots[15].load, orient: [0, 0, 0] });
  const wobj = JSON.parse(toolData.buildWobjParamFile(slots).split('EndFileInfo\r\n')[1]);
  assert.equal(wobj.length, 16);
  assert.deepEqual(wobj[0].UFrame.Data, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(wobj[15].UFrame.Data, [1, 2, 3, 30, 20, 10]);
  assert.deepEqual(wobj[15].OFrame.Data, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(wobj[15].UFMec, Array(18).fill(0));
  assert.equal(wobj[15].RobHold, false);
  assert.equal(wobj[15].UFFix, true);
  assert.throws(() => toolData.buildToolParamFile([{}, { position: [Infinity, 0, 0] }]), /Invalid robot data/);
});

test('로봇 코드에는 정확한 Tool 번호, ABC 축과 작은 관성 값이 들어간다', () => {
  const code = buildToolProgram(15, [1, -2, 3.125], [10, 20, 30], { mass: 7, cog: [0.1, -0.2, 0], inertia: [0.000000123, 0.02, 0] });
  assert.match(code, /Tool\[15\]\.TFrame\.A = 30;/);
  assert.match(code, /Tool\[15\]\.TFrame\.C = 10;/);
  assert.match(code, /Tool\[15\]\.TLoad\.Inertia\[0\] = 0\.000000123;/);
  assert.equal(code.split('\n').filter(Boolean).length, 13);
  assert.equal(buildFrameProgram('Wobj[1].UFrame', [0, -0, 0], [0, 0, 90]).split('\n').length, 6);
  assert.throws(() => buildToolProgram(16, [], [], {}), /index/);
});

test('여러 모델의 부하는 질량 가중 무게중심과 평행축 정리로 합산한다', () => {
  const zero = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const load = combineToolLoads([{ mass: 1, cog: [-100, 0, 0], inertia: zero }, { mass: 3, cog: [100, 0, 0], inertia: zero }]);
  assert.deepEqual(load.cog, [50, 0, 0]);
  assert.equal(load.mass, 4);
  assert.ok(Math.abs(load.inertia[1] - 0.03) < 1e-12);
  assert.ok(Math.abs(load.inertia[2] - 0.03) < 1e-12);
  assert.equal(load.inertia[0], 0);
});

test('이전 TCP 1~3은 Tool 1~3으로 한 번만 이전되고 Tool 0은 항상 기본값이다', async () => {
  const three = readFileSync(new URL('../../3_ToolSelector/vendor/three/three.module.js', import.meta.url), 'utf8');
  const THREE = await import(`data:text/javascript;base64,${Buffer.from(three).toString('base64')}`);
  const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
  const c = vm.createContext({ THREE, TCP_PROFILE_COUNT: TOOL_COUNT, normalizeToolLoad });
  for (const name of ['createDefaultTcpProfile', 'normalizeTcpProfile', 'ensureRobotTcpProfiles', 'serializeRobotTcpProfiles']) {
    vm.runInContext(source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0], c);
  }
  const robot = { userData: { activeTcpProfileIndex: 2, tcpProfiles: [10, 20, 30].map(x => ({ position: [x, 2, 3], quaternion: [0, 0, 0, 1] })) } };
  c.ensureRobotTcpProfiles(robot);
  assert.equal(robot.userData.activeTcpProfileIndex, 3);
  assert.equal(robot.userData.tcpProfiles[3].position.x, 30);
  robot.userData.tcpProfiles[0].position.x = 999;
  robot.userData.tcpProfiles[15].load = { mass: 7, cog: [1, 2, 3], inertia: [0.1, 0.2, 0.3] };
  const saved = c.serializeRobotTcpProfiles(robot);
  assert.equal(saved.length, 16);
  assert.equal(saved[0].position[0], 0);
  assert.equal(saved[15].load.mass, 7);
  c.ensureRobotTcpProfiles(robot);
  assert.equal(robot.userData.activeTcpProfileIndex, 3);
  saved[15].load.cog[0] = 999;
  assert.equal(robot.userData.tcpProfiles[15].load.cog[0], 1);
});
