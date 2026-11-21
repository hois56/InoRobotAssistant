import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../../',import.meta.url));
const routes=require('../../1_RobotModelSelect/model-pages.js');
const configurationWorkbook = require('../../1_RobotModelSelect/configuration-workbook.js');
const {createModelPages}=require('../../tools/robot-model-pages.cjs');
const generated=createModelPages(root);

test('구매 코드가 여러 용도에 사용되어도 필수 케이블을 로봇 대수에 더하지 않고 미정 코드는 개별 행으로 둔다', () => {
    const row = (kind, code, modelNumber, quantity) => ({kind, code, modelNumber, quantity, type:kind, details:''});
    const report = configurationWorkbook.createReport([
        row('robot','001*10','R4H',2), row('option','0010','PN',1),
        row('robot','-','R4H Clean',3), row('cable','001*10','Base cable',3),
        row('robot','-','R4H IP67',1), row('cable','001*10','Base cable',1),
        row('option','0010','PN',2), row('option','010','Other',1)
    ], key => key);
    assert.equal(report.robotQuantity,6);
    assert.equal(report.configurationCount,3);
    const items = report.rows.map(row => row.values);
    assert.deepEqual(items.map(row => [row[2],row[5]]), [['001*10',6], ['-',3], ['-',1], ['0010',3], ['010',1]]);
    assert.equal(items[0][6], '본체 (필수) × 2\n케이블 (필수) × 4');
    const files = configurationWorkbook.buildFiles(report);
    assert.ok(files['xl/worksheets/sheet1.xml'].includes('SUMIF($G$5:$G$9,&quot;본체 (필수)&quot;,$F$5:$F$9)+2</f><v>6</v>'));
    assert.ok(files['xl/workbook.xml'].includes('$A$1:$G$9'));
});

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
    assert.equal((generated.catalog.match(/class="product-card"/g)||[]).length,29);
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
    for (const page of generated.pages.filter(page => /Z\d+C-INT$/.test(page.id))) {
        assert.ok(page.html.includes('<dt>클린 사양</dt><dd>클린형 (ISO Class 4)</dd>'), page.id);
    }
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

test('정적 사양에 모델별 손목 허용 토크와 미기재 여부를 표시한다',()=>{
    const page = id => generated.pages.find(page => page.id === id).html;
    for (const [id, values] of [['IR-R4H-54S-INT',['8.86','8.86','4.9']], ['IR-R25-178S-INT',['50','50','30']]]) {
        values.forEach((value,i) => assert.ok(page(id).includes('<dt>허용 토크 (J'+(4+i)+')</dt><dd>'+value+' N·m</dd>')));
    }
    for (const id of ['IR-S4-40Z15S-INT','IR-S4-40Z12C-INT','IR-TS5-55Z15S-INT']) {
        assert.ok(page(id).includes('<dt>허용 토크 (J4)</dt><dd>사양표 미기재</dd>'));
    }
});

test('반복 생성해도 목록과 상세 페이지의 내용이 바뀌지 않으며 사이트맵에 모든 실제 주소를 포함한다',()=>{
    const repeated=createModelPages(root);
    assert.equal(repeated.catalog,generated.catalog);
    assert.deepEqual(repeated.pages.map(page=>page.html),generated.pages.map(page=>page.html));
    const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
    for(const page of generated.pages)assert.ok(sitemap.includes('<loc>https://inovancerobot.com'+page.url+'</loc>'));
});
