/* Shared model identity and asset paths for static pages and the configurator. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.InoRobotModelPages = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    const catalogPath = '/1_RobotModelSelect/';
    const routePrefix = catalogPath + 'models/';
    const scaraCleanClass = 'ISO Class 4';

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
    }

    function isHiddenProduct(product) {
        return product?.specs?.Type === 'SCARA' && String(product.name || '').toUpperCase().startsWith('IR-CS');
    }

    function subtype(product) {
        if (isHiddenProduct(product)) return '경제형';
        if (product.specs['Clean Type'] === 'Yes') return '클린형';
        if (product.specs.Type === 'SCARA' && /^IR-TS[45]-/i.test(product.id)) return '천장형';
        return '일반형';
    }

    function groupCatalogProducts(products) {
        const groups = new Map();
        for (const product of products) {
            // Keep the series, reach and suffix. The Z stroke can differ between bodies.
            const key = product.specs.Type === 'SCARA' ? product.id.replace(/Z\d+[SC](?=-|$)/i, '') : product.id;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(product);
        }
        return Array.from(groups.values()).flatMap(group => {
            const standard = group.find(product => product.specs['Clean Type'] === 'No');
            const clean = group.find(product => product.specs['Clean Type'] === 'Yes');
            return group.length === 2 && standard && clean ? [[standard, clean]] : group.map(product => [product]);
        });
    }

    function modelPath(id) {
        const slug = String(id || '').toUpperCase();
        if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(slug)) throw new Error('Invalid robot model ID');
        return routePrefix + slug + '/';
    }

    function productFromUrl(input, products) {
        let url;
        try { url = new URL(input, 'https://inovancerobot.com'); } catch { return null; }
        const match = url.pathname.match(/^\/1_RobotModelSelect\/models\/([^/]+)(?:\/(?:index\.html)?)?$/i);
        let id = url.searchParams.get('model');
        if (match) {
            try { id = decodeURIComponent(match[1]); } catch { return null; }
        }
        if (!id) return null;
        return products.find(product => !isHiddenProduct(product) && product.id.toLowerCase() === id.toLowerCase()) || null;
    }

    function displayName(product) {
        return product.specs?.Type === 'SCARA' ? product.id : String(product.name || product.id);
    }

    function imagePath(product) {
        const name = product.name.toUpperCase();
        const clean = product.specs['Clean Type'] === 'Yes';
        let image = 'robot.png';
        if (product.specs.Type === 'SCARA') {
            if (name.includes('TS4')) image = 'IR-TS4.png';
            else if (name.includes('TS5')) image = 'IR-TS5.png';
            else if (name.includes('S4')) image = clean ? 'IR-S4_Clean.png' : 'IR-S4.png';
            else if (name.includes('S7')) {
                if (clean && name.includes('-50')) image = 'IR-S7-50_Clean.png';
                else if (clean && name.includes('-60')) image = 'IR-S7-60_Clean.png';
                else if (clean && name.includes('-70')) image = 'IR-S7-70_Clean.png';
                else image = 'IR-S7.png';
            } else if (name.includes('S10')) {
                if (clean && name.includes('-60')) image = 'IR-S10-60_Clean.png';
                else if (clean && name.includes('-70')) image = 'IR-S10-70_Clean.png';
                else if (clean && name.includes('-80')) image = 'IR-S10-80_Clean.png';
                else image = 'IR-S10.png';
            } else if (name.includes('S25')) image = clean ? 'IR-S25-Clean.png' : 'IR-S25.png';
            else if (name.includes('S35')) {
                if (name.includes('-80')) image = clean ? 'IR-S35-80_Clean.png' : 'IR-S35-80.png';
                else image = clean ? 'IR-S35-100_Clean.png' : 'IR-S35-100.png';
            } else if (name.includes('S60')) image = 'IR-S60.png';
            else image = 'scara_std.png';
        } else {
            const matches = [
                ['IR-R4H','IR-R4H.png'],['IR-R4','IR-R4.png'],['IR-R7H','IR-R7H.png'],
                ['IR-R10-110','IR-R10-110.png'],['IR-R10-140','IR-R10-140.png'],
                ['IR-R10H-120','IR-R10H-120.png'],['IR-R11','IR-R11.png'],['IR-R15H','IR-R15H.png'],
                ['IR-R16','IR-R16.png'],['IR-R20H','IR-R20H.png'],['IR-R25','IR-R25.png']
            ];
            image = matches.find(([prefix]) => name.includes(prefix))?.[1] || 'axis6_std.png';
        }
        return 'Model_image/' + image;
    }

    function formatSpecWithUnit(value, unit) {
        const text = String(value ?? '').trim();
        if (!text || text === '-') return '-';
        return text.endsWith(unit) ? text : `${text} ${unit}`;
    }

    function wristTorqueSpecs(product, translate = value => value) {
        // SCARA manuals list J4 load inertia separately from base reaction and fastener torques.
        const axes = product.specs.Type === 'SCARA' ? ['J4'] : ['J4', 'J5', 'J6'];
        return axes.map(axis => {
            const value = product.detailSpecs?.[`Allowed wrist torque ${axis} (N·m)`];
            const torque = formatSpecWithUnit(value, 'N·m');
            return [`${translate('허용 토크')} (${axis})`, torque === '-' ? translate('사양표 미기재') : torque];
        });
    }

    function scaraComparisonHtml(variants, translate) {
        const cell = (variant, text, heading = false) => {
            const value = escapeHtml(text);
            if (variants.length === 1) return value;
            // One keyboard stop per variant. Its numeric cells open the same model.
            return `<a href="${modelPath(variant.id)}"${heading ? '' : ' tabindex="-1"'}>${value}</a>`;
        };
        const headers = variants.map(variant => `<th scope="col">${cell(variant, translate(subtype(variant)), true)}</th>`);
        const row = (label, unit, readValue) => {
            const values = variants.map(variant => `<td>${cell(variant, formatSpecWithUnit(readValue(variant), unit))}</td>`);
            return `<tr><th scope="row">${escapeHtml(translate(label))}</th>${values.join('')}</tr>`;
        };
        return `<table class="scara-comparison"><thead><tr><th scope="col">${escapeHtml(translate('사양'))}</th>${headers.join('')}</tr></thead><tbody>` +
            row('Z축 길이', 'mm', variant => variant.specs['Z axis Length(mm)']) +
            row('표준 사이클 시간', 's', variant => variant.detailSpecs?.['Standard cycle time (s)']) + '</tbody></table>';
    }

    function catalogCardHtml(variants, product = variants[0], translate = value => value) {
        const specs = product.specs;
        const paired = variants.length > 1;
        const row = (label, value) => `<div class="spec-row"><span>${escapeHtml(label)}</span><span class="spec-value">${escapeHtml(value || '-')}</span></div>`;
        const rows = [
            row(translate('가반 하중 (kg)'), specs['Payload(kg)']),
            row(translate('리치 (mm)'), specs['Manipulator Length(mm)'])
        ];
        if (specs.Type === 'SCARA') {
            rows.push(scaraComparisonHtml(variants, translate));
        } else {
            const wrist = specs['Hollow Wrist'];
            const wristLabel = {Yes: '중공형', No: '비중공형'}[wrist] || wrist || '-';
            rows.push(row(translate('중공형'), translate(wristLabel)));
            rows.push(row(translate('반복 정밀도'), formatSpecWithUnit(product.detailSpecs?.['Repeatability (mm)'], 'mm')));
        }

        const name = escapeHtml(displayName(product));
        const href = modelPath(product.id);
        const title = paired ? `<a class="product-main-link" href="${href}">${name}</a>` : name;
        const contents = `<img class="product-image" src="${imagePath(product)}" alt="${name}" loading="lazy" decoding="async" style="min-height:180px">` +
            `<div class="product-name">${title}</div><div class="product-specs">${rows.join('')}</div>`;
        const attrs = `class="product-card" data-product-id="${escapeHtml(product.id)}"`;
        return paired ? `<article ${attrs}>${contents}</article>` : `<a ${attrs} href="${href}">${contents}</a>`;
    }

    return Object.freeze({catalogPath, routePrefix, modelPath, productFromUrl, displayName, imagePath, isHiddenProduct,
        scaraCleanClass, escapeHtml, subtype, groupCatalogProducts, catalogCardHtml, formatSpecWithUnit, wristTorqueSpecs});
});
