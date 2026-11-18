import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../../',import.meta.url));
const routes=require('../../1_RobotModelSelect/model-pages.js');
const {createModelPages}=require('../../tools/robot-model-pages.cjs');
const generated=createModelPages(root);

test('표시 중인 42개 모델의 고유 주소·사양·자기 canonical을 정적 HTML에 생성한다',()=>{
    assert.equal(generated.pages.length,42);
    assert.equal(new Set(generated.pages.map(page=>page.url)).size,42);
    for(const page of generated.pages){
        assert.equal(page.url,routes.modelPath(page.id));
        assert.equal(page.url,'/1_RobotModelSelect/models/'+page.id+'/');
        assert.ok(fs.readdirSync(path.join(root,'1_RobotModelSelect/models')).includes(page.id));
        assert.ok(page.html.includes('<h1 id="modal-title">'+page.id+' 로봇 사양 및 구성</h1>'));
        assert.ok(page.html.includes('href="https://inovancerobot.com'+page.url+'"'));
        assert.ok(page.html.includes('class="model-static-specs"'));
        assert.ok(page.html.includes('data-model-id="'+page.id+'"'));
        assert.ok(!page.id.startsWith('IR-CS'));
        assert.ok(fs.existsSync(path.join(root,'.'+page.url,'index.html')));
    }
});

test('모델 목록은 JS 없이도 모든 공개 모델 주소를 링크하고 사양·자료는 원본에 있는 파일만 사용한다',()=>{
    assert.equal((generated.catalog.match(/<a class="product-card"/g)||[]).length,42);
    for(const page of generated.pages){
        assert.ok(generated.catalog.includes('href="'+page.url+'"'));
        assert.ok(page.resources.some(resource=>resource.label==='하드웨어 매뉴얼'));
        for(const resource of page.resources){
            assert.ok(!resource.path.includes('..'));
            assert.ok(fs.existsSync(path.join(root,decodeURIComponent(resource.path.slice(1)))));
        }
    }
    const r4=generated.pages.find(page=>page.id==='IR-R4H-54S-INT');
    assert.ok(r4.html.includes('545.7 mm'));
    assert.ok(r4.html.includes('4 kg'));
    const clean=generated.pages.find(page=>page.id==='IR-S25-100Z36C-INT');
    assert.ok(clean.html.includes('360 mm'));
    assert.ok(clean.html.includes('클린형'));
});

test('모델 주소 해석은 실제 공개 ID만 허용하고 잘못된 값은 안전하게 무시한다',()=>{
    const products=generated.pages.map(page=>({id:page.id,name:page.id,specs:{Type:'6-Axis'}}));
    assert.equal(routes.productFromUrl('/1_RobotModelSelect/models/ir-r4h-54s-int/',products).id,'IR-R4H-54S-INT');
    assert.equal(routes.productFromUrl('/1_RobotModelSelect/?model=IR-R4H-54S-INT',products).id,'IR-R4H-54S-INT');
    assert.equal(routes.productFromUrl('/1_RobotModelSelect/models/%ZZ/',products),null);
    assert.equal(routes.productFromUrl('/1_RobotModelSelect/?model=not-a-model',products),null);
    assert.equal(routes.modelPath('ir-r4h-54s-int'),'/1_RobotModelSelect/models/IR-R4H-54S-INT/');
    assert.throws(()=>routes.modelPath('../outside'));
});

test('반복 생성해도 목록과 상세 페이지의 내용이 바뀌지 않으며 사이트맵에 모든 실제 주소를 포함한다',()=>{
    const repeated=createModelPages(root);
    assert.equal(repeated.catalog,generated.catalog);
    assert.deepEqual(repeated.pages.map(page=>page.html),generated.pages.map(page=>page.html));
    const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
    for(const page of generated.pages)assert.ok(sitemap.includes('<loc>https://inovancerobot.com'+page.url+'</loc>'));
});
