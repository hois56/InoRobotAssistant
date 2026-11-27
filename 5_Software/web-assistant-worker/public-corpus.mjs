const freqStop=new Set('the and for that this from with are was have your how what you can using use does manual robot robots ino inorobot hoi into pdf stp dwg model documentation guide windows'.split(' '));
const seg=new Intl.Segmenter('ko',{granularity:'word'});
export function terms(s){
    const norm=String(s??'').normalize('NFKC').toLowerCase();
    const out=[];
    for(const v of seg.segment(norm)){
        const w=v.segment;
        if(!v.isWordLike||w.length<2||w.length>50||freqStop.has(w)||!/[\p{L}]/u.test(w))continue;
        if(/[\uAC00-\uD7A3\u3400-\u9FFF]/u.test(w)){
            if(w.length>2)out.push(w);
            for(let i=0;i<w.length-1;i++)out.push(w.slice(i,i+2));
        }else out.push(w);
    }
    return out;
}
export function bucket(s){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h&127;}
const alias=[
 [/\uC18C\uCF13|\bsocket\b/iu,'socket TCPIP \uC18C\uCF13'],
 [/\ud615[\ubc88\ubcc0]|\ubaa8\ub378\uba85|\ubaa8\ub378 \ucf54\ub4dc|nomenclature|designation/iu,'model designation nameplate identification naming \ud615\ubc88 \uba85\uba85'],
 [/\ubc18\ubcf5.?\uc815\ubc00\ub3c4|repeatability/iu,'repeatability \ubc18\ubcf5\uc815\ubc00\ub3c4'],
 [/\uac00\ubc18.?\ud558\uc911|\ud398\uc774\ub85c\ub4dc|payload/iu,'payload rated load \uac00\ubc18\ud558\uc911'],
 [/\ub3c4\uba74|drawing|\uce90\ub4dc/iu,'cad drawing step dwg'],
 [/\ud1b5\uc2e0|\ud544\ub4dc\ubc84\uc2a4|fieldbus/iu,'Fieldbus EtherCAT PROFINET \ud1b5\uc2e0'],
 [/\ud39c\ub358\ud2b8|\ud2f0\ud53c|teach pendant/iu,'Pendant InoRobotTP \ud39c\ub358\ud2b8'],
 [/\uad50\uc721.?\uc790\ub8cc|training|tutorial/iu,'education \uad50\uc721 \uc785\ubb38\uacfc\uc815 \ucd08\uae09\uacfc\uc815'],
 [/\uc54c\ub78c|\uc5d0\ub7ec|alarm|fault/iu,'alarm fault \uc5d0\ub7ec \uc54c\ub78c']
];
export async function corpusEvidence(binding,query,prior='',fixedModel=''){
    if(!binding)return [];
    const boost=alias.filter(([r])=>r.test(query)).map(([,s])=>s).join(' ');
    const distinct=[...new Set(terms(query+' '+boost+' '+prior.slice(0,120)))].slice(0,12);
    if(!distinct.length)return [];
    const read=async(p)=>{
        const r=await binding.fetch(new Request('https://assets.local/_kb/'+p+'.json'));
        return r.ok?await r.json():null;
    };
    const bins=new Map(await Promise.all([...new Set(distinct.map(bucket))].map(async i=>[i,await read('terms-'+i)])));
    const scores=new Map();
    for(const k of distinct){
        const entry=bins.get(bucket(k))?.[k];
        if(!entry)continue;
        const [df,...values]=entry;
        const weight=(1+Math.log2(12000/(df+1)))*(/^[a-z0-9]+$/i.test(k)?1.16:1);
        for(let i=0;i<values.length;i+=2){
            const key=values[i], amount=values[i+1];
            const old=scores.get(key)||[0,0];
            scores.set(key,[old[0]+weight*Math.min(2.4,1+0.25*(amount-1)),old[1]+1]);
        }
    }
    const top=[...scores].filter(([,v])=>v[1]>=Math.min(2,distinct.length)).sort((a,b)=>b[1][0]-a[1][0]).slice(0,20);
    const [meta,parts]=await Promise.all([read('docs'),Promise.all([...new Set(top.map(([i])=>Math.floor(i/32)))].slice(0,8).map(async i=>[i,await read('rows-'+i)]))]);
    if(!meta)return [];
    const rows=new Map(parts), result=[], seen=new Set();
    // A matching title should not be outranked by a body paragraph in another document.
    if(/\uAD50\uC721|\uB9E4\uB274\uC5BC|\uC778\uC99D\uC11C|training|manual|user guide|certificate|\bkcs\b/i.test(query)){
        const edu=/\uAD50\uC721|training/i.test(query), socket=/\uC18C\uCF13|\bsocket\b/i.test(query);
        const certificate=/\uC778\uC99D\uC11C|certificate|\bkcs\b/i.test(query);
        const high=/\uACE0\uBC29\uC9C4|high[ -]protection/i.test(query), standard=/\uD45C\uC900|standard/i.test(query);
        const exactCert=certificate&&fixedModel;
        const titleWords=new Set(terms(query+(socket?' socket':'')));
        const titles=meta.map(([url,title,category,lang,body],i)=>{
            const match=[...new Set(terms(title))].filter(t=>titleWords.has(t));
            const categoryMatch=certificate?(url.includes('/Certificate/')&&(!high||url.includes('/High_protection/'))&&(!standard||!url.includes('/High_protection/'))):edu?/%EA%B5%90%EC%9C%A1/i.test(url):/_manual\//i.test(url);
            const strong=match.filter(t=>/^[a-z0-9]{4,}$/i.test(t));
            return {i,url,title,body,score:categoryMatch&&(!exactCert||url.toUpperCase().includes('/'+fixedModel+'.PDF'))&&(!socket||/\bsocket\b/i.test(title))?match.length+4*strong.length:0};
        }).filter(x=>x.score>=3).sort((a,b)=>b.score-a.score).slice(0,2);
        for(const {i,url,title,body} of titles){
            result.push({url,title,page:0,body:body||title});
            seen.add(i+':0');
        }
    }
    for(const [i] of top){
        const v=rows.get(Math.floor(i/32))?.[i%32];
        if(!v)continue;
        const [d,page,rawBody,ocr]=v, body=ocr?'OCR text: use as navigation only if technical numbers or instructions are uncertain. '+rawBody:rawBody, [url,title]=meta[d];
        if(fixedModel&&/\uC778\uC99D\uC11C|certificate|\bkcs\b/i.test(query)&&(!url.includes('/Certificate/')||!url.toUpperCase().includes('/'+fixedModel+'.PDF')))continue;
        if(fixedModel&&/\/models\//i.test(url)&&!url.toUpperCase().includes('/'+fixedModel+'/'))continue;
        const key=d+':'+page;
        if(seen.has(key))continue;
        seen.add(key);
        result.push({url,title,page,body});
        if(result.length===5)break;
    }
    return result;
}
