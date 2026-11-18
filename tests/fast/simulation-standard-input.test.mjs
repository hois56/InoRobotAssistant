import test from 'node:test';import assert from 'node:assert/strict';
import {StandardInputClient} from '../../2_3DSimulation/standard-input-client.mjs';
const controller=()=>({wanted:true,controllerKind:'virtual',source:'bridge',ipAddress:'127.0.0.1',status:'streaming',socket:{readyState:1},socketGeneration:1});
const zeros=()=>Object.fromEntries(Array.from({length:65},(_,i)=>[i,0]));
function fixture(){let now=10;const sent=[];const c=controller(),client=new StandardInputClient({now:()=>now,send:(message,target)=>{sent.push({message,target});return true;}});const inputs=zeros();const reply=()=>{const m=sent.at(-1).message;if(m.type==='setStandardInput')inputs[m.address]=m.value;client.message({type:'standardInputResult',requestId:m.requestId,address:m.address,success:true,inputs:{...inputs}},c);};return{client,c,sent,inputs,reply,advance:n=>{now+=n;}};}
test('all65 bits queue independently during a poll, return actual snapshots and turn OFF',()=>{
 const f=fixture();f.client.tick(f.c);assert.equal(f.sent.length,1);assert.equal(f.sent[0].message.type,'readStandardInputs');
 for(let i=0;i<=64;i++)assert.equal(f.client.request(f.c,1,i),true);
 assert.equal(f.client.view(f.c,64).value,null);f.reply();
 for(let i=0;i<=64;i++){assert.equal(f.sent.at(-1).message.address,i);assert.equal(f.client.view(f.c,i).value,0);f.reply();assert.equal(f.client.view(f.c,i).value,1);}
 assert.equal(Object.values(f.client.view(f.c).values).filter(Boolean).length,65);
 for(let i=0;i<=64;i++)f.client.request(f.c,0,i);
 for(let i=0;i<=64;i++){assert.equal(f.sent.at(-1).message.address,i);f.reply();assert.equal(f.client.view(f.c,i).value,0);}
 assert.deepEqual(f.client.view(f.c).values,zeros());assert.equal(f.sent.filter(x=>x.message.type==='setStandardInput').length,130);
 for(const address of [-1,65,512,1.5])assert.equal(f.client.request(f.c,1,address),false);
 assert.equal(f.client.request(f.c,2,64),false);
});
test('65th bit is independent of bit0 and partial snapshots are never treated as OFF',()=>{
 const f=fixture();f.client.tick(f.c);f.inputs[64]=1;f.reply();assert.equal(f.client.view(f.c,0).value,0);assert.equal(f.client.view(f.c,64).value,1);
 f.advance(300);f.client.tick(f.c);const m=f.sent.at(-1).message;const partial={...f.inputs};delete partial[64];f.client.message({type:'standardInputResult',requestId:m.requestId,address:0,success:true,inputs:partial},f.c);
 assert.equal(f.client.view(f.c,0).value,null);assert.equal(f.client.view(f.c,64).value,null);
});
test('reconnect and timeout cancel writes, and controller sessions do not share replies',()=>{
 const f=fixture();f.client.tick(f.c);f.reply();f.client.request(f.c,1,63);f.client.request(f.c,1,64);const old=f.sent.at(-1).message;
 const other=controller();f.client.message({type:'standardInputResult',requestId:old.requestId,address:63,success:true,inputs:f.inputs},other);assert.equal(f.client.view(other).values,null);
 f.c.socketGeneration++;f.client.tick(f.c);assert.equal(f.sent.at(-1).message.type,'readStandardInputs');f.client.message({type:'standardInputResult',requestId:old.requestId,address:63,success:true,inputs:f.inputs},f.c);assert.equal(f.client.view(f.c).values,null);
 f.reply();f.client.request(f.c,1,64);f.client.request(f.c,1,0);const count=f.sent.length;f.advance(1600);f.client.tick(f.c);assert.equal(f.sent.length,count);assert.equal(f.client.view(f.c).values,null);assert.equal(f.client.state(f.c).queue.size,0);
 f.c.wanted=false;f.client.tick(f.c);assert.equal(f.client.request(f.c,1,0),false);
 for(const changes of [{controllerKind:'real'},{source:'trace'},{ipAddress:'192.168.1.1'}])assert.equal(f.client.request(Object.assign(controller(),changes),1,64),false);
});
