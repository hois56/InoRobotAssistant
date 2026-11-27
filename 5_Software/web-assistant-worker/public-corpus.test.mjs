import test from 'node:test';
import assert from 'node:assert/strict';
import {bucket,terms,corpusEvidence} from './public-corpus.mjs';
test('an exact training title leads even if a different document ranks by body',async()=>{
 const root='https://inovancerobot.com/6_Document/%EA%B5%90%EC%9C%A1%20%EC%9E%90%EB%A3%8C/';
 const docs=[[root+'fieldbus.pdf','Fieldbus guide','education','KR','Fieldbus'],[root+'socket.pdf','6. Socket training','education','KR','InoRobotLab socket guide']];
 const files={'docs':docs,'rows-0':[[0,3,'Socket fieldbus training']]};
 for(const k of new Set(terms('socket training'))){const id='terms-'+bucket(k);files[id]??={};files[id][k]=[1,0,2];}
 const binding={fetch:async req=>{const name=new URL(req.url).pathname.split('/').pop().replace(/\.json$/,'');return files[name]?Response.json(files[name]):new Response(null,{status:404});}};
 const result=await corpusEvidence(binding,'socket training');
 assert.equal(result[0].url,root+'socket.pdf');
 assert.equal(result[1].page,3);
});
