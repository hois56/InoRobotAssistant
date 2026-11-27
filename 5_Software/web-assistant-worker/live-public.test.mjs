import test from 'node:test';
import assert from 'node:assert/strict';
import {liveEvidence} from './live-public.mjs';
const origin='https://inovancerobot.com', model='IR-S4-40Z15S-INT';
test('HTTP redirects, extra origins, non-page downloads, and nonpublic models never become live evidence',async()=>{
 const seen=[];
 const sources=['http://inovancerobot.com/6_Document/','https://another.example/6_Document/','https://inovancerobot.com@another.example/6_Document/',
 origin+'/6_Document/drawing.stp',origin+'/6_Document/Guide.pdf',origin+'/1_RobotModelSelect/models/IR-CS4-40Z15S-INT/',
 origin+'/6_Document/?key=anything',origin+'/6_Document/#anchor'].map(url=>({url}));
 const fetcher=async(url,init)=>{
   seen.push(url);assert.equal(init.redirect,'manual');
   if(url.endsWith('/sitemap.xml'))return new Response('<urlset>'+sources.map(x=>'<loc>'+x.url+'</loc>').join('')+'</urlset>',{headers:{'Content-Type':'application/xml'}});
   return new Response(null,{status:302,headers:{Location:'https://another.example/'}});
 };
 const result=await liveEvidence(model+' CAD download','',sources,new Set([model]),new AbortController().signal,fetcher);
 assert.deepEqual(seen,[origin+'/sitemap.xml',origin+'/1_RobotModelSelect/models/'+model+'/',origin+'/6_Document/']);
 assert.deepEqual(result,[]);
});
