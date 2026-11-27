import {readFileSync,writeFileSync} from 'node:fs';
const [phase, path]=process.argv.slice(2);
const data=readFileSync(path);
if(phase==='clip'){
  const from=data.indexOf(Buffer.from([0x50,0x4b,0x03,0x04]));
  const last=data.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if(from<0||last<=from||last+22>data.length)throw Error('Embedded archive not found');
  writeFileSync('servo-resource.zip',data.subarray(from,last+22));
}else{
  const marker=data.indexOf(Buffer.from('"JZ_SV660N": {'));
  const start=data.lastIndexOf(123,marker-1);
  if(marker<0||start<0)throw Error('Servo catalog not found');
  let depth=0,string=false,esc=false,end=start;
  for(;end<data.length;end++){
    const c=data[end];
    if(string){if(esc)esc=false;else if(c===92)esc=true;else if(c===34)string=false;}
    else if(c===34)string=true;
    else if(c===123)depth++;
    else if(c===125&&--depth===0)break;
  }
  const profiles=JSON.parse(data.subarray(start,end+1).toString('utf8')), out={};
  const keys=Object.entries(profiles);
  for(const [profile,values] of keys){
    for(const [key,title] of Object.entries(values)){
      const match=/^(FA_G0_I(\d+)_Main)_Name$/.exec(key);
      if(!match||typeof title!=='string'||!title.trim())continue;
      const canonical=Number(match[2]).toString(16).toUpperCase().padStart(4,'0');
      const causes=[...new Set(Object.entries(values).filter(([k,v])=>k.startsWith(match[1]+'_Detail')&&k.endsWith('_Cause')&&typeof v==='string'&&v.trim()&&v.trim()!=='-').map(([k,v])=>v.replace(/^\s*\d+[.)]\s*/,'').trim()))];
      (out[canonical]??={})[profile.replace(/_SV660N$/,'')]=[title.trim(),causes];
    }
  }
  if(out['5001']?.IR?.[0]!=='속도 피드백 오버플로'||!out['7310'])throw Error('Public catalog checks failed');
  writeFileSync('servo-evidence.mjs','export default '+JSON.stringify(out)+';\n');
  console.log('Verified public servo catalog:',Object.keys(out).length,'codes;',Object.values(out).reduce((a,v)=>a+Object.keys(v).length,0),'profile rows');
}