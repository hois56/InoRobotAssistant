import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const audit=JSON.parse(await fs.readFile('corpus-audit.json','utf8'));
const rows=JSON.parse(await fs.readFile('corpus-rows.json','utf8'));
const todo=audit.checked.filter(d=>d.indexed==='pdf'&&d.imageOnly.length>0);
const images=[], errors=[];
const ps=(await fs.readFile('ocr-images.ps1','utf8')).replace(/^\uFEFF/u,'').replace(/^param\(\[string\]\$Folder\)\r?\n/u,'');
for(let i=0;i<todo.length;i+=5){
 await Promise.all(todo.slice(i,i+5).map(async d=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ino-kb-ocr-'));
  try{
   const res=await fetch(d.url,{redirect:'error',signal:AbortSignal.timeout(45000)});
   if(!res.ok)throw Error('HTTP '+res.status);
   const pdf=path.join(dir,'public.pdf');await fs.writeFile(pdf,Buffer.from(await res.arrayBuffer()));
   for(const n of d.imageOnly){await run(process.env.PDFTOPPM,['-f',String(n),'-l',String(n),'-scale-to','2100','-png','-singlefile',pdf,path.join(dir,String(n))],{windowsHide:true,timeout:12000});}
   const native=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
   const {stdout}=await run(native,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from("$Folder='"+dir.replaceAll("'","''")+"'\n"+ps,'utf16le').toString('base64')],{windowsHide:true,timeout:50000,maxBuffer:1048576});
   const answers=JSON.parse(stdout.trim().replace(/^\uFEFF/u,''));
   for(const a of answers){
     if(a.error){errors.push([d.title,a.page,a.error]);continue;}
     const body=(a.text||'').replace(/\s+/gu,' ').trim().replace(/\bIR[-\s]?CS\d+[A-Z0-9-]*/giu,'');
     if(body.length>=36)images.push({url:d.url,title:d.title,page:a.page,body,category:d.category,lang:d.lang,ocr:true});
   }
  }catch(e){errors.push([d.title,(e.stderr||e.message).slice(0,280)]);} finally {const local=await fs.readdir(dir); for(const f of local){if(/^(public\.pdf|\d+\.png)$/.test(f))await fs.unlink(path.join(dir,f));}await fs.rmdir(dir);}
 }));
 if(i%20===0)console.log('OCR',i+1,'/',todo.length,'recovered',images.length,'exceptions',errors.length,errors.length?errors.at(-1):'');
}
const combined=[...rows,...images].sort((a,b)=>a.url.localeCompare(b.url)||a.page-b.page);
await fs.writeFile('corpus-ocr-rows.json',JSON.stringify(combined));
await fs.writeFile('ocr-audit.json',JSON.stringify({recovered:images.length,errors},null,2));
console.log('OCR completed',JSON.stringify({recovered:images.length,errors:errors.length,total:todo.reduce((n,v)=>n+v.imageOnly.length,0)}));
