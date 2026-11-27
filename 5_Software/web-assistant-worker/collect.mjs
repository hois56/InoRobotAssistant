import fs from 'node:fs/promises';
import {load} from 'cheerio';
globalThis.DOMMatrix??=class DOMMatrix {};
const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
const host='https://inovancerobot.com';
const docs=new Map(), pages=new Map();
const skips=[];
const tidy=s=>s.replace(/\s+/gu,' ').trim();
function urlOf(raw,parent=host+'/'){
  try{
    const u=new URL(raw,parent);if(u.origin!==host||u.username||u.password)return;
    const d=decodeURIComponent(u.pathname);
    if(/(?:\/(?:internal|private|admin)(?:\/|$)|\bIR[-\s]?CS\d)/iu.test(d))return;
    u.pathname=d.split('/').map(encodeURIComponent).join('/');u.hash='';u.search='';
    return u.href;
  }catch{}
}
async function get(url,max=85_000_000){
  const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!r.ok)throw Error('HTTP '+r.status);
  if(Number(r.headers.get('content-length'))>max)throw Error('size limit');
  if(!r.body)throw Error('empty response');
  const parts=[];let size=0;
  for await(const c of r.body){size+=c.length;if(size>max)throw Error('size limit');parts.push(c);}
  return {body:Buffer.concat(parts),type:r.headers.get('content-type')||''};
}
function kind(url){
  const p=new URL(url).pathname;
  if(/\.(pdf|xml|eds|docx?|pptx?|xlsx?|csv|txt|stp|step|dwg|dxf|stl|zip|7z|rar|exe)$/i.test(p))return 'file';
  if(/(?:\/|\.html?)$/i.test(p)&&!/(?:\b404|\.template)\b/i.test(p))return 'html';
}
function add(raw,parent,title='',category='',lang=''){
  const u=urlOf(raw,parent);if(!u||!kind(u))return;
  const target=kind(u)==='html'?pages:docs;
  const before=target.get(u);
  if(!before||category&&!before.category)target.set(u,{url:u,title:tidy(title)||decodeURIComponent(new URL(u).pathname.split('/').filter(Boolean).pop()||'InoRobot'),category,lang});
}
const xml=(await get(host+'/sitemap.xml',1_000_000)).body.toString();
for(const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g))add(m[1]);
const catalogUrl=host+'/6_Document/script.js';
const catalog=(await get(catalogUrl,2_000_000)).body.toString();
const val=(s,k)=>s.match(new RegExp('\\b'+k+'\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")'))?.[1];
for(const part of catalog.split(/(?:^|\n)\s*\{/u)){
  const path=val(part,'path');if(!path)continue;
  try{add(JSON.parse(path),catalogUrl,JSON.parse(val(part,'title')||'""'),JSON.parse(val(part,'category')||'""'),JSON.parse(val(part,'lang')||'""'));}catch{}
}
for(const m of catalog.matchAll(/\["(cert-[^"]+)",\s*"(Certificate\/[^"]+)"\]/gu))add(m[2],catalogUrl,'',m[1],'');
const rows=[];
function push(d,page,body){
  const clean=tidy(body).replace(/\bIR[-\s]?CS\d+[A-Z0-9-]*/giu,'');
  if(clean)rows.push({url:d.url,title:d.title,page,body:clean,category:d.category,lang:d.lang});
}
const processed=new Set();
while([...pages.keys()].some(u=>!processed.has(u))){
  const batch=[...pages.values()].filter(d=>!processed.has(d.url)).slice(0,6);
  if(processed.size+batch.length>300)throw Error('HTML inventory exceeded scope');
  await Promise.all(batch.map(async d=>{
    processed.add(d.url);
    try{
      const {body,type}=await get(d.url,3_000_000);if(!type.includes('html'))throw Error(type);
      const $=load(body.toString());const title=tidy($('h1').first().text()||$('title').text())||d.title;
      for(const a of $('a[href]').toArray()) {
        if($(a).closest('[hidden],[aria-hidden=true],template').length)continue;
        add($(a).attr('href'),d.url,$(a).text());
        const u=urlOf($(a).attr('href'),d.url);if(!u||kind(u)!=='file')continue;
        push({...d,title},0,tidy($(a).text())+' '+decodeURIComponent(new URL(u).pathname.split('/').pop()));
      }
      $('script,style,template,noscript,nav,footer,header,[hidden],[aria-hidden=true]').remove();
      const bodyNode=$('main').length?$('main'):$('body');
      const bits=bodyNode.find('h1,h2,h3,h4,p,li,tr,dt,dd,summary,label').toArray().map(a=>tidy($(a).text())).filter(Boolean);
      for(let n=0;n<bits.length;){const part=[];let chars=0;while(n<bits.length&&chars<1050){part.push(bits[n]);chars+=bits[n++].length;}push({...d,title},0,part.join(' | '));}
      if(!bits.length)push({...d,title},0,bodyNode.text().slice(0,2400));
    }catch(e){skips.push([d.url,e.message]);}
  }));
}
const checked=[];
const list=[...docs.values()];
console.log('HTML',processed.size,'linked files',list.length);
for(let i=0;i<list.length;i+=4){
  await Promise.all(list.slice(i,i+4).map(async d=>{
    let pdf;
    try{
      if(/\.(?:stp|step|dwg|dxf|stl|zip|7z|rar|exe|docx?|pptx?|xlsx?)$/i.test(d.url)){
        const r=await fetch(d.url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(10000)});
        if(!r.ok||r.headers.get('content-type')?.startsWith('text/html'))throw Error('unavailable download '+r.status);
        push(d,0,'Public download: '+d.title+' '+decodeURIComponent(new URL(d.url).pathname.split('/').pop()));checked.push({...d,indexed:'link'});return;
      }
      const {body}=await get(d.url);
      if(!/\.pdf$/i.test(d.url)){const str=body.toString().replace(/<[^>]*>/g,' ');push(d,0,str.slice(0,9500));checked.push({...d,indexed:'text'});return;}
      if(body.subarray(0,5).toString()!=='%PDF-')throw Error('not a PDF');
      pdf=await getDocument({data:new Uint8Array(body),useSystemFonts:false,disableFontFace:true,isEvalSupported:false,stopAtErrors:false,verbosity:0,
        cMapUrl:new URL('node_modules/pdfjs-dist/cmaps/',import.meta.url).pathname.replace(/^\/(?=[A-Z]:)/i,''),cMapPacked:true,
        standardFontDataUrl:new URL('node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname.replace(/^\/(?=[A-Z]:)/i,'')}).promise;
      let count=0;
      const imageOnly=[];
      for(let n=1;n<=pdf.numPages;n++){
        const p=await pdf.getPage(n);const tc=await p.getTextContent();
        const str=tidy(tc.items.map(x=>x.str||'').join(' '));
        if(str.length>35){push(d,n,str.slice(0,19000));count++;}else imageOnly.push(n);
        p.cleanup();
      }
      if(!count)push(d,0,'Public PDF download: '+d.title);
      checked.push({...d,indexed:'pdf',pages:pdf.numPages,textPages:count,imageOnly});
    }catch(e){skips.push([d.url,e.message]);}finally{if(pdf)await pdf.destroy().catch(()=>{});}
  }));
  if(i%24===0)console.log(i+'/'+list.length,'rows',rows.length,'exceptions',skips.length);
}
rows.sort((a,b)=>a.url.localeCompare(b.url)||a.page-b.page);
await fs.writeFile('corpus-rows.json',JSON.stringify(rows));
await fs.writeFile('corpus-audit.json',JSON.stringify({html:processed.size,files:list.length,checked,skips},null,2));
console.log('Completed',rows.length,'rows',checked.length,'files',skips.length,'exceptions');
