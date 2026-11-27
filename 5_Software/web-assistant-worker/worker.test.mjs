import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import servoCatalog from './servo-evidence.mjs';
const corpusModule=new URL('./public-corpus.mjs',import.meta.url);
const source=(await readFile(new URL('./worker.mjs',import.meta.url),'utf8')).replace("'./public-corpus.mjs'",JSON.stringify(corpusModule.href)).replace("'./live-public.mjs'",JSON.stringify(new URL('./live-public.mjs',import.meta.url).href)).replace("'./lead-time-catalog.mjs'",JSON.stringify(new URL('./lead-time-catalog.mjs',import.meta.url).href)).replace("import { DurableObject } from 'cloudflare:workers';",'class DurableObject { constructor(ctx) {this.ctx=ctx;} }').replace("import servoCatalog from './servo-evidence.mjs';",'const servoCatalog='+JSON.stringify(servoCatalog)+';');
const {default:worker,evidenceFor,ChatBudget}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const q=[
  '4키로 스카라 도면','4 kg SCARA drawing','4公斤 SCARA 图纸','SCARA 4 kg bản vẽ','4 kg SCARA çizim','4 кг скара чертёж'
];
const locale=['ko','en','zh-CN','vi','tr','ru'];
const model={model:'IR-S4-40Z15S-INT',kind:'SCARA',payload:4,reach:400,url:'https://inovancerobot.com/1_RobotModelSelect/models/IR-S4-40Z15S-INT/'};
const db={prepare(sql){return{bind(...v){return{all:async()=>{
  if(sql.includes('robot_models')) {assert.equal(v[1],4);assert.equal(v[2],'SCARA');return {results:[model]};}
  if(sql.includes('FROM cad'))return {results:[{model:model.model,label:'STEP',url:'https://inovancerobot.com/cad.stp'}]};
  return {results:[{title:'forged',url:'https://outside.invalid/'}]};
}}}}}};
test('six language forms ground the same 4 kg SCARA records',async()=>{
 for(const question of q){
   const e=await evidenceFor(db,question);
   assert.equal(e[0].title,model.model);assert.ok(e.some(i=>i.title==='STEP'));assert.ok(e.every(i=>i.url.startsWith('https://inovancerobot.com/')));
 }
 assert.equal((await evidenceFor(db,'리치가 얼마야?',q[0]))[0].title,model.model);
});
const env={OPENAI_API_KEY:'mock-only',PUBLIC_KNOWLEDGE:db,CHAT_BUDGET:{getByName(){return {fetch:async()=>new Response(null,{status:204})}}},VISITOR_RATE:{limit:async()=>({success:true})}};
const req=(origin,question,lang)=>new Request('https://example.test/v1/chat',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.4'},body:JSON.stringify({question,lang})});
test('six locales call only Luna, strip unknown citation IDs, and do not store provider responses',async()=>{
 const real=globalThis.fetch;let calls=0;
 try{
   globalThis.fetch=async(url,init)=>{
      assert.equal(url,'https://api.openai.com/v1/responses');
      const p=JSON.parse(init.body);
      assert.equal(p.model,'gpt-6-luna');assert.equal(p.store,false);assert.equal(p.reasoning.effort,'none');
      assert.equal(JSON.parse(p.input).locale,locale[calls++]);
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({claims:[{text:'Answer',sourceId:'s1',excerpt:JSON.parse(p.input).sources[0].body.slice(0,64)},{text:'Bogus',sourceId:'s999',excerpt:'This source does not exist'}],retryQuery:''})}]}]});
   };
   for(let i=0;i<q.length;i++){const r=await worker.fetch(req('https://inovancerobot.com',q[i],locale[i]),env);assert.equal(r.status,200);assert.equal((await r.json()).sources.length,1);}
   assert.equal((await worker.fetch(req('https://outside.invalid',q[0],'ko'),env)).status,403);
   assert.equal((await worker.fetch(req('https://inovancerobot.com',q[0],'ko'),{...env,OPENAI_API_KEY:''})).status,503);
   assert.equal((await worker.fetch(req('https://inovancerobot.com',q[0],'ko'),{...env,CHAT_BUDGET:{getByName:()=>({fetch:async()=>new Response(null,{status:429})})}})).status,429);
   assert.equal(calls,6);
 }finally{globalThis.fetch=real;}
});
const reserveReq=(action,data)=>new Request('https://budget.internal/'+action,{method:'POST',body:JSON.stringify(data)});
test('monthly budget migrates legacy spend, enforces both caps, and refunds only once',async()=>{
 const month=new Date().toISOString().slice(0,7), m=new Map([['budget',{month,monthly:1000}]]);
 let queue=Promise.resolve();
 const txn={get:async k=>structuredClone(m.get(k)),put:async(k,v)=>{m.set(k,structuredClone(v));},delete:async k=>m.delete(k)};
 const d=new ChatBudget({storage:{transaction:f=>{const p=queue.then(()=>f(txn));queue=p.catch(()=>{});return p;}}});
 const call=(action,id,pool,amount)=>d.fetch(reserveReq(action,{id,pool,amount}));
 const id=()=>crypto.randomUUID(), key='spend:'+month;
 const first=id(), charge=2_000_000;
 for(let i=0;i<61;i++)assert.equal((await call('reserve',i===0?first:id(),'public',charge)).status,204);
 assert.equal(m.get(key).public,10_000_000_000+61*charge);
 assert.equal((await call('settle',first,'public',700_000)).status,204);
 assert.equal((await call('settle',first,'public',0)).status,404);
 assert.equal(m.get(key).public,10_000_000_000+60*charge+700_000);
 m.set(key,{public:94_999_000_000,preview:4_999_000_000});
 const concurrent=await Promise.all([call('reserve',id(),'public',1_000_000),call('reserve',id(),'public',1_000_000)]);
 assert.deepEqual(concurrent.map(x=>x.status).sort(),[204,429]);
 assert.equal((await call('reserve',id(),'preview',1_000_000)).status,204);
 assert.deepEqual(m.get(key),{public:95_000_000_000,preview:5_000_000_000});
 assert.equal((await call('reserve',id(),'preview',1)).status,429);
 m.set(key,{public:95_000_000_000,preview:0});
 assert.equal((await call('reserve',id(),'preview',1)).status,204);
 assert.equal((await call('reserve',id(),'public',1)).status,429);
});
test('preview requires a private key and meters real usage separately',async()=>{
 const base=env, u='https://inovancerobot.com', preview='https://example.test/v1/preview/chat';
 const key='a'.repeat(64);
 const send=(url,provided)=>new Request(url,{method:'POST',headers:{Origin:u,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.4',...(provided?{Authorization:'Bearer '+provided}:{})},body:JSON.stringify({question:q[0],lang:'ko'})});
 const marks=[],rates=[];
 const service={...base,PREVIEW_CHAT_KEY:key,
  CHAT_BUDGET:{getByName:()=>({fetch:async(url,init)=>{marks.push([new URL(url).pathname,JSON.parse(init.body)]);return new Response(null,{status:204});}})},
  VISITOR_RATE:{limit:async x=>{rates.push(x.key);return {success:true};}}};
 const real=globalThis.fetch;
 try{
   globalThis.fetch=async (url,init)=>{const p=JSON.parse(init.body);assert.equal(p.service_tier,'default');return Response.json({status:'completed',usage:{input_tokens:200,input_tokens_details:{cached_tokens:100},output_tokens:10},output:[{content:[{type:'output_text',text:'{"claims":[],"retryQuery":""}'}]}]});};
   for(const invalid of ['', 'b'.repeat(64)])assert.equal((await worker.fetch(send(preview,invalid),service)).status,403);
   assert.equal(marks.length,0);
   assert.equal((await worker.fetch(send(preview,key),service)).status,200);
   assert.equal((await worker.fetch(send('https://example.test/v1/chat',key),service)).status,200);
   assert.deepEqual(rates,['preview:192.0.2.4','public:192.0.2.4']);
   assert.deepEqual(marks.map(([route,d])=>[route,d.pool]),[['/reserve','preview'],['/settle','preview'],['/reserve','public'],['/settle','public']]);
   assert.equal(marks[1][1].amount,16_000);
   assert.ok(marks[0][1].amount>marks[1][1].amount);
   assert.equal(marks[0][1].id,marks[1][1].id);
 }finally{globalThis.fetch=real;}
});

test('servo 731 and 731.0 resolve to the verified public catalog, not a reach query',async()=>{
  const a=await evidenceFor(db,'731 에러가 뭐야?');
  const b=await evidenceFor(db,'731.0 에러가 뭐야?');
  assert.equal(a[0].title,b[0].title);
  assert.match(a[0].title,/Er\.731\.0/);
  assert.match(a[0].body,/배터리/);
  assert.ok(!(await evidenceFor(db,'731 mm')).some(x=>/Er\.731/.test(x.title)));
});
test('likely unit typo uses model evidence without inferring a family; unrelated gg is not kg',async()=>{
  const queries=[];
  const catalog={prepare(sql){return{bind(...v){return{all:async()=>{
      if(!sql.includes('robot_models'))return {results:[]};
      queries.push(v);
      return {results:[model]};
  }}}}}};
  for(const question of ['4gg 모델 뭔가 있니','4KGG robot models']){
      assert.equal((await evidenceFor(catalog,question))[0].title, model.model);
  }
  assert.equal((await evidenceFor(catalog,'4gg')).length,0);
  assert.deepEqual(queries,[['',4,''],['',4,'']]);
});

test('Luna can recover an ambiguous question by requesting one more evidence search',async()=>{
  const catalog={prepare(sql){return{bind(...args){return{all:async()=>({results:sql.includes('robot_models')&&args[1]===4?[model]:[]})}}}}};
  let claims=0;
  const local={...env,PUBLIC_KNOWLEDGE:catalog,CHAT_BUDGET:{getByName:()=>({fetch:async(url)=>{if(url.endsWith("/reserve"))claims++;return new Response(null,{status:204});}})}};
  const old=globalThis.fetch;
  const calls=[];
  try{
    globalThis.fetch=async(url,init)=>{
      const p=JSON.parse(init.body), input=JSON.parse(p.input);
      assert.equal(p.model,'gpt-6-luna');
      calls.push(input);
      const value=calls.length===1?{claims:[],retryQuery:'4 kg robot'}:{claims:[{text:'Found a match',sourceId:'s1',excerpt:input.sources[0].body.slice(0,64)}]};
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
    };
    const response=await worker.fetch(req('https://inovancerobot.com','4kj robot?', 'ko'),local);
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).sources,[{title:model.model,url:model.url}]);
    assert.equal(calls.length,2);
    assert.deepEqual(calls[0].sources,[]);
    assert.equal(calls[1].question,'4kj robot?');
    assert.equal(calls[1].secondSearch,'4 kg robot');
    assert.equal(claims,2);
  }finally{globalThis.fetch=old;}
});

test('failed catalog still reaches Luna and a repeat search does not spend another call',async()=>{
  const local={...env,PUBLIC_KNOWLEDGE:{prepare(){throw Error('unavailable');}}};
  const old=globalThis.fetch;
  let calls=0;
  try{
    globalThis.fetch=async(_,init)=>{
      calls++;
      assert.deepEqual(JSON.parse(JSON.parse(init.body).input).sources,[]);
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({claims:[],retryQuery:'4 kg robot'})}]}]});
    };
    const response=await worker.fetch(req('https://inovancerobot.com','4kj robot?', 'ko'),local);
    assert.equal(response.status,200);
    const data=await response.json(); assert.match(data.answer,/공개 자료에서/); assert.deepEqual(data.sources,[]);
    assert.equal(calls,1);
  }finally{globalThis.fetch=old;}
});

test('public model results exclude hidden and unlisted records and exact model overrides previous payload',async()=>{
  const hidden={...model,model:'IR-CS4-40Z15S-INT',url:model.url.replace('IR-S4-','IR-CS4-')};
  const unlisted={...model,model:'IR-S99-40Z15S-INT',url:model.url.replace('IR-S4-','IR-S99-')};
  const another={...model,model:'IR-R4-56S-INT',url:model.url.replace(model.model,'IR-R4-56S-INT')};
  const manual={title:'IR-S4&S7&S10 Series User Guide',url:'https://inovancerobot.com/6_Document/Hardware_manual/SCARA/IR-S4.pdf',page:7,body:'Model designation'};
  const queries=[];
  const catalog={prepare(sql){return{bind(...args){return{all:async()=>{
    if(sql.includes('robot_models')){queries.push(args);return {results:[hidden,unlisted,another,model]};}
    if(sql.includes('lower(url)'))return {results:[manual]};
    return {results:[{...hidden,title:hidden.model,body:hidden.model},{...another,title:another.model,body:another.model}]};
  }}}}}};
  const broad=await evidenceFor(catalog,'4 kg robot');
  assert.ok(broad.some(x=>x.title===model.model));
  assert.ok(!broad.some(x=>/IR-CS4|IR-S99/.test(x.title+' '+x.url+' '+x.body)));
  const exact=await evidenceFor(catalog,model.model+' model designation','10 kg six axis');
  assert.deepEqual(exact.map(x=>x.title),[model.model,'IR-S4&S7&S10 Series User Guide - Manipulator',manual.title]);
  assert.equal(new URL(exact[1].url).hash,'#page=19');
  assert.deepEqual(queries[1],['s440z15sint',0,'']);
});

test('4g SCARA CAD lookup stays within 4 kg public models',async()=>{
  const wrong='https://inovancerobot.com/1_RobotModelSelect/Robot_CAD/SCARA/IR-S10-60/IR-S10-60Z20S-INT_3D.stp';
  const right='https://inovancerobot.com/1_RobotModelSelect/Robot_CAD/SCARA/IR-S4-40/IR-S4-40Z15S-INT_3D.stp';
  const catalog={prepare(sql){return{bind(...args){return{all:async()=>{
    if(sql.includes('robot_models')){assert.equal(args[1],4);assert.equal(args[2],'SCARA');return {results:[model]};}
    if(sql.includes('FROM cad'))return {results:[{title:'STEP 4 kg',model:model.model,label:'STEP 4 kg',url:right}]};
    return {results:[{title:'STEP 10 kg',url:wrong,body:'unrelated'}]};
  }}}}}};
  const result=await evidenceFor(catalog,'4g \uC2A4\uCE74\uB77C 3D \uB3C4\uBA74 \uC788\uC5B4?');
  assert.ok(result.some(x=>x.url===right));
  assert.ok(!result.some(x=>x.url===wrong));
});

test('Luna generates answers for former rule paths and gets the verified sources',async()=>{
 const u='https://inovancerobot.com',socket=u+'/6_Document/%EA%B5%90%EC%9C%A1/6.%20Socket%20%ED%86%B5%EC%8B%A0.pdf';
 const cases=[
  ['InoRobotLab 소켓 통신 교육자료 PDF 링크',socket],
  ['IR-S4-40Z15S-INT 가격은 얼마야?', 'https://www.inovance.com/global/contact-us/form.html',/globalcontact@inovance\.com/],
  ['IR-S4-40Z15S-INT official product page','https://www.inovance.com/global/content/details_816_556034.html'],
  ['IR-S4-40Z12C-INT official product page','https://www.inovance.com/global/product/overview.html?fid=100056&isxl=1&pid=0'],
  ['IR-S4-40Z12C-INT 예상 납기',u+'/1_RobotModelSelect/models/IR-S4-40Z12C-INT/',/10주/],
  ['스카라 예상 납기는?',u+'/1_RobotModelSelect/',/클린형.*10주/],
  ['로봇 시뮬레이션 컨트롤러 연결 방법',u+'/2_3DSimulation/',/InoRobotLab 없이/]
 ];
 const base={...env,KNOWLEDGE_ASSETS:{fetch:async()=>Response.json([[socket,'Socket']])}};
 const real=globalThis.fetch;
 let i=0;
 try{
   globalThis.fetch=async(_,init)=>{
     const payload=JSON.parse(init.body);
     assert.equal(payload.model,'gpt-6-luna');
     const {question,sources}=JSON.parse(payload.input),[q,url,re]=cases[i++];
     assert.equal(question,q);
     const src=sources.find(s=>s.curated&&s.url===url);
     assert.ok(src,url);
     if(re)assert.match(src.body,re);
     return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({claims:[{text:'Generated by Luna',sourceId:src.id,excerpt:src.body.slice(0,64)}],retryQuery:''})}]}]});
   };
   for(const [question,url] of cases){
     const r=await worker.fetch(req(u,question,'ko'),base);
     assert.equal(r.status,200,question);
     assert.equal(r.headers.get('X-Ino-Answer-Mode'),'luna',question);
     const body=await r.json();
     assert.equal(body.answer,'Generated by Luna');
     assert.deepEqual(body.sources.map(s=>s.url),[url]);
   }
   assert.equal(i,cases.length);
 }finally{globalThis.fetch=real;}
});

test('traffic, site AI budget and provider throttling are distinct with no rule fallback',async()=>{
 const ask=()=>req('https://inovancerobot.com','INOVANCE Korea official website','en');
 const real=globalThis.fetch;
 let calls=0;
 try{
   globalThis.fetch=async()=>{calls++;return Response.json({}, {status:429});};
   const rate=await worker.fetch(ask(),{...env,VISITOR_RATE:{limit:async()=>({success:false})}});
   assert.equal(rate.status,429);assert.equal((await rate.json()).code,'visitor_rate');
   const budget=await worker.fetch(ask(),{...env,CHAT_BUDGET:{getByName:()=>({fetch:async()=>new Response(null,{status:429})})}});
   assert.equal(budget.status,429);assert.equal((await budget.json()).code,'site_ai_budget');
   assert.equal(calls,0);
   const provider=await worker.fetch(ask(),env);
   assert.equal(provider.status,429);assert.equal((await provider.json()).code,'provider_busy');
   assert.equal(calls,1);
 }finally{globalThis.fetch=real;}
});

test('citations combine same file by full path and keep two distinct certificate variants',async()=>{
 const site='https://inovancerobot.com';
 const p=site+'/6_Document/Guide.pdf', cert=site+'/6_Document/Certificate/KCs/6-axis/IR-R10-110S-INT.pdf';
 const data={prepare(sql){return{bind(){return{all:async()=>({results:sql.includes('FROM pages')?[
    {title:'Guide',url:p,page:19,body:'specific first page'},
    {title:'Guide',url:p,page:23,body:'specific second page'},
    {title:'Standard certificate',url:cert,page:1,body:'Standard protection certificate'},
    {title:'High certificate',url:cert.replace('/6-axis/','/6-axis/High_protection/'),page:1,body:'High protection certificate'}
 ]:sql.includes('FROM site_content')?[{title:'Home',url:site+'/',body:'Generic website navigation'},{title:'Guide',url:p,body:'A description with no page metadata'}]:[]})}}}}};
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(_,init)=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({claims:JSON.parse(JSON.parse(init.body).input).sources.map((s,i)=>({text:'Supported answer '+i,sourceId:s.id,excerpt:s.body})),retryQuery:''})}]}]});
  const r=await worker.fetch(req(site,'Ethernet port IP setting','en'),{...env,PUBLIC_KNOWLEDGE:data});
  assert.equal(r.status,200);
  const urls=(await r.json()).sources.map(x=>x.url);
  assert.deepEqual(urls,[p+'#page=19',cert+'#page=1',cert.replace('/6-axis/','/6-axis/High_protection/')+'#page=1']);
 }finally{globalThis.fetch=original;}
});

test('answers cannot display invented evidence or a generic hub; PDF labels match the opened file',async()=>{
 const site='https://inovancerobot.com', pdf=site+'/6_Document/Software_manual/Teach%20Pendant%20User%20Manual.pdf';
 const row={title:'Unreliable search label',url:pdf,page:12,body:'The teach pendant displays the program list.'};
 const data={prepare(sql){return{bind(){return{all:async()=>({results:sql.includes('FROM pages')?[row]:sql.includes('FROM site_content')?[{title:'Software index',url:site+'/5_Software/',body:'The software index has download cards.'}]:[]})}}}}};
 const original=globalThis.fetch;
 try{
   globalThis.fetch=async(_,init)=>{
     const input=JSON.parse(JSON.parse(init.body).input), good=input.sources.find(x=>x.url.includes('Teach%20Pendant')), hub=input.sources.find(x=>x.url.endsWith('/5_Software/'));
     const claims=[{text:'Invented requirement',sourceId:good.id,excerpt:'Connect an unlisted device first.'},{text:'Do not treat the hub as evidence.',sourceId:hub.id,excerpt:hub.body}];
     if(input.question.startsWith('Where'))claims.push({text:'The teach pendant displays the program list.',sourceId:good.id,excerpt:row.body});
     return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({claims,retryQuery:''})}]}]});
   };
   const found=await worker.fetch(req(site,'Where is the teach pendant program list?','en'),{...env,PUBLIC_KNOWLEDGE:data});
   assert.deepEqual(await found.json(),{answer:row.body,sources:[{title:'Teach Pendant User Manual.pdf',url:pdf+'#page=12'}]});
   const unknown=await worker.fetch(req(site,'Does the pendant require a different device?','en'),{...env,PUBLIC_KNOWLEDGE:data});
   assert.equal(unknown.headers.get('X-Ino-Answer-Mode'),'unverified');
   assert.deepEqual((await unknown.json()).sources,[]);
 }finally{globalThis.fetch=original;}
});

test('general CAD download location is a verified navigation source, not the STEP calculator',async()=>{
 const site='https://inovancerobot.com',publicCad=site+'/6_Document/';
 const cases=[
  ['CAD 파일은 어디서 다운로드 받을 수 있어?','ko',true],
  ['도면 어디서 받아?','ko',true],
  ['Where can I download CAD files?','en',true],
  ['在哪里可以下载 CAD 图纸？','zh-CN',true],
  ['Tải bản vẽ CAD ở đâu?','vi',true],
  ['CAD çizimlerini nereden indirebilirim?','tr',true],
  ['Где скачать чертёж CAD?','ru',true],
  ['STEP CAD 물성 계산 모드 D 링크','ko',false],
  ['IR-S4-40Z15S-INT STEP 파일','ko',false],
  ['4kg 스카라 CAD 다운로드','ko',false]
 ];
 const real=globalThis.fetch;
 let index=0;
 try{
  globalThis.fetch=async(_,init)=>{
   const p=JSON.parse(init.body), i=JSON.parse(p.input), [question,lang,expected]=cases[index++];
   assert.equal(p.model,'gpt-6-luna');assert.equal(i.question,question.normalize('NFKC'));assert.equal(i.locale,lang);
   const src=i.sources.find(s=>s.url===publicCad&&s.curated);
   assert.equal(Boolean(src),expected,question);
   if(src){assert.match(src.body,/Open Documents, expand the CAD filter, and select All CAD Files/);assert.doesNotMatch(src.url,/ToolSelector/);}
   return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({claims:src?[{text:'Documents → CAD → All CAD Files',sourceId:src.id,excerpt:'Open Documents, expand the CAD filter, and select All CAD Files.'}]:[],retryQuery:''})}]}]});
  };
  for(const [question,lang,expected] of cases){
    const r=await worker.fetch(req(site,question,lang),env);
    assert.equal(r.status,200,question);
    assert.equal(r.headers.get('X-Ino-Answer-Mode'),expected?'luna':'unverified',question);
    const answer=await r.json();
    if(expected)assert.deepEqual(answer.sources,[{title:lang==='ko'?'문서 자료실 · CAD':'Documents · CAD',url:publicCad,kind:'navigation'}]);
  }
  assert.equal(index,cases.length);
 }finally{globalThis.fetch=real;}
});


test('when the index cannot answer, Luna re-checks a bounded set of public pages and cites current text',async()=>{
 const site='https://inovancerobot.com', docs=site+'/6_Document/';
 const real=globalThis.fetch, charges=[], read=[], prompts=[];
 const services={...env,LIVE_PUBLIC_LOOKUP:'1',CHAT_BUDGET:{getByName:()=>({fetch:async(url,init)=>{
   if(url.endsWith('/reserve'))charges.push(JSON.parse(init.body).amount);
   return new Response(null,{status:204});
 }})}};
 const quote='The CAD library separates Controller CAD and Accessory CAD.';
 function answer(claims,retryQuery){return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({claims,...(typeof retryQuery==='string'?{retryQuery}:{})})}]}]});}
 try{
   globalThis.fetch=async(url,init)=>{
     if(url==='https://api.openai.com/v1/responses'){
       const p=JSON.parse(JSON.parse(init.body).input);prompts.push(p);
       if(prompts.length===1){assert.ok(!p.sources.some(x=>x.live));return answer([],'CAD library accessory category');}
       const source=p.sources.find(x=>x.live);
       assert.equal(source.url,docs);assert.match(source.body,/Controller CAD and Accessory CAD/);
       assert.doesNotMatch(source.body,/script exception|SECRET HTML COMMENT/);
       return answer([{text:'CAD files are grouped by category.',sourceId:source.id,excerpt:quote}]);
     }
     read.push(url);
     assert.equal(init.redirect,'manual');assert.ok(init.signal);assert.ok(!init.headers.Authorization);
     if(url===site+'/sitemap.xml')return new Response('<urlset><loc>https://outside.example/6_Document/CAD/</loc><loc>'+site+'/6_Document/CAD.txt</loc><loc>'+docs+'</loc></urlset>',{headers:{'Content-Type':'application/xml'}});
     assert.equal(url,docs);
     return new Response('<html><title>Public Documents</title><script>CAD script exception</script><!--SECRET HTML COMMENT CAD--><main><p>'+quote+'</p></main></html>',{headers:{'Content-Type':'text/html'}});
   };
   const r=await worker.fetch(req(site,'Does the CAD library have an accessory subcategory?','en'),services);
   assert.equal(r.status,200);assert.equal(r.headers.get('X-Ino-Evidence'),'live');
   assert.deepEqual((await r.json()).sources,[{title:'Public Documents',url:docs,kind:'navigation'}]);
   assert.deepEqual(read,[site+'/sitemap.xml',docs]);assert.equal(charges.length,2);
 }finally{globalThis.fetch=real;}
});

test('an already grounded answer does not open the public site',async()=>{
 const site='https://inovancerobot.com';
 const real=globalThis.fetch;
 let calls=0;
 try{
   globalThis.fetch=async(url,init)=>{
     calls++;assert.equal(url,'https://api.openai.com/v1/responses');
     const p=JSON.parse(JSON.parse(init.body).input),s=p.sources[0];
     return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({claims:[{text:'CAD files are in Documents.',sourceId:s.id,excerpt:s.body.slice(0,s.body.indexOf('.')+1)}],retryQuery:''})}]}]});
   };
   const r=await worker.fetch(req(site,'Where can I download CAD files?','en'),{...env,LIVE_PUBLIC_LOOKUP:'1'});
   assert.equal(r.status,200);assert.equal(r.headers.get('X-Ino-Evidence'),null);assert.equal(calls,1);
 }finally{globalThis.fetch=real;}
});
