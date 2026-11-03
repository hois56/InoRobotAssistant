import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../2_3DSimulation/main.js', import.meta.url), 'utf8');
const functions = ['getSimulationSnapRequiredType', 'getSimulationSnapRobotSpecialCandidates']
  .map(name => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0] || '').join('\n');

for (const mode of ['placement', 'measurement', 'zeroPointEdit', 'tcpSnapMode']) {
  for (const type of ['auto', 'multi-point-center', 'vertex', 'robot-tcp', 'robot-base-center']) {
    test(`${mode}: 면 선택 후에도 명시한 로봇 기준점은 선택할 수 있다 (${type})`, () => {
      const state = { placement: {}, measurement: {}, zeroPointEdit: {}, tcpSnapMode: false };
      if (mode === 'tcpSnapMode') {
        state.tcpSnapMode = true;
        state.tcpSnapType = type;
      } else {
        state[mode] = { active: true, snapMode: true, snapType: type };
      }
      const tcp = { type: 'robot-tcp' };
      const base = { type: 'robot-base-center' };
      const scopes = [];
      const context = vm.createContext({ state,
        getSimulationSnapRobotTcpCandidates: scope => { scopes.push(scope); return [tcp]; },
        getSimulationSnapRobotBodyCenterCandidates: scope => { scopes.push(scope); return [base]; },
        getSimulationSnapRobotMountingHoleCandidates: () => [{ type: 'hole-center' }],
        getSimulationSnapSceneOriginCandidates: () => [{ type: 'scene-origin' }]
      });
      vm.runInContext(functions, context);
      const scope = mode === 'zeroPointEdit' ? 'zero' : mode === 'tcpSnapMode' ? 'tool' : mode;
      const candidates = context.getSimulationSnapRobotSpecialCandidates(scope, [{ key: 'selected-face' }]);
      const expected = type === 'robot-tcp' ? [tcp] : type === 'robot-base-center' ? [base] : [];
      assert.deepEqual(Array.from(candidates), expected);
      assert.deepEqual(scopes, expected.length ? [scope] : []);
    });
  }
}
