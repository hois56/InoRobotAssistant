import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const root=process.argv[2];
const host='https://inovancerobot.com';
async function read(url){const res=await fetch(host+url,{redirect:'error',signal:AbortSignal.timeout(8000)}); if(!res.ok)throw Error(url+' '+res.status);return res.text();}
const [xml,productText,publicEngine]=await Promise.all([read('/sitemap.xml'),read('/1_RobotModelSelect/data.js'),read('/shared/site-engine.js')]);
const wasmText=t=>t.match(/const encoded = '([A-Za-z0-9+/=]+)'/)?.[1];
const source=path.join(root,'shared','site-engine.js');
const engineLocal=wasmText(await fs.readFile(source,'utf8'));
if(!engineLocal||engineLocal!==wasmText(publicEngine))throw Error('Live calculator differs from local; do not publish a stale estimate');
createRequire(import.meta.url)(source);
const api=globalThis.InoSite;
const products=JSON.parse(productText.match(/const productsData\s*=\s*(\[[\s\S]*?\])\s*;/)[1]);
const allowed=new Set([...xml.matchAll(/<loc>https:\/\/inovancerobot\.com\/1_RobotModelSelect\/models\/([^/]+)\/<\/loc>/g)].map(m=>m[1].toUpperCase()));
const snapshot=[];
for(const p of products){
 if(!allowed.has(p.id)||/^IR-CS/u.test(p.id))continue;
 const all=p.cables||[], marked=all.find(c=>c.cable.includes('(Default)'));
 const lens=[...new Set(all.map(c=>c.cable.match(/\d+m/)?.[0]).filter(Boolean))].sort((a,b)=>parseInt(a)-parseInt(b));
 const len=marked?.cable.match(/\d+m/)?.[0]||lens[0]||'N/A';
 const flex=Boolean(marked?.cable.includes('High flex'));
 const code=(api.matchCable(all,len,flex)||all[0])?.code||'N/A';
 const cert=String(p.detailSpecs?.Certification||'').split(',').some(x=>x.trim().toUpperCase()==='KCS');
 const convert=x=>parseInt(x)+(x.endsWith('\uAC1C\uC6D4')?'m':'w');
 snapshot.push({model:p.id,type:p.specs.Type,payload:Number(p.specs['Payload(kg)']),clean:p.specs['Clean Type']==='Yes',estimate:convert(api.leadTime(p,code,cert)),
   options:Object.fromEntries(lens.flatMap(l=>[false,true].flatMap(f=>{
     const match=api.matchCable(all,l,f);
     if(!match||!match.cable.startsWith(l)||f!==match.cable.includes('High flex'))return [];
     return [[l+(f?'-flex':'-std'),convert(api.leadTime(p,match.code,cert))]];
   }))),alternate:convert(api.leadTime(p,'-',cert))});
}
if(snapshot.length!==allowed.size||snapshot.some(x=>!['6w','7w','8w','10w','6m'].includes(x.estimate)))throw Error('Published model coverage or expected values changed: '+snapshot.length+'/'+allowed.size);
await fs.writeFile('lead-time-catalog.mjs','// Generated from the published model selector and its matching Rust calculator.\nexport default '+JSON.stringify(snapshot)+';\n');
console.log(snapshot.length,snapshot.filter(x=>/IR-S4-40Z15S|IR-S4-40Z12C|IR-R10-110/.test(x.model)));
