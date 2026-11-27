import fs from 'node:fs/promises';
import path from 'node:path';
import {terms,bucket} from './public-corpus.mjs';
const rows=JSON.parse(await fs.readFile(process.argv[2]||'corpus-rows.json','utf8'));
const dir=path.join('assets','_kb');
await fs.mkdir(dir,{recursive:true});
const dict=Array.from({length:128},()=>new Map()), docs=[], ids=new Map(), snippets=[];
const save=(name,x)=>fs.writeFile(path.join(dir,name+'.json'),JSON.stringify(x));
for(const row of rows){
  let id=ids.get(row.url);
  if(id===undefined){id=docs.length;ids.set(row.url,id);docs.push([row.url,row.title,row.category,row.lang,row.body.slice(0,420)]);}
  const words=row.body.split(' ');
  for(let n=0;n<words.length;){
    const chunk=[];let length=0;
    while(n<words.length&&length<690){const v=words[n++]; length+=v.length+1; chunk.push(v);}
    const body=chunk.join(' ').slice(0,740);
    const i=snippets.length;snippets.push([id,row.page,body,row.ocr||undefined]);
    const count=new Map();
    for(const k of [...terms(body),...terms(row.title).slice(0,20),...terms(row.category).slice(0,6)])count.set(k,(count.get(k)||0)+1);
    for(const [k,n] of count){const b=dict[bucket(k)],l=b.get(k)||[];l.push([i,n]);b.set(k,l);}
  }
}
await save('docs',docs);
for(let i=0;i<snippets.length;i+=32)await save('rows-'+i/32,snippets.slice(i,i+32));
for(let i=0;i<dict.length;i++){
  const entries=Object.create(null);
  for(const [word,all] of dict[i]){
    const ranked=all.length<=320?all:all.sort((a,b)=>b[1]-a[1]).slice(0,320);
    entries[word]=[all.length,...ranked.flat()];
  }
  await save('terms-'+i,entries);
}
console.log(JSON.stringify({documents:docs.length,searchChunks:snippets.length,buckets:dict.length}));
