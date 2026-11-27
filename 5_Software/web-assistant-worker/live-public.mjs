import {terms} from './public-corpus.mjs';
const site='https://inovancerobot.com';
const pathRoot=/^\/(?:Servo|[1-7]_(?:RobotModelSelect|3DSimulation|ToolSelector|ProjectGenerator|Software|Document|DebuggingTool))(?:\/|$)/i;
export const exactModel=/\bIR-[A-Z]{1,3}\d{1,3}(?:-[A-Z0-9]+){1,5}\b/i;
function urlFor(raw,model,allowed){
    try{
        const u=new URL(raw);
        if(u.origin!==site||u.username||u.password||u.search||u.hash)return null;
        const p=decodeURIComponent(u.pathname);
        if(!pathRoot.test(p)||p.includes('//')||p.split('/').some(s=>s.startsWith('.'))||
            !/^[\p{L}\p{N}_./&() -]+$/u.test(p)||!(p.endsWith('/')||p.endsWith('.html')))return null;
        if(/^\/1_RobotModelSelect\/models\//i.test(p)){
            const m=p.match(/^\/1_RobotModelSelect\/models\/([^/]+)\/(?:index\.html)?$/i)?.[1].toUpperCase();
            if(!allowed.has(m)||model&&m!==model)return null;
        }
        return u.href.replace(/\/index\.html$/i,'/');
    }catch{return null;}
}
const xml=/^(?:text|application)\/(?:xml|sitemap\+xml)\b/i;
const html=/^text\/html\b/i;
async function readPage(url,signal,limit,type,fetcher,observe){
    try{
        const opts={redirect:'manual',signal,headers:{Accept:type===html?'text/html':'application/xml, text/xml'}};
        let r=await fetcher.call(globalThis,url,opts);
        if([301,302,303,307,308].includes(r.status)){
            const location=r.headers.get('Location');
            if(!location){observe('redirect-no-target');return '';}
            const to=new URL(location,url), from=new URL(url);
            // Follow at most one canonical redirect for the exact same resource, never to another host.
            const cleanPath=x=>x.replace(/\/index\.html$/i,'/').replace(/\/$/,'')||'/';
            if(to.origin!==site||to.username||to.password||to.search||to.hash||
               cleanPath(to.pathname)!==cleanPath(from.pathname)||to.href===url){
                observe(to.origin===site?'redirect-path':to.hostname===from.hostname?'redirect-scheme':'redirect-external');
                void r.body?.cancel().catch(()=>{});return '';
            }
            void r.body?.cancel().catch(()=>{}); r=await fetcher.call(globalThis,to.href,opts);
        }
        observe(r.status+(type.test(r.headers.get('content-type')||'')?'':'m'));
        if(!r.ok||!r.body||!type.test(r.headers.get('content-type')||'')){
            void r.body?.cancel().catch(()=>{});return '';
        }
        const reader=r.body.getReader(), decoder=new TextDecoder();
        let out='',size=0;
        try{
            while(size<limit){
                const {value,done}=await reader.read();
                if(done)break;
                out+=decoder.decode(value.subarray(0,limit-size),{stream:true});
                size+=value.length;
            }
            return out+decoder.decode();
        }finally{void reader.cancel().catch(()=>{});}
    }catch(e){observe(signal.aborted?'timeout':(/illegal invocation/i.test(e?.message||'')?'binding':/network|fetch|dns/i.test(e?.message||'')?'network':/redirect/i.test(e?.message||'')?'redirect':e?.name||'error'));return '';}
}
function words(s){
    return s.replace(/&#(x[\da-f]{1,6}|\d{1,7});/ig,(_,v)=>{
        const n=v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v);
        return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';
    }).replace(/&(amp|lt|gt|quot|apos|nbsp);/ig,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[n.toLowerCase()])
    .replace(/\s+/gu,' ').trim();
}
const hidden=s=>/\bIR[-\s]?CS\d/iu.test(s);
export function evidenceFromHtml(page,query){
    const title=words(page.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').slice(0,140);
    const plain=page.replace(/<!--[\s\S]*?(?:-->|$)/g,' ')
      .replace(/<(script|style|noscript|template|nav|footer|svg)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,' ')
      .replace(/<meta\b[^>]*>/gi,m=>/\bname=["']description["']/i.test(m)
        ?'|#|'+(m.match(/\bcontent=(?:"([^"]*)"|'([^']*)')/i)?.slice(1).find(Boolean)||'')+'|#|':' ')
      .replace(/<\/(?:p|li|h[1-6]|td|section|article|button|label|title|div)>/gi,'|#|')
      .replace(/<[^>]*>/g,' ');
    const wanted=[...new Set(terms(query))].slice(0,32);
    const chunks=plain.split('|#|').map(words).filter(x=>x.length>=12&&!hidden(x))
      .flatMap(p=>p.match(/.{1,600}(?:\s|$)|.{1,600}/gu)||[]);
    const ranked=chunks.map(body=>({body,score:wanted.reduce((sum,t)=>sum+(body.toLowerCase().includes(t)?t.length:0),0)}))
      .filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    const body=[...new Set(ranked.slice(0,4).map(x=>x.body.trim()))].join(' | ').slice(0,1800);
    return body&&!hidden(title)?{title:title||'InoRobot Assistant',body}:null;
}
const hubs=[
 ['1_RobotModelSelect',/모델|사양|가반|리치|스카라|scara|reach|payload|model|型号|负载/i],
 ['2_3DSimulation',/시뮬레|3d simulation|simulator|仿真|mô phỏng|simülasyon|симулятор/i],
 ['3_ToolSelector',/툴\s*선택|물성|무게중심|mode\s*d\b|tool\s*select|inertia|mass properties/i],
 ['4_ProjectGenerator',/프로젝트\s*생성|project\s*generator|项目生成/i],
 ['5_Software',/소프트웨어|펌웨어|software|firmware|inorobotlab|inorobottp|imc100|固件/i],
 ['6_Document',/문서|교육|매뉴얼|인증서|cad|도면|manual|documentation|training|certificate|图纸|手册/i],
 ['7_DebuggingTool',/디버깅|진단|디버거|debug|diagnos|로봇\s*트레이스|zerocalibration|robottrace/i],
 ['Servo',/서보|\bservo\b|伺服/i]
];
export async function liveEvidence(question,retry,hints,allowed,outer,fetcher=fetch,observe=()=>{}){
    if(outer.aborted)return [];
    const signal=AbortSignal.any([outer,AbortSignal.timeout(3200)]);
    const context=question+' '+retry, model=question.match(exactModel)?.[0].toUpperCase()||'';
    const wanted=[...new Set(terms(context))].filter(x=>x.length>=3).slice(0,32);
    const choices=new Map(),add=(u,s)=>{
        const url=urlFor(u,model,allowed);
        if(url)choices.set(url,Math.max(s,choices.get(url)||0));
    };
    if(allowed.has(model))add(site+'/1_RobotModelSelect/models/'+model+'/',100);
    for(const [path,re] of hubs)if(re.test(context))add(site+'/'+path+'/',42);
    for(const [i,h] of hints.entries())if(!h.curated)add(h.url,Math.max(7,36-i*3));
    const map=await readPage(site+'/sitemap.xml',AbortSignal.any([signal,AbortSignal.timeout(950)]),65536,xml,fetcher,observe);
    for(const loc of map.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)){
        const url=urlFor(words(loc[1]),model,allowed);
        if(!url)continue;
        const p=decodeURIComponent(new URL(url).pathname).toLowerCase();
        const score=wanted.reduce((sum,t)=>sum+(p.includes(t)?t.length*2:0),0);
        if(score>=10)add(url,score);
    }
    const picks=[...choices].sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0]);
    return (await Promise.all(picks.map(async url=>{
        const page=await readPage(url,signal,384*1024,html,fetcher,observe);
        const found=evidenceFromHtml(page,context);
        return found?{...found,url,live:true}:null;
    }))).filter(Boolean);
}
