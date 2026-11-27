import fs from 'node:fs/promises';
const site='https://inovancerobot.com';
const base=JSON.parse(await fs.readFile('corpus-audit.json'));
const source=await fs.readFile(process.argv[2]||'corpus-rows.json','utf8');
const rows=JSON.parse(source);
const cadResponse=await fetch(site+'/6_Document/cad-data.js',{redirect:'error',signal:AbortSignal.timeout(10000)});
if(!cadResponse.ok)throw Error('CAD registry unavailable');
const js=await cadResponse.text();
const known=new Set(rows.map(r=>r.url));
const scan=[];
for(const m of js.matchAll(/folder:\s*"([^"]+)"\s*,\s*files:\s*\[([^\]]+)\]/g)){
 for(const name of m[2].matchAll(/"([^"]+\.(?:dwg|dxf|stp|step))"/giu)){
   if(/\bIR[-\s]?CS\d/i.test(m[1]+'/'+name[1]))continue;
   const url=site+'/1_RobotModelSelect/Robot_CAD/'+m[1].split('/').map(encodeURIComponent).join('/')+'/'+encodeURIComponent(name[1]);
   scan.push({url,title:name[1]});
 }
}
if(scan.length<65)throw Error('CAD registry unexpectedly small');
const added=[], failures=[];
for(let i=0;i<scan.length;i+=6){
 await Promise.all(scan.slice(i,i+6).map(async d=>{
  if(known.has(d.url))return;
  try{
   const r=await fetch(d.url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(8000)});
   if(!r.ok||r.headers.get('content-type')?.startsWith('text/html'))throw Error(String(r.status));
   rows.push({...d,page:0,category:'cad',lang:'',body:'Public CAD download: '+d.title});
   added.push(d.url);
  }catch(e){failures.push([d.url,e.message]);}
 }));
}
for(const r of rows){
 if(!r.url.includes('/Certificate/'))continue;
 if(/cert-kcs/i.test(r.category)){
  const high=r.url.includes('/High_protection/');
  const regular=/^cert-kcs-(?:6axis|scara)$/i.test(r.category);
  if(high||regular)r.title=r.title.replace(/\.pdf$/i,'')+' KCs '+(high?'High protection \uACE0\uBC29\uC9C4\uD615':'Standard \uD45C\uC900\uD615')+'.pdf';
 }
}
rows.sort((a,b)=>a.url.localeCompare(b.url)||a.page-b.page);
await fs.writeFile('corpus-publish-rows.json',JSON.stringify(rows));
await fs.writeFile('cad-audit.json',JSON.stringify({registry:scan.length,added,failures},null,2));
console.log(JSON.stringify({listed:base.files+added.length,cad:scan.length,cadNew:added.length,failures}));
