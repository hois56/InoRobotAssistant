import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {normalizeAddress,clampWord} from '../../2_3DSimulation/olp-runtime.mjs';
import * as io from '../../2_3DSimulation/io-simulator-core.mjs';
const source=fs.readFileSync(new URL('../../2_3DSimulation/main.js',import.meta.url),'utf8');
const gold=JSON.parse(fs.readFileSync(new URL('../fixtures/olp-native-language-gold.json',import.meta.url),'utf8'));
function fixture() {
    const state={olp:{inputWords:new Uint16Array(128),outputWords:new Uint16Array(128),inputExtended:new Map(),outputExtended:new Map()},
        simulationIo:{inputs:[],outputs:[]}};
    const c=vm.createContext({state,...io,OLP_BIT_START:512,OLP_BIT_COUNT:2048,OLP_WORD_START:32,OLP_WORD_COUNT:128,
        normalizeOlpAddress:normalizeAddress,clampWord,getOlpProject:()=>({labels:{}}),renderOlpIoMonitor(){},
        getOlpRuntimeRobot:()=>null});
    c.readRobotProgramIoBit=(_robot,direction,bit)=>c.readOlpSimulatorBit(direction,bit);
    for(const name of ['getOlpGroupedBitStart','isOlpSimulatorBitAddress','getOlpSimulatorMemory','getOlpSimulatorExtended',
        'readOlpSimulatorBit','writeOlpSimulatorBit','canonicalOlpAddress','readOlpAddress','writeOlpAddress','decodeOlpInputSnapshot']) {
        const body=source.match(new RegExp(`function ${name}\\([^]*?\\n\\}(?=\\r?\\n|$)`));
        assert.ok(body,`Missing actual main adapter ${name}`);vm.runInContext(body[0],c);
    }
    return c;
}

test('program input writes match the original firmware software-window boundaries for bit, byte and word aliases',()=>{
    assert.equal(gold.ioProgramInputWrites.length,14);
    for(const row of gold.ioProgramInputWrites) {
        const c=fixture(),prefix=row.function.includes('INW')?'INW':row.function.includes('INB')?'INB':'IN';
        const address=`${prefix}[${row.index}]`;
        if(row.allowed) {
            c.writeOlpAddress(address,row.value);
            const bits=prefix==='IN'?1:prefix==='INB'?8:16;
            assert.equal(c.readOlpAddress(address),bits===1?Number(Boolean(row.value)):Number(row.value)&(2**bits-1));
        } else assert.throws(()=>c.writeOlpAddress(address,row.value),/Program input writes require/);
    }
});

test('software input writes preserve adjacent bits, share byte/word views and survive ordinary physical input snapshots',()=>{
    const c=fixture();c.writeOlpAddress('INW[800]',0x55aa);
    c.writeOlpAddress('IN[12800]',1);
    assert.equal(c.readOlpAddress('INB[1600]'),0xab);assert.equal(c.readOlpAddress('INB[1601]'),0x55);
    assert.equal(c.readOlpAddress('INW[800]'),0x55ab);
    const snapshot=c.decodeOlpInputSnapshot({words:[],mappedValues:{'INW[32]':7}});
    c.state.olp.inputWords=snapshot.words;c.state.olp.inputExtended=snapshot.extended;
    assert.equal(c.readOlpAddress('INW[800]'),0x55ab);assert.equal(c.readOlpAddress('INW[32]'),7);
    assert.throws(()=>c.writeOlpAddress('IN[617]',1),/Program input writes require/);
});
