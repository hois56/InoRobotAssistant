import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {OlpRuntime,createOlpGlobalMemory,composeOlpOffset} from '../../2_3DSimulation/olp-runtime.mjs';

const native=JSON.parse(fs.readFileSync(new URL('../fixtures/olp-native-language-gold.json',import.meta.url),'utf8'));
const project=(programs=[{path:'main.pro',text:'Start\nEnd'}])=>({programPath:programs[0].path,programFiles:programs.map(p=>p.path),programs});

test('string conversion, replacement and referenced numeric arrays match original firmware leaf functions',async()=>{
    const r=new OlpRuntime(project());r.currentFilePath='main.pro';
    for(const row of native.strToR){await r.executeLine(`R[0]=StrToR(${JSON.stringify(row.input)});`);assert.equal(r.readSymbol('R[0]'),row.result);}
    for(const row of native.strReplace){await r.executeLine(`Str[0]=StrRePlace(${[row.input,row.old,row.new].map(JSON.stringify).join(',')});`);assert.equal(r.readSymbol('Str[0]'),row.result);}
    for(const row of native.strGetData){
        for(let i=0;i<6;i++)r.writeSymbol(`LD[${i}]`,99-i);
        await r.executeLine(`LB[0]=StrGetData(${JSON.stringify(row.input)},${JSON.stringify(row.delimiter)},LD[0]);`);
        assert.equal(r.readSymbol('LB[0]'),row.resultCount);
        assert.deepEqual(Array.from({length:6},(_,i)=>r.readSymbol(`LD[${i}]`)),row.values);
    }
});

test('word Int views consume two low-first words and Clear Out uses the original range semantics',async()=>{
    for(const row of native.ioUnion){
        const r=new OlpRuntime({...project(),labels:{xwOffset:'InW[54]'}},{readAddress:address=>row.wordsLowFirst[address.index-54]??0});
        assert.equal(r.readSymbol('xwOffset.Int'),row.int32);assert.equal(r.readSymbol('xwOffset'),row.bareWord);
    }
    for(const row of native.clearOut){
        const writes=[];const r=new OlpRuntime(project(),{writeAddress:(address,value)=>writes.push({index:address.index,value})});
        if(row.errors)await assert.rejects(r.executeLine(`Clear Out[${row.start}],${row.count};`),/Clear count/);
        else{await r.executeLine(`Clear Out[${row.start}],${row.count};`);assert.deepEqual(writes,row.writes);}
    }
});

test('Offset composes native orientations and singular branches while register addition remains component-wise',()=>{
    const gold=JSON.parse(fs.readFileSync(new URL('../fixtures/olp-native-offset-gold.json',import.meta.url),'utf8'));
    const r=new OlpRuntime(project());
    for(const row of gold.cases) {
        const frame=row.function.includes('Tool')?'TOOL':'WOBJ';
        const result=composeOlpOffset(row.base,row.offset,frame);
        result.forEach((value,index)=>assert.ok(Math.abs(value-row.result[index])<1e-8,`${row.function}/${index}: ${value} != ${row.result[index]}`));
        r.writeSymbol('P[1]',row.base);r.writeSymbol('PR[1]',row.offset);
        assert.deepEqual(r.readPositionExpression(`Offset(P[1],PR[1],${frame})`),result);
        assert.deepEqual(r.readPositionExpression('P[1]+PR[1]'),row.base.map((value,i)=>value+row.offset[i]));
    }
});

test('global multidimensional tables are shared while module banks and typed function locals remain isolated',async()=>{
    const p=project([
        {path:'main.pro',text:'Global Int shared[2][3];\nFunc Int entry(Int n)\nInt local=12.9;\nLD[0]=12.5;\nother.entry();\nshared[1][2]=n;\nReturn local;\nEndFunc'},
        {path:'other.pro',text:'Func entry()\nInt local=99;\nLD[0]=25;\nEndFunc'}
    ]);
    const memory=createOlpGlobalMemory(),a=new OlpRuntime(p,{globalMemory:memory}),b=new OlpRuntime(p,{globalMemory:memory});
    await a.initializeDeclarations();await b.initializeDeclarations();
    assert.equal(await a.executeFunction('main.pro','entry',[7]),12);
    a.currentFilePath='main.pro';assert.equal(a.readSymbol('LD[0]'),native.localBank.modelAReread);
    a.currentFilePath='other.pro';assert.equal(a.readSymbol('LD[0]'),native.localBank.modelBStored);
    b.currentFilePath='main.pro';assert.equal(b.readSymbol('LD[0]'),0);assert.equal(b.readSymbol('shared[1][2]'),7);
    assert.equal(a.readSymbol('local'),0,'Returned function locals must not escape into module/global memory.');
    a.currentFilePath='main.pro';await a.executeLine('Int positions[3]={100,110,111};');
    assert.equal(a.readSymbol('positions[1]'),110);await a.executeLine('positions[1]=3.9;');assert.equal(a.readSymbol('positions[1]'),3);
});

test('LoadPoints preserves named point aliases across recipes and SavePoints commits teaching edits',async()=>{
    const original={kind:'point',sourceSymbol:'P',index:100,name:'P1_Safe',values:[10,0,0,0,0,0],armParameters:[1,0,0,0]};
    const recipe={...original,name:'T1_W0',values:[99,2,3,4,5,6]};
    const p={...project(),pointFiles:[{path:'Data/P.pts',records:[original]},{path:'Data/P01.pts',records:[recipe]}],pointRecords:[original,recipe],
        files:new Map([['Data/P01.pts',{text:'P[100] = 99,2,3,4,5,6;1,0,0,0;0,0,0,0,0,0;Notes="T1_W0";'}]])};
    let saved;const r=new OlpRuntime(p,{savePoints:payload=>{saved=payload;}});
    r.writeSymbol('P[100]',[-500,0,0,0,0,0]);
    r.writeSymbol('PR[5]',[12,0,0,0,0,0]);
    await r.executeLine('LoadPoints("P01.pts");');assert.equal(r.getMotionTarget('P1_Safe').values[0],99);
    assert.equal(r.readPositionSymbol('PR[5]')[0],12,'Loading a recipe must preserve transient offset registers.');
    const child=new OlpRuntime(p,{globalMemory:r.globalMemory});assert.equal(child.activePointFile,'Data/P01.pts');
    await r.executeLine('P[100]=Offset(P[100],(2,0,0,0,0,0));');await r.executeLine('SavePoints;');
    assert.equal(recipe.values[0],101);
    const serialized=saved.text.match(/P\[100\]\s*=\s*([^;]+)/)[1].split(',').map(Number);
    serialized.forEach((value,i)=>assert.ok(Math.abs(value-[101,2,3,4,5,6][i])<1e-10));
    assert.match(saved.text,/Notes="T1_W0";/);
});

test('native calls work inside arithmetic and unknown calls cannot silently return zero',async()=>{
    const r=new OlpRuntime(project(),{getTorque:axis=>axis===1?-2.5:0});
    await r.executeLine('Double t=Abs(GetTorque(1)*3);');assert.equal(r.readSymbol('t'),7.5);
    await r.executeLine('Double a=1+Abs(-2);');assert.equal(r.readSymbol('a'),3);
    await assert.rejects(r.executeLine('Double b=1+UnknownFirmwareFunction(2);'),/Unknown.*function/);
    const missing=new OlpRuntime(project());await assert.rejects(missing.executeLine('Double t=GetTorque(1);'),/torque provider/);
});

test('generated socket commands preserve result codes, timeout branches and quoted CSV buffers',async()=>{
    const calls=[];const socket={
        open:async config=>{calls.push(['open',config]);return 0;},close:channel=>calls.push(['close',channel]),
        send:(channel,data)=>calls.push(['send',channel,data]),receive:async(channel,time)=>{calls.push(['receive',channel,time]);return false;},
        getState:()=>1,getBuffer:()=>'-2.5,30,1.2',clear:channel=>calls.push(['clear',channel])
    };
    const r=new OlpRuntime(project(),{socket});
    await r.executeLine('Open Socket("192.168.1.2",5001,2,Single,LB[0]);');assert.equal(r.readSymbol('LB[0]'),0);
    await r.executeLine('Send Port[2],"Shot,1";');
    assert.deepEqual(await r.executeLine('Get Port[2],T[100],Goto L[800];'),{type:'goto',target:'L[800]'});
    await r.executeLine('Str[0]=GetPortbuf(0,100,2);');assert.equal(r.readSymbol('Str[0]'),'-2.5,30,1.2');
    await r.executeLine('Close Socket,2;');await r.executeLine('Clear Port[2];');
    assert.deepEqual(calls[1],['send',2,'Shot,1']);assert.deepEqual(calls[2],['receive',2,100]);
});

test('Delay has a real fallback and Stop cancels an adapter delay without waiting for its full timeout',async()=>{
    const r=new OlpRuntime(project());let start=performance.now();await r.executeLine('Delay T[0.025];');assert.ok(performance.now()-start>=20);
    const controller=new OlpRuntime(project(),{delay:(_ms,_runtime,{signal})=>new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}))});
    const pending=controller.executeLine('Delay T[100];');controller.stop();await assert.rejects(pending,/OLP stopped/);
});
