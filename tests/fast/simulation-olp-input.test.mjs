import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { OlpRuntime, normalizeAddress, clampWord } from '../../2_3DSimulation/olp-runtime.mjs';
import * as io from '../../2_3DSimulation/io-simulator-core.mjs';
const source=fs.readFileSync(new URL('../../2_3DSimulation/main.js',import.meta.url),'utf8');
function functionSource(name) {const start=source.indexOf(`function ${name}(`);assert.ok(start>=0);return source.slice(start,source.indexOf('\nfunction ',start+1));}
function fixture(){
 const state={olp:{inputWords:new Uint16Array(128),inputExtended:new Map(),outputWords:new Uint16Array(128),outputExtended:new Map()},ioSimulator:{dirtyRanges:new Set()}};
 const context=vm.createContext({state,...io,OLP_BIT_START:512,OLP_BIT_COUNT:2048,OLP_WORD_START:32,OLP_WORD_COUNT:128,normalizeOlpAddress:normalizeAddress,clampWord,getOlpProject:()=>null});
 for(const name of ['getOlpGroupedBitStart','isOlpSimulatorBitAddress','getOlpSimulatorMemory','getOlpSimulatorExtended','readOlpSimulatorBit','canonicalOlpAddress','readOlpAddress','decodeOlpInputSnapshot','markIoSimulatorDirty']) vm.runInContext(functionSource(name),context);
 context.receive=(message)=>{const snapshot=context.decodeOlpInputSnapshot(message);state.olp.inputWords=snapshot.words;state.olp.inputExtended=snapshot.extended;};
 return context;
}
test('가상 버스 Word·Byte·Bit는 같은 입력 메모리를 사용하고 OFF도 반영한다',()=>{
 const c=fixture();c.receive({words:[65535],mappedValues:{'InW[37]':1234,'InB[76]':165,'In[0]':1}});
 assert.equal(c.readOlpAddress('InW[32]'),65535);assert.equal(c.readOlpAddress('InW[37]'),1234);assert.equal(c.readOlpAddress('InB[76]'),165);assert.equal(c.readOlpAddress('In[0]'),1);
 c.receive({words:[],mappedValues:{'InW[37]':0,'In[0]':0}});assert.equal(c.readOlpAddress('InW[37]'),0);assert.equal(c.readOlpAddress('In[0]'),0);assert.equal(c.readOlpAddress('InW[159]'),0);
});
test('전체 IO 갱신과 In[0] 단독 갱신은 구분한다',()=>{
 const c=fixture();c.markIoSimulatorDirty('IN',0);assert.equal(c.state.ioSimulator.dirtyAll,undefined);assert.equal(c.state.ioSimulator.dirtyRanges.size,1);
 c.markIoSimulatorDirty('IN');assert.equal(c.state.ioSimulator.dirtyAll,true);assert.equal(c.state.ioSimulator.dirtyRanges.size,0);
});
test('OLP Wait가 실제 수신 InW[37] 값으로 완료된다',async()=>{
 const c=fixture();const runtime=new OlpRuntime({programPath:'main.pro',programFiles:['main.pro'],programs:[{path:'main.pro',text:'Start\nWait InW[37] == 1234;\nEnd'}]},{readAddress:c.readOlpAddress});
 const run=runtime.run();await new Promise(r=>setTimeout(r,35));assert.equal(runtime.phase,'waiting');
 c.receive({words:Array(128).fill(0),mappedValues:{'InW[37]':1234}});await run;assert.equal(runtime.phase,'completed');
});
