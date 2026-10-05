import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProgramSpeedOverride,advanceMotionSpeedClock,normalizeMotionProject} from '../../2_3DSimulation/motion-program-core.mjs';
test('전체 속도는 1~100이고 이동 명령 속도에 독립적인 비율을 적용한다',()=>{
 assert.equal(normalizeProgramSpeedOverride(undefined),100);assert.equal(normalizeProgramSpeedOverride(0),1);assert.equal(normalizeProgramSpeedOverride(101),100);
 for(const [override,effective] of [[100,10],[10,1],[1,0.1]]){const clock=advanceMotionSpeedClock({},1000,override);assert.equal(10*clock.scale,effective);assert.equal(clock.elapsedMilliseconds,1000*override/100);}
 assert.equal(normalizeMotionProject({schemaVersion:1,robots:[]}).programSpeedOverride,100);assert.equal(normalizeMotionProject({schemaVersion:1,robots:[],programSpeedOverride:10}).programSpeedOverride,10);
});
test('실행 중 전체 속도를 바꿔도 이동 위치가 도약하지 않고 일시 정지 시간을 제외한다',()=>{
 const segment={};assert.equal(advanceMotionSpeedClock(segment,1000,100).elapsedMilliseconds,1000);
 assert.equal(advanceMotionSpeedClock(segment,2000,10).elapsedMilliseconds,1100);
 assert.equal(advanceMotionSpeedClock(segment,2000,1).elapsedMilliseconds,1100);
 assert.equal(advanceMotionSpeedClock(segment,3000,1).elapsedMilliseconds,1110);
});
