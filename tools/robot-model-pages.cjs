const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const routes = require('../1_RobotModelSelect/model-pages.js');

const site = 'https://inovancerobot.com';
const generatedNotice = '<!-- Generated model detail: tools/robot-model-pages.cjs; edit data.js and the catalog source instead. -->';
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const encodePath = value => value.split('/').map(encodeURIComponent).join('/');

function browserValue(root, file, expression) {
    const sandbox = {window: {}, document: {addEventListener() {}}, URL};
    const value = vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8') + '\n;' + expression, sandbox, {filename: file});
    return JSON.parse(JSON.stringify(value));
}

function facts(product) {
    const specs = product.specs;
    const detail = product.detailSpecs || {};
    return [
        ['로봇 유형', specs.Type === '6-Axis' ? '6축 로봇' : specs.Type],
        ['가반 하중', specs['Payload(kg)'] && specs['Payload(kg)'] + ' kg'],
        ['리치', specs['Manipulator Length(mm)'] && specs['Manipulator Length(mm)'] + ' mm'],
        ['Z축 길이', specs['Z axis Length(mm)'] && specs['Z axis Length(mm)'] + ' mm'],
        ['클린 사양', specs['Clean Type'] === 'Yes' ? '클린형' : '기본형'],
        ['중공형', specs['Hollow Wrist'] && (specs['Hollow Wrist'] === 'Yes' ? '중공형' : '비중공형')],
        ['중량 (kg)', detail['Weight (kg)'] || detail['Weight (excluding cables) (kg)']],
        ['반복 정밀도 (mm)', detail['Repeatability (mm)'] || detail['Repeatability J1+J2 (mm)']],
        ['방수·방진 등급', detail['IP rating']],
        ['표준 사이클 시간 (s)', detail['Standard cycle time (s)']]
    ].filter(([, value]) => value !== undefined && value !== null && value !== '');
}

function manualId(product) {
    const id = product.id;
    if (product.specs.Type === 'SCARA') {
        if (/^IR-TS/.test(id)) return 'scara_ts_guide';
        if (/^IR-S(?:25|35)-/.test(id)) return 'scara_s25_s35_guide';
        if (/^IR-(?:GS60|S60)-/.test(id)) return 'scara_s60_gs60_guide';
        if (/^IR-S(?:4|7|10)-/.test(id)) return 'scara_s_guide';
    } else {
        if (/^IR-R4H?-/.test(id)) return '6axis_r4_guide';
        if (/^IR-R7H?-/.test(id)) return '6axis_r7_guide';
        if (/^IR-R10-140/.test(id)) return '6axis_r10_140_guide';
        if (/^IR-(?:R10H?-(?:110|120)|R11-)/.test(id)) return '6axis_r10_r11_guide';
        if (/^IR-(?:R15H|R20H)-/.test(id)) return '6axis_r15h_r20h_guide';
        if (/^IR-(?:R16|R25)-/.test(id)) return '6axis_r25_r16_guide';
    }
    return null;
}

function publicResources(root, product, cad, manuals) {
    const resources = [];
    const threeD = cad[product.id]?.threeD;
    const add = (relative, label, download) => {
        const absolute = path.resolve(root, relative);
        if (!absolute.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(absolute)) throw new Error('Missing public model resource: ' + relative);
        resources.push({path: '/' + encodePath(relative.replaceAll('\\','/')), label, download});
    };
    if (threeD) {
        const cadPath = '1_RobotModelSelect/' + threeD;
        const twoD = cadPath.replace(/_3D[^/]*\.(stp|step)$/i, '_2D.dwg');
        if (twoD !== cadPath && fs.existsSync(path.join(root, twoD))) add(twoD, '2D CAD', true);
        add(cadPath, '3D CAD', true);
    }
    const id = manualId(product);
    if (id) {
        const manual = manuals.find(manual => manual.id === id);
        if (!manual) throw new Error('Missing model manual: ' + id);
        add('6_Document/' + manual.path, '하드웨어 매뉴얼', false);
    }
    return resources;
}

function cardHtml(product) {
    const specs = product.specs;
    const image = routes.imagePath(product);
    const extra = specs.Type === 'SCARA'
        ? '<div class="spec-row"><span>Z축 길이 (mm)</span><span class="spec-value">' + escape(specs['Z axis Length(mm)']) + '</span></div>'
        : '<div class="spec-row"><span>중공형</span><span class="spec-value">' + (specs['Hollow Wrist'] === 'Yes' ? '중공형' : '비중공형') + '</span></div>';
    return '<a class="product-card" data-product-id="' + escape(product.id) + '" href="' + routes.modelPath(product.id) + '">' +
        '<img class="product-image" src="' + encodePath(image) + '" alt="' + escape(routes.displayName(product)) + '" loading="lazy" decoding="async" style="min-height:180px">' +
        '<div class="product-name">' + escape(routes.displayName(product)) + '</div><div class="product-specs">' +
        '<div class="spec-row"><span>가반 하중 (kg)</span><span class="spec-value">' + escape(specs['Payload(kg)']) + '</span></div>' +
        '<div class="spec-row"><span>리치 (mm)</span><span class="spec-value">' + escape(specs['Manipulator Length(mm)']) + '</span></div>' + extra + '</div></a>';
}

function replaceMeta(html, attribute, key, value) {
    const expression = new RegExp('(<meta\\s+' + attribute + '="' + key + '"\\s+content=")[^"]*(")', 'i');
    if (!expression.test(html)) throw new Error('Missing model metadata: ' + key);
    return html.replace(expression, (_, open, close) => open + escape(value) + close);
}

function createModelPages(root) {
    const products = browserValue(root, '1_RobotModelSelect/data.js', 'productsData').filter(product => !routes.isHiddenProduct(product));
    const cad = browserValue(root, '1_RobotModelSelect/cad-manifest.js', 'window.InoRobotCadManifest');
    const manuals = browserValue(root, '6_Document/script.js', 'manualData');
    const slugs = new Set();
    for (const product of products) {
        const url = routes.modelPath(product.id);
        if (slugs.has(url)) throw new Error('Duplicate model route: ' + url);
        slugs.add(url);
        if (!fs.existsSync(path.join(root, '1_RobotModelSelect', routes.imagePath(product)))) throw new Error('Missing model image: ' + product.id);
    }
    let catalog = fs.readFileSync(path.join(root, '1_RobotModelSelect/index.html'), 'utf8');
    const marker = /<!-- MODEL-PAGES:CARDS:START -->[\s\S]*?<!-- MODEL-PAGES:CARDS:END -->/;
    if (!marker.test(catalog)) throw new Error('Missing model card build marker');
    catalog = catalog.replace(marker, '<!-- MODEL-PAGES:CARDS:START -->\n' + products.map(cardHtml).join('\n') + '\n<!-- MODEL-PAGES:CARDS:END -->');
    const pages = products.map(product => {
        const url = routes.modelPath(product.id);
        const name = routes.displayName(product);
        const title = name + ' 로봇 사양 및 구성 | INOVANCE';
        const description = name + ', 가반 하중 ' + product.specs['Payload(kg)'] + ' kg, 리치 ' + product.specs['Manipulator Length(mm)'] + ' mm. 로봇 사양과 CAD·하드웨어 매뉴얼을 확인하고 옵션을 구성하세요.';
        const properties = facts(product);
        const resources = publicResources(root, product, cad, manuals);
        const fallback = '<section class="model-static-detail"><div><img src="' + encodePath(routes.imagePath(product)) + '" alt="' + escape(name) + '"></div><div>' +
            '<h2>' + escape(name) + '</h2><dl class="model-static-specs">' +
            properties.map(([label, value]) => '<div><dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd></div>').join('') +
            '</dl><nav class="model-static-resources" aria-label="관련 자료">' +
            resources.map(resource => '<a href="' + escape(resource.path) + '"' + (resource.download ? ' download' : ' target="_blank" rel="noopener"') + '>' + escape(resource.label) + '</a>').join('') +
            '</nav><a class="model-static-back" href="' + routes.catalogPath + '">전체 모델 보기</a></div></section>';
        let html = catalog.replace('<html ', '<html data-model-id="' + escape(product.id) + '" ');
        html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>' + escape(title) + '</title>');
        html = replaceMeta(html, 'name', 'description', description);
        html = replaceMeta(html, 'property', 'og:title', title);
        html = replaceMeta(html, 'property', 'og:description', description);
        html = replaceMeta(html, 'property', 'og:url', site + url);
        html = replaceMeta(html, 'name', 'twitter:title', title);
        html = replaceMeta(html, 'name', 'twitter:description', description);
        html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, (_, open, close) => open + site + url + close);
        html = html.replace(/<h1 class="app-title">[\s\S]*?<\/h1>/, '<span class="app-title">Inovance Robot Select</span>');
        html = html.replace('<h3 id="modal-title">제품 상세 및 구성</h3>', '<h1 id="modal-title">' + escape(name) + ' 로봇 사양 및 구성</h1>');
        html = html.replace(/(id="options-modal"[^>]*style=")display:\s*none;?(")/, '$1display:flex;$2');
        html = html.replace(/(<div class="modal-body" id="modal-body"[^>]*>)[\s\S]*?(<\/div>)/, (_, open, close) => open + fallback + close);
        const schema = {
            '@context':'https://schema.org','@type':'Product',name,sku:product.id,url:site+url,description,
            brand:{'@type':'Brand',name:'INOVANCE'},image:site+'/1_RobotModelSelect/'+encodePath(routes.imagePath(product)),
            additionalProperty:properties.map(([name,value])=>({'@type':'PropertyValue',name,value:String(value)}))
        };
        html = html.replace('</head>', '<script type="application/ld+json" data-model-structured-data>' + JSON.stringify(schema).replaceAll('<','\\u003c') + '</script>\n<noscript><style>#close-modal-btn,#options-modal .modal-footer{display:none!important}</style></noscript>\n</head>');
        return {id:product.id,url,html:generatedNotice+'\n'+html,resources};
    });
    return {catalog,pages};
}

function buildRobotModelPages(root) {
    const result = createModelPages(root);
    fs.writeFileSync(path.join(root, '1_RobotModelSelect/index.html'), result.catalog);
    for (const page of result.pages) {
        const file = path.resolve(root, '.' + page.url, 'index.html');
        const directory = path.join(root, '1_RobotModelSelect/models') + path.sep;
        if (!file.startsWith(directory)) throw new Error('Invalid generated model path');
        if (fs.existsSync(file) && !fs.readFileSync(file,'utf8').startsWith(generatedNotice)) throw new Error('Refusing to overwrite a non-generated model page');
        fs.mkdirSync(path.dirname(file), {recursive:true});
        fs.writeFileSync(file,page.html);
    }
    return result.pages.map(page => page.url);
}

module.exports = {createModelPages,buildRobotModelPages};
