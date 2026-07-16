document.addEventListener('DOMContentLoaded', () => {
    const uiText = (value) => window.InoRobotI18n
        ? window.InoRobotI18n.translate(String(value))
        : String(value);
    const localizeDisplayText = (value) => {
        const source = String(value ?? '');
        const exact = uiText(source);
        if (exact !== source) return exact;
        return ['클린 사양 없음', 'Option :'].reduce(
            (text, fragment) => text.replaceAll(fragment, uiText(fragment)),
            source
        );
    };
    const formatAxisLabel = (axis) => {
        const source = String(axis ?? '');
        if (source.includes('합산 속도') || source.endsWith(' 사양')) return uiText(source);
        return `${source} ${uiText('사양')}`;
    };
    const filterContainer = document.getElementById('filter-container');
    const productContainer = document.getElementById('product-container');
    const resetBtn = document.getElementById('reset-btn');

    // Modal elements
    const modalOverlay = document.getElementById('options-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const downloadPdfBtn = document.getElementById('download-pdf-btn');
    const modalBody = document.getElementById('modal-body');

    let currentActiveProduct = null;

    let state = {
        filters: JSON.parse(JSON.stringify(filtersData)),
        products: JSON.parse(JSON.stringify(productsData)),
        accessories: (typeof accessoriesList !== 'undefined') ? JSON.parse(JSON.stringify(accessoriesList)) : []
    };

    // Initialize Sub Type for each product
    state.products.forEach(product => {
        if (!product || !product.specs) return;
        const name = product.name.toUpperCase();
        const isClean = product.specs['Clean Type'] === 'Yes';
        let sub = '일반형';

        if (name.includes('IR-CS')) {
            sub = '경제형';
        } else if (isClean) {
            sub = '클린형';
        } else if (product.specs.Type === 'SCARA' && (name.includes('TS4') || name.includes('TS5'))) {
            sub = '천장형';
        }
        
        product.specs['Sub Type'] = sub;
    });

    function isModelMatch(targetStr, robotName) {
        if (!targetStr || targetStr.toLowerCase() === 'all') return true;
        const targets = targetStr.split(',').map(t => t.trim().toUpperCase());
        const name = robotName.toUpperCase();
        return targets.some(t => {
            if (t === 'ALL') return true;
            if (t.includes('(ALL)')) {
                const prefix = t.replace('(ALL)', '').trim();
                return name.includes(prefix);
            }
            return name.includes(t);
        });
    }

    function isHiddenProduct(product) {
        return product?.specs?.Type === 'SCARA' && String(product.name || '').toUpperCase().startsWith('IR-CS');
    }

    function renderFilters() {
        filterContainer.innerHTML = '';

        const activeConstraints = {};
        state.filters.forEach(cat => {
            const selectedOpts = cat.options.filter(o => o.isSelected).map(o => o.id);
            if (selectedOpts.length > 0) {
                activeConstraints[cat.id] = selectedOpts;
            }
        });

        state.filters.forEach(filterCategory => {
            const row = document.createElement('div');
            row.className = 'filter-row';

            const labelArea = document.createElement('div');
            labelArea.className = 'filter-label';
            labelArea.textContent = uiText(filterCategory.label);

            const optionsArea = document.createElement('div');
            optionsArea.className = 'filter-options';

            let hasVisibleOptions = false;

            filterCategory.options.forEach(opt => {
                if (filterCategory.id === 'Sub Type' && opt.id === '경제형') return;

                let isValid = false;

                if (opt.isSelected) {
                    isValid = true;
                } else {
                    isValid = state.products.some(p => {
                        if (isHiddenProduct(p)) return false;
                        if (String(p.specs[filterCategory.id]) !== opt.id) return false;

                        for (const catId in activeConstraints) {
                            if (catId === filterCategory.id) continue;
                            const productVal = String(p.specs[catId]);
                            if (!activeConstraints[catId].includes(productVal)) {
                                return false;
                            }
                        }
                        return true;
                    });
                }

                if (!isValid) return;
                hasVisibleOptions = true;

                const btn = document.createElement('button');
                btn.className = opt.isSelected ? 'filter-option active' : 'filter-option';
                btn.textContent = uiText(opt.label);
                btn.addEventListener('click', () => {
                    toggleFilter(filterCategory.id, opt.id, !opt.isSelected);
                });
                optionsArea.appendChild(btn);
            });

            if (hasVisibleOptions) {
                row.appendChild(labelArea);
                row.appendChild(optionsArea);
                filterContainer.appendChild(row);
            }
        });
    }

    function renderProducts() {
        productContainer.innerHTML = '';

        const activeConstraints = {};
        state.filters.forEach(cat => {
            const selectedOpts = cat.options.filter(o => o.isSelected).map(o => o.id);
            if (selectedOpts.length > 0) {
                activeConstraints[cat.id] = selectedOpts;
            }
        });

        const filteredProducts = state.products.filter(product => {
            if (isHiddenProduct(product)) return false;

            for (const catId in activeConstraints) {
                const productVal = String(product.specs[catId]);
                if (!activeConstraints[catId].includes(productVal)) {
                    return false;
                }
            }
            return true;
        });

        if (filteredProducts.length === 0) {
            productContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted)">${uiText('현재 필터 규칙에 맞는 모델이 없습니다.')}</div>`;
            return;
        }

        filteredProducts.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';

            const name = product.name.toUpperCase();
            const isClean = product.specs['Clean Type'] === 'Yes';
            let scaraSubtype = '일반형';
            let img = 'robot.png';

            if (product.specs.Type === 'SCARA') {
                scaraSubtype = product.specs['Sub Type'];

                // 이미지 선택 로직 (SCARA)
                if (name.includes('TS4')) img = 'IR-TS4.png';
                else if (name.includes('TS5')) img = 'IR-TS5.png';
                else if (name.includes('S4')) {
                    img = isClean ? 'IR-S4_Clean.png' : 'IR-S4.png';
                } else if (name.includes('S7')) {
                    if (isClean && name.includes('-50')) img = 'IR-S7-50_Clean.png';
                    else if (isClean && name.includes('-60')) img = 'IR-S7-60_Clean.png';
                    else if (isClean && name.includes('-70')) img = 'IR-S7-70_Clean.png';
                    else img = 'IR-S7.png';
                } else if (name.includes('S10')) {
                    if (isClean && name.includes('-60')) img = 'IR-S10-60_Clean.png';
                    else if (isClean && name.includes('-70')) img = 'IR-S10-70_Clean.png';
                    else if (isClean && name.includes('-80')) img = 'IR-S10-80_Clean.png';
                    else img = 'IR-S10.png';
                } else if (name.includes('S25')) {
                    img = isClean ? 'IR-S25-Clean.png' : 'IR-S25.png';
                } else if (name.includes('S35')) {
                    // 암 길이 매칭 로직
                    if (name.includes('-80')) {
                        img = isClean ? 'IR-S35-80_Clean.png' : 'IR-S35-80.png';
                    } else if (name.includes('-100') || name.includes('-120')) {
                        // 120은 100의 이미지 공유
                        img = isClean ? 'IR-S35-100_Clean.png' : 'IR-S35-100.png';
                    } else {
                        img = isClean ? 'IR-S35-100_Clean.png' : 'IR-S35-100.png';
                    }
                } else if (name.includes('S60')) img = 'IR-S60.png';
                else img = 'scara_std.png';
            } else {
                // 6축 로봇 이미지 선택
                if (name.includes('IR-R4H')) img = 'IR-R4H.png';
                else if (name.includes('IR-R4')) img = 'IR-R4.png';
                else if (name.includes('IR-R7H')) img = 'IR-R7H.png';
                else if (name.includes('IR-R10-110')) img = 'IR-R10-110.png';
                else if (name.includes('IR-R10-140')) img = 'IR-R10-140.png';
                else if (name.includes('IR-R10H-120')) img = 'IR-R10H-120.png';
                else if (name.includes('IR-R11')) img = 'IR-R11.png';
                else if (name.includes('IR-R15H')) img = 'IR-R15H.png';
                else if (name.includes('IR-R16')) img = 'IR-R16.png';
                else if (name.includes('IR-R20H')) img = 'IR-R20H.png';
                else if (name.includes('IR-R25')) img = 'IR-R25.png';
                else img = 'axis6_std.png';
            }

            product.image = 'Model_image/' + img;

            // Rename SCARA clean types
            let displayName = product.name;
            if (product.specs.Type === 'SCARA' && product.specs['Clean Type'] === 'Yes') {
                // e.g. IR-TS4-35Z15S-INT (Clean Type) -> IR-TS4-35Z12C-INT
                displayName = displayName.replace(/\s*\(Clean Type\)\s*/gi, '');
                displayName = displayName.replace(/Z(\d+)([S])/gi, (match, p1, p2) => {
                    let newNum = parseInt(p1) - 3;
                    return 'Z' + newNum + 'C';
                });
            }

            let extraSpecsHTML = '';
            if (product.specs.Type === 'SCARA') {
                extraSpecsHTML = `
                    <div class="spec-row">
                        <span>${uiText('타입')}</span>
                        <span class="spec-value">${uiText(scaraSubtype)}</span>
                    </div>
                    <div class="spec-row">
                        <span>${uiText('Z축 길이 (mm)')}</span>
                        <span class="spec-value">${product.specs['Z axis Length(mm)'] || '-'}</span>
                    </div>
                `;
            } else if (product.specs.Type === '6-Axis') {
                extraSpecsHTML = `
                    <div class="spec-row">
                        <span>${uiText('중공형')}</span>
                        <span class="spec-value">${uiText(product.specs['Hollow Wrist'] || '-')}</span>
                    </div>
                `;
            }

            card.innerHTML = `
                <img src="${product.image}" alt="${product.name}" class="product-image" style="pointer-events:none; min-height:180px;">
                <div class="product-name" style="pointer-events:none;">${displayName}</div>
                <div class="product-specs" style="pointer-events:none;">
                    <div class="spec-row">
                        <span>${uiText('가반 하중 (kg)')}</span>
                        <span class="spec-value">${product.specs['Payload(kg)'] || '-'}</span>
                    </div>
                    <div class="spec-row">
                        <span>${uiText('리치 (mm)')}</span>
                        <span class="spec-value">${product.specs['Manipulator Length(mm)'] || '-'}</span>
                    </div>
                    ${extraSpecsHTML}
                </div>
            `;

            card.addEventListener('click', () => {
                openOptionsModal(product.id);
            });
            productContainer.appendChild(card);
        });
    }

    function toggleFilter(categoryId, optionId, forceState) {
        const category = state.filters.find(c => c.id === categoryId);
        if (!category) return;
        const option = category.options.find(o => o.id === optionId);
        if (!option) return;

        option.isSelected = forceState;

        const activeConstraints = {};
        state.filters.forEach(cat => {
            const selectedOpts = cat.options.filter(o => o.isSelected).map(o => o.id);
            if (selectedOpts.length > 0) activeConstraints[cat.id] = selectedOpts;
        });

        state.filters.forEach(cat => {
            cat.options.forEach(opt => {
                if (opt.isSelected) {
                    let isValid = state.products.some(p => {
                        if (isHiddenProduct(p)) return false;
                        if (String(p.specs[cat.id]) !== opt.id) return false;
                        for (const cId in activeConstraints) {
                            if (cId === cat.id) continue;
                            if (!activeConstraints[cId].includes(String(p.specs[cId]))) return false;
                        }
                        return true;
                    });
                    if (!isValid) opt.isSelected = false;
                }
            });
        });

        renderFilters();
        renderProducts();
    }

    resetBtn.addEventListener('click', () => {
        state.filters.forEach(cat => {
            cat.options.forEach(opt => opt.isSelected = false);
        });
        renderFilters();
        renderProducts();
    });

    function parseLen(l) {
        if (!l || l === 'N/A') return 999;
        let num = parseFloat(l.replace('m', ''));
        return isNaN(num) ? 999 : num;
    }

    function getSpecUnit(specKey) {
        const match = String(specKey || '').match(/\(([^)]+)\)\s*$/);
        return match ? match[1] : '';
    }

    function formatAxisSpecValue(value, specKey) {
        const text = (value === undefined || value === null || value === '') ? '-' : String(value).trim();
        if (text === '-') return text;

        const unit = getSpecUnit(specKey);
        if (!unit) return text;

        if (unit === '°') {
            if (text.includes('°')) return text;
            return text.replace(/([+-]?\d+(?:\.\d+)?)(?!\s*°)/g, '$1°');
        }

        if (unit === '°/s') {
            return /°\s*\/\s*s/i.test(text) ? text : `${text}°/s`;
        }

        if (unit === 'mm/s') {
            return /mm\s*\/\s*s/i.test(text) ? text : `${text} mm/s`;
        }

        if (unit === 'mm') {
            return /\bmm\b/i.test(text) ? text : `${text} mm`;
        }

        return text.includes(unit) ? text : `${text} ${unit}`;
    }

    const technicalSpecsMap = {
        'R4-56': {
            repeatability: '±0.01 mm',
            signals: '12 Signal lines 30V 0.5A',
            air: 'Φ4mm x 4, 0.59 MPa',
            ip: 'IP20',
            weight: '24 kg',
            axes: [
                { axis: 'J1', speed: '450°/s', range: '±170°' },
                { axis: 'J2', speed: '460°/s', range: '-120°/+110°' },
                { axis: 'J3', speed: '520°/s', range: '-69°/+205°' },
                { axis: 'J4', speed: '560°/s', range: '±190°' },
                { axis: 'J5', speed: '560°/s', range: '±120°' },
                { axis: 'J6', speed: '900°/s', range: '±360°' }
            ]
        },
        'R4H-54': {
            repeatability: '±0.02 mm',
            signals: '12 Signal lines 30V 0.5A; 8 signal lines 30V 0.2A',
            air: 'Φ4mm x 4, 0.59 MPa',
            ip: 'IP20',
            weight: '24.5 kg',
            axes: [
                { axis: 'J1', speed: '450°/s', range: '±170°' },
                { axis: 'J2', speed: '460°/s', range: '-120°/+110°' },
                { axis: 'J3', speed: '520°/s', range: '-65°/+195°' },
                { axis: 'J4', speed: '560°/s', range: '±190°' },
                { axis: 'J5', speed: '560°/s', range: '±120°' },
                { axis: 'J6', speed: '900°/s', range: '±360°' }
            ]
        },
        'R7H-70': {
            repeatability: '±0.015 mm',
            signals: '17 Signal lines 30V 0.5A; 8 Signal lines 30V 0.2A',
            air: 'Φ4mm x 4, 0.59 MPa',
            ip: 'IP20',
            weight: '31 kg',
            axes: [
                { axis: 'J1', speed: '420°/s', range: '±170°' },
                { axis: 'J2', speed: '336°/s', range: '-135°/+80°' },
                { axis: 'J3', speed: '487°/s', range: '-70°/+190°' },
                { axis: 'J4', speed: '550°/s', range: '±190°' },
                { axis: 'J5', speed: '438°/s', range: '±120°' },
                { axis: 'J6', speed: '764.7°/s', range: '±360°' }
            ]
        },
        'R7H-90': {
            repeatability: '±0.02 mm',
            signals: '17 Signal lines 30V 0.5A; 8 Signal lines 30V 0.2A',
            air: 'Φ4mm x 4, 0.59 MPa',
            ip: 'IP20',
            weight: '33 kg',
            axes: [
                { axis: 'J1', speed: '336°/s', range: '±170°' },
                { axis: 'J2', speed: '280°/s', range: '-135°/+80°' },
                { axis: 'J3', speed: '390°/s', range: '-70°/+190°' },
                { axis: 'J4', speed: '550°/s', range: '±190°' },
                { axis: 'J5', speed: '438°/s', range: '±120°' },
                { axis: 'J6', speed: '764.7°/s', range: '±360°' }
            ]
        },
        'R10-110': {
            repeatability: '±0.02 mm',
            signals: '12 Signal lines 30V 0.5A',
            air: 'Φ4mm x 4, 0.59 MPa',
            ip: 'IP20',
            weight: '48 kg',
            axes: [
                { axis: 'J1', speed: '300°/s', range: '±170°' },
                { axis: 'J2', speed: '225°/s', range: '-135°/+100°' },
                { axis: 'J3', speed: '330°/s', range: '-66°/+210°' },
                { axis: 'J4', speed: '450°/s', range: '±190°' },
                { axis: 'J5', speed: '420°/s', range: '-125°/+125°' },
                { axis: 'J6', speed: '720°/s', range: '±360°' }
            ]
        },
        'R11-90': {
            repeatability: '±0.02 mm',
            signals: '12 Signal lines 30V 0.5A',
            air: 'Φ4mm x 4, 0.59 MPa',
            ip: 'IP20',
            weight: '45 kg',
            axes: [
                { axis: 'J1', speed: '300°/s', range: '±170°' },
                { axis: 'J2', speed: '225°/s', range: '-135°/+100°' },
                { axis: 'J3', speed: '330°/s', range: '-66°/+210°' },
                { axis: 'J4', speed: '450°/s', range: '±190°' },
                { axis: 'J5', speed: '420°/s', range: '-125°/+125°' },
                { axis: 'J6', speed: '720°/s', range: '±360°' }
            ]
        },
        'R10H-120': {
            repeatability: '±0.025 mm',
            signals: '17 Signal lines, 30V 0.5A; 8 Signal lines, 30V 0.2A',
            air: 'Φ4mm x 4, 0.59 MPa',
            ip: 'IP20',
            weight: '50 kg',
            axes: [
                { axis: 'J1', speed: '240°/s', range: '±170°' },
                { axis: 'J2', speed: '180°/s', range: '-135°/+100°' },
                { axis: 'J3', speed: '330°/s', range: '-66°/+210°' },
                { axis: 'J4', speed: '470°/s', range: '±190°' },
                { axis: 'J5', speed: '438°/s', range: '-120°/+120°' },
                { axis: 'J6', speed: '764.7°/s', range: '±360°' }
            ]
        },
        'R10-140': {
            repeatability: '±0.05 mm',
            signals: '18 Signal lines 30V 0.5A',
            air: 'Φ8mm x 1, 0.59 MPa',
            ip: 'IP65 (Wrist IP67)',
            weight: '130 kg',
            axes: [
                { axis: 'J1', speed: '200°/s', range: '±170°' },
                { axis: 'J2', speed: '200°/s', range: '-160°/+60°' },
                { axis: 'J3', speed: '200°/s', range: '-80°/+160°' },
                { axis: 'J4', speed: '375°/s', range: '±180°' },
                { axis: 'J5', speed: '375°/s', range: '±140°' },
                { axis: 'J6', speed: '600°/s', range: '±360°' }
            ]
        },
        'R16-210': {
            repeatability: '±0.03 mm',
            signals: '18 Signal lines 30V 0.5A',
            air: 'Φ8mm x 1, 0.59 MPa',
            ip: 'IP65 (Wrist IP67)',
            weight: '260 kg',
            axes: [
                { axis: 'J1', speed: '190°/s', range: '±170°' },
                { axis: 'J2', speed: '175°/s', range: '-155°/+80°' },
                { axis: 'J3', speed: '200°/s', range: '-75°/+160°' },
                { axis: 'J4', speed: '400°/s', range: '±180°' },
                { axis: 'J5', speed: '360°/s', range: '±140°' },
                { axis: 'J6', speed: '610°/s', range: '±360°' }
            ]
        },
        'R25-178': {
            repeatability: '±0.03 mm',
            signals: '18 Signal lines 30V 0.5A',
            air: 'Φ8mm x 1, 0.59 MPa',
            ip: 'IP65 (Wrist IP67)',
            weight: '255 kg',
            axes: [
                { axis: 'J1', speed: '190°/s', range: '±170°' },
                { axis: 'J2', speed: '175°/s', range: '-155°/+80°' },
                { axis: 'J3', speed: '200°/s', range: '-75°/+160°' },
                { axis: 'J4', speed: '400°/s', range: '±180°' },
                { axis: 'J5', speed: '360°/s', range: '±140°' },
                { axis: 'J6', speed: '610°/s', range: '±360°' }
            ]
        },
        'S4-40': {
            repeatability: 'J1+J2: ±0.01mm, J3: ±0.01mm',
            signals: '15 Signal lines',
            air: 'Φ4mm x 1, Φ6mm x 2',
            ip: 'IP20',
            weight: '12 kg',
            axes: [
                { axis: 'J1+J2', speed: '7200 mm/s', range: 'J1: ±132°, J2: ±141°' },
                { axis: 'J3', speed: '1300 mm/s', range: '150 mm' },
                { axis: 'J4', speed: '2600°/s', range: '±360°' }
            ]
        },
        'TS4-35': {
            repeatability: 'J1+J2: ±0.01mm, J3: ±0.01mm',
            signals: '15 Signal lines',
            air: 'Φ4mm x 1, Φ6mm x 2',
            ip: 'IP20',
            weight: '14.5 kg',
            axes: [
                { axis: 'J1+J2', speed: '7200 mm/s', range: 'J1: ±132°, J2: ±141°' },
                { axis: 'J3', speed: '1300 mm/s', range: '150 mm' },
                { axis: 'J4', speed: '2600°/s', range: '±360°' }
            ]
        },
        'TS5-55': {
            repeatability: 'J1+J2: ±0.015mm, J3: ±0.01mm',
            signals: '15 Signal lines',
            air: 'Φ4mm x 1, Φ6mm x 2',
            ip: 'IP20',
            weight: '24.5 kg',
            axes: [
                { axis: 'J1+J2', speed: '8500 mm/s', range: 'J1: ±132°, J2: ±141°' },
                { axis: 'J3', speed: '1100 mm/s', range: '150 mm' },
                { axis: 'J4', speed: '2500°/s', range: '±360°' }
            ]
        },
        'S7-50': {
            repeatability: '±0.02 mm',
            signals: '15 Signal lines',
            air: 'Φ4mm x 1, Φ6mm x 2',
            ip: 'IP20',
            weight: '17 kg',
            axes: [
                { axis: 'J1+J2', speed: '7120 mm/s', range: 'J1: ±132°, J2: ±150°' },
                { axis: 'J3', speed: '1600 mm/s', range: '200 mm' },
                { axis: 'J4', speed: '2000°/s', range: '±360°' }
            ]
        },
        'S7-60': {
            repeatability: '±0.02 mm',
            signals: '15 Signal lines',
            air: 'Φ4mm x 1, Φ6mm x 2',
            ip: 'IP20',
            weight: '17.5 kg',
            axes: [
                { axis: 'J1+J2', speed: '7850 mm/s', range: 'J1: ±132°, J2: ±150°' },
                { axis: 'J3', speed: '1600 mm/s', range: '200 mm' },
                { axis: 'J4', speed: '2000°/s', range: '±360°' }
            ]
        },
        'S7-70': {
            repeatability: '±0.02 mm',
            signals: '15 Signal lines',
            air: 'Φ4mm x 1, Φ6mm x 2',
            ip: 'IP20',
            weight: '19 kg',
            axes: [
                { axis: 'J1+J2', speed: '8590 mm/s', range: 'J1: ±132°, J2: ±150°' },
                { axis: 'J3', speed: '1600 mm/s', range: '200 mm' },
                { axis: 'J4', speed: '2000°/s', range: '±360°' }
            ]
        },
        'S10-60': {
            repeatability: '±0.02 mm',
            signals: '15 Signal lines',
            air: 'Φ4mm x 1, Φ6mm x 2',
            ip: 'IP20',
            weight: '18.5 kg',
            axes: [
                { axis: 'J1+J2', speed: '9100 mm/s', range: 'J1: ±132°, J2: ±150°' },
                { axis: 'J3', speed: '1600 mm/s', range: '200 mm' },
                { axis: 'J4', speed: '2700°/s', range: '±360°' }
            ]
        },
        'S10-70': {
            repeatability: '±0.02 mm',
            signals: '15 Signal lines',
            air: 'Φ4mm x 1, Φ6mm x 2',
            ip: 'IP20',
            weight: '19 kg',
            axes: [
                { axis: 'J1+J2', speed: '9800 mm/s', range: 'J1: ±132°, J2: ±150°' },
                { axis: 'J3', speed: '1600 mm/s', range: '200 mm' },
                { axis: 'J4', speed: '2700°/s', range: '±360°' }
            ]
        },
        'S10-80': {
            repeatability: '±0.025 mm',
            signals: '15 Signal lines',
            air: 'Φ4mm x 1, Φ6mm x 2',
            ip: 'IP20',
            weight: '20.5 kg',
            axes: [
                { axis: 'J1+J2', speed: '10500 mm/s', range: 'J1: ±132°, J2: ±150°' },
                { axis: 'J3', speed: '1600 mm/s', range: '200 mm' },
                { axis: 'J4', speed: '2700°/s', range: '±360°' }
            ]
        },
        'S20-80': {
            repeatability: 'J1+J2: ±0.04mm, J3: ±0.01mm',
            signals: '24 Signal lines (9+15)',
            air: 'Φ6mm x 2, Φ4mm x 2',
            ip: 'IP20',
            weight: '53 kg',
            axes: [
                { axis: 'J1+J2', speed: '9550 mm/s', range: 'J1: ±132°, J2: ±152°' },
                { axis: 'J3', speed: '1010 mm/s', range: '420 mm' },
                { axis: 'J4', speed: '705°/s', range: '±360°' }
            ]
        },
        'S20-100': {
            repeatability: 'J1+J2: ±0.04mm, J3: ±0.01mm',
            signals: '24 Signal lines (9+15)',
            air: 'Φ6mm x 2, Φ4mm x 2',
            ip: 'IP20',
            weight: '56 kg',
            axes: [
                { axis: 'J1+J2', speed: '10800 mm/s', range: 'J1: ±132°, J2: ±152°' },
                { axis: 'J3', speed: '1010 mm/s', range: '420 mm' },
                { axis: 'J4', speed: '705°/s', range: '±360°' }
            ]
        },
        'GS20-80': {
            repeatability: 'J1+J2: ±0.04mm, J3: ±0.01mm',
            signals: '18 Signal lines',
            air: 'Φ6mm x 2, 0.59 MPa',
            ip: 'IP20',
            weight: '54 kg',
            axes: [
                { axis: 'J1+J2', speed: '9550 mm/s', range: 'J1: ±132°, J2: ±152°' },
                { axis: 'J3', speed: '1010 mm/s', range: '420 mm' },
                { axis: 'J4', speed: '705°/s', range: '±360°' }
            ]
        },
        'GS20-100': {
            repeatability: 'J1+J2: ±0.04mm, J3: ±0.01mm',
            signals: '18 Signal lines',
            air: 'Φ6mm x 2, 0.59 MPa',
            ip: 'IP20',
            weight: '57 kg',
            axes: [
                { axis: 'J1+J2', speed: '10800 mm/s', range: 'J1: ±132°, J2: ±152°' },
                { axis: 'J3', speed: '1010 mm/s', range: '420 mm' },
                { axis: 'J4', speed: '705°/s', range: '±360°' }
            ]
        },
        'S35-80': {
            repeatability: 'J1+J2: ±0.05mm, J3: ±0.01mm',
            signals: '25 Signal lines',
            air: 'Φ6mm x 2, Φ8mm x 2',
            ip: 'IP20',
            weight: '70.5 kg',
            axes: [
                { axis: 'J1+J2', speed: '8100 mm/s', range: 'J1: ±139°, J2: ±151°' },
                { axis: 'J3', speed: '2100 mm/s', range: '420 mm' },
                { axis: 'J4', speed: '705°/s', range: '±360°' }
            ]
        },
        'S35-100': {
            repeatability: 'J1+J2: ±0.05mm, J3: ±0.01mm',
            signals: '25 Signal lines',
            air: 'Φ6mm x 2, Φ8mm x 2',
            ip: 'IP20',
            weight: '74.5 kg',
            axes: [
                { axis: 'J1+J2', speed: '9400 mm/s', range: 'J1: ±139°, J2: ±151°' },
                { axis: 'J3', speed: '2100 mm/s', range: '420 mm' },
                { axis: 'J4', speed: '705°/s', range: '±360°' }
            ]
        },
        'S25-120': {
            repeatability: 'J1+J2: ±0.08mm, J3: ±0.01mm',
            signals: '25 Signal lines',
            air: 'Φ6mm x 2, Φ8mm x 2',
            ip: 'IP20',
            weight: '78 kg',
            axes: [
                { axis: 'J1+J2', speed: '9400 mm/s', range: 'J1: ±139°, J2: ±151°' },
                { axis: 'J3', speed: '1200 mm/s', range: '420 mm' },
                { axis: 'J4', speed: '705°/s', range: '±360°' }
            ]
        },
        'S35-120': {
            repeatability: 'J1+J2: ±0.08mm, J3: ±0.01mm',
            signals: '25 Signal lines',
            air: 'Φ6mm x 2, Φ8mm x 2',
            ip: 'IP20',
            weight: '80.5 kg',
            axes: [
                { axis: 'J1+J2', speed: '9400 mm/s', range: 'J1: ±139°, J2: ±151°' },
                { axis: 'J3', speed: '1200 mm/s', range: '420 mm' },
                { axis: 'J4', speed: '705°/s', range: '±360°' }
            ]
        },
        'GS60-120': {
            repeatability: 'J1+J2: ±0.07mm, J3: ±0.02mm',
            signals: '25 Signal lines',
            air: 'Φ6mm x 2, Φ8mm x 2',
            ip: 'IP20',
            weight: '136 kg',
            axes: [
                { axis: 'J1+J2', speed: '7400 mm/s', range: 'J1: ±135°, J2: ±150°' },
                { axis: 'J3', speed: '1500 mm/s', range: '400 mm' },
                { axis: 'J4', speed: '600°/s', range: '±360°' }
            ]
        }
    };

    function getTechSpecs(name) {
        const upper = name.toUpperCase();
        for (let key in technicalSpecsMap) {
            if (upper.includes(key)) return technicalSpecsMap[key];
        }
        return null;
    }

    function getRobotBodyOptions(product) {
        if (!product || !product.specs || product.specs.Type !== '6-Axis') return [];

        const name = product.name.toUpperCase();

        if (isFixedBodySpecModel(name)) {
            return [
                { id: 'standard', label: '기본형', spec: 'Body: IP65, Wrist: IP67, 클린 사양 없음' }
            ];
        }

        const cleanClass = (name.includes('R15H') || name.includes('R20H')) ? 'ISO Class 4' : 'ISO Class 3';
        return [
            { id: 'standard', label: '기본형', spec: 'IP40, 클린 사양 없음' },
            { id: 'clean', label: '클린형', spec: cleanClass },
            { id: 'ip67', label: '방수방진형', spec: 'IP67' }
        ];
    }

    function getCleanTypeDisplay(product) {
        const cleanType = product?.specs?.['Clean Type'] || '-';
        if (!product || !product.specs || product.specs.Type !== '6-Axis') return cleanType;

        const name = product.name.toUpperCase();
        if (isFixedBodySpecModel(name)) return 'No';
        if (name.includes('R15H') || name.includes('R20H')) return 'No (Option : Class 4)';
        return 'No (Option : Class 3)';
    }

    function isFixedBodySpecModel(name) {
        const upper = String(name || '').toUpperCase();
        return upper.includes('R10-140') || upper.includes('R16') || upper.includes('R25');
    }

    function formatIpRating(value) {
        return localizeDisplayText(String(value || '-')
            .replace(/\s*\n\s*/g, ' ')
            .replace(/\(\s*Option\s*:\s*IP67\s*\)/gi, '(Option : IP67)'));
    }

    function formatSignalPins(value) {
        const source = localizeDisplayText(value || '-');
        return source.replace(/\b(?:Signal\s+)?lines?\b/gi, uiText('Pins'));
    }

    function appendUnitIfMissing(value, unit) {
        const text = (value === undefined || value === null || value === '') ? '-' : String(value).trim();
        if (text === '-') return text;
        const pattern = new RegExp(`\\b${unit}\\b`, 'i');
        return pattern.test(text) ? text : `${text} ${unit}`;
    }

    function formatWeight(value) {
        return appendUnitIfMissing(value, 'kg');
    }

    function formatRepeatability(value) {
        return appendUnitIfMissing(value, 'mm');
    }

    function formatCertification(value, product) {
        const certs = String(value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);

        if (String(product?.name || '').toUpperCase() === 'IR-S35-80Z42S-INT') {
            return certs.filter(item => !['KC', 'KCS'].includes(item.toUpperCase())).join(', ');
        }

        return certs.join(', ');
    }

    function hasKcsCertification(product) {
        const certText = product?.detailSpecs?.Certification || '';
        return String(certText)
            .split(',')
            .map(item => item.trim().toUpperCase())
            .includes('KCS');
    }

    function getBodyOptionModelName(modelName, bodyOptionId) {
        const suffixMap = {
            standard: 'S',
            clean: 'C',
            ip67: 'P'
        };
        const suffix = suffixMap[bodyOptionId] || suffixMap.standard;
        const text = String(modelName || '');
        const hasKVariant = /[SPC]-K-INT$/i.test(text);
        return text.replace(/[SPC](?:-K)?-INT$/i, `${suffix}${hasKVariant ? '-K' : ''}-INT`);
    }

    function getBodyOptionPurchaseCode(product, bodyOptionId) {
        if (!product || bodyOptionId === 'standard') return '';

        const bodyOptionCodeMap = {
            'IR-R15H-145P-K-INT': '01741446',
            'IR-R20H-120P-K-INT': '01741597'
        };
        const optionModelName = getBodyOptionModelName(product.name, bodyOptionId).toUpperCase();
        return bodyOptionCodeMap[optionModelName] || '-';
    }

    function getCircuitBreaker(name) {
        const u = name.toUpperCase();
        if (u.includes('R10-140')) return '20A';
        if (u.includes('R16')) return '30A';
        if (u.includes('R25')) return '30A';
        if (u.includes('R10-110')) return '15A';
        if (u.includes('R10H')) return '15A';
        if (u.includes('R11')) return '15A';
        if (u.includes('R4H') || u.includes('R4')) return '10A';
        if (u.includes('R7H')) return '10A';
        if (u.includes('S35') || u.includes('S50') || u.includes('S60') || u.includes('GS60')) return '20A';
        if (u.includes('S25')) return '15A';
        if (u.includes('S4') || u.includes('S7') || u.includes('S10') || u.includes('TS4') || u.includes('TS5')) return '10A';
        return '-';
    }

    function getCadFolderBase(product) {
        const modelId = product.id;
        const type = product.specs.Type;
        let folderBase = modelId.split('Z')[0];

        if (type === '6-Axis') {
            const parts = modelId.split('-');
            if (parts[2].endsWith('S') && !modelId.includes('R11-90S')) {
                folderBase = parts.slice(0, 2).join('-') + '-' + parts[2].slice(0, -1);
            } else if (parts[2].endsWith('S5')) {
                folderBase = parts.slice(0, 2).join('-') + '-' + parts[2].slice(0, -2);
            } else {
                folderBase = parts.slice(0, 3).join('-');
            }
        }

        const cadFolderMap = {
            "IR-R15H-145S5-INT": "IR-R15H-145",
            "IR-R16-210S5-INT": "IR-R16-210",
            "IR-R20H-120S5-INT": "IR-R20H-120",
            "IR-R25-178S5-INT": "IR-R25-178"
        };
        if (cadFolderMap[modelId]) folderBase = cadFolderMap[modelId];

        return folderBase;
    }

    function getCadBaseUrl(product) {
        const typeDir = product.specs.Type === 'SCARA' ? 'SCARA' : '6-axis';
        return `Robot_CAD/${typeDir}/${getCadFolderBase(product)}/`;
    }

    function getCadCandidatePaths(product, fileId, ext) {
        const modelId = product.id;
        const baseUrl = getCadBaseUrl(product);
        const modelIdNoInt = modelId.replace('-INT', '');
        const paths = [
            `${baseUrl}${modelId}_${fileId}.${ext}`,
            `${baseUrl}${modelId}_${fileId}_CN.${ext}`,
            `${baseUrl}${modelIdNoInt}_${fileId}.${ext}`,
            `${baseUrl}${modelIdNoInt}_${fileId}_CN.${ext}`
        ];

        const modelIdNoK = modelId.replace(/([SPC])-K-INT$/i, '$1-INT');
        if (modelIdNoK !== modelId) {
            const modelIdNoKNoInt = modelIdNoK.replace('-INT', '');
            paths.push(
                `${baseUrl}${modelIdNoK}_${fileId}.${ext}`,
                `${baseUrl}${modelIdNoK}_${fileId}_CN.${ext}`,
                `${baseUrl}${modelIdNoKNoInt}_${fileId}.${ext}`,
                `${baseUrl}${modelIdNoKNoInt}_${fileId}_CN.${ext}`
            );
        }

        if (fileId === '2D' && ext.toLowerCase() === 'dwg') {
            paths.splice(2, 0, `${baseUrl}${modelId}_3D_CN.${ext}`);
            paths.push(`${baseUrl}${modelIdNoInt}_3D_CN.${ext}`);
            if (modelIdNoK !== modelId) {
                const modelIdNoKNoInt = modelIdNoK.replace('-INT', '');
                paths.push(
                    `${baseUrl}${modelIdNoK}_3D_CN.${ext}`,
                    `${baseUrl}${modelIdNoKNoInt}_3D_CN.${ext}`
                );
            }
        }

        return [...new Set(paths)];
    }

    async function hasAnyCadFile(product, fileId, ext) {
        for (const path of getCadCandidatePaths(product, fileId, ext)) {
            try {
                const resp = await fetch(path, { method: 'HEAD' });
                if (resp.ok) return true;
            } catch (e) {}
        }
        return false;
    }

    // Modal Logic
    function openOptionsModal(productId) {
        const product = state.products.find(p => p.id === productId);
        if (!product) return;

        // CAD availability check
        const cadBtn = document.getElementById('download-cad-btn');
        cadBtn.disabled = true;
        cadBtn.innerText = uiText("상태 확인 중...");
        cadBtn.style.opacity = "0.7";

        hasAnyCadFile(product, '3D', 'stp').then(isAvailable => {
            if (isAvailable) {
                cadBtn.disabled = false;
                cadBtn.innerText = uiText("CAD 다운로드");
                cadBtn.style.opacity = "1";
                cadBtn.style.cursor = "pointer";
            } else {
                cadBtn.disabled = true;
                cadBtn.innerText = uiText("CAD 준비 중");
                cadBtn.style.opacity = "0.4";
                cadBtn.style.cursor = "not-allowed";
            }
        }).catch(() => {
            cadBtn.disabled = true;
            cadBtn.innerText = uiText("CAD 준비 중");
            cadBtn.style.opacity = "0.4";
            cadBtn.style.cursor = "not-allowed";
        });

        // Rename SCARA clean types for modal title
        let displayName = product.name;
        let scaraSubtype = '일반형';
        const isClean = product.specs['Clean Type'] === 'Yes';

        if (product.specs.Type === 'SCARA') {
            const upperName = product.name.toUpperCase();
            
            if (upperName.includes('IR-CS')) {
                scaraSubtype = '경제형';
            } else if (isClean) {
                scaraSubtype = '클린형';
            } else if (upperName.includes('TS4') || upperName.includes('TS5')) {
                scaraSubtype = '천장형';
            } else {
                scaraSubtype = '일반형';
            }

            if (product.specs['Clean Type'] === 'Yes') {
                displayName = displayName.replace(/\s*\(Clean Type\)\s*/gi, '');
                displayName = displayName.replace(/Z(\d+)([S])/gi, (match, p1, p2) => {
                    let newNum = parseInt(p1) - 3;
                    return 'Z' + newNum + 'C';
                });
            }
        }

        currentActiveProduct = product;
        document.getElementById('modal-title').textContent = `[${displayName}] ${uiText('제품 상세 및 구성')}`;
        modalBody.innerHTML = '';

        function updateModalModelName() {
            if (product.specs.Type !== '6-Axis') return;

            const selectedBodyOption = rightCol.querySelector('input[name="robotBodyOption"]:checked');
            const nextName = getBodyOptionModelName(product.name, selectedBodyOption ? selectedBodyOption.value : 'standard');
            const modalTitle = document.getElementById('modal-title');
            const modalModelName = rightCol.querySelector('#modal-model-name');

            if (modalTitle) modalTitle.textContent = `[${nextName}] ${uiText('제품 상세 및 구성')}`;
            if (modalModelName) modalModelName.textContent = nextName;
        }

        const leftCol = document.createElement('div');
        leftCol.style.flex = "1";
        leftCol.style.display = "flex";
        leftCol.style.flexDirection = "column";

        const imgContainer = document.createElement('div');
        imgContainer.style.textAlign = "center";

        const img = document.createElement('img');
        img.src = product.image;
        img.style.maxWidth = "100%";
        img.style.maxHeight = "350px";
        img.style.objectFit = "contain";
        imgContainer.appendChild(img);

        leftCol.appendChild(imgContainer);

        const ds = product.detailSpecs || {};
        const is6Axis = product.specs.Type === '6-Axis';
        const isScara = product.specs.Type === 'SCARA';
        const tech = getTechSpecs(product.name);

        // Dynamic spec extraction with fallbacks to tech map or defaults
        const repeatability = ds['Repeatability (mm)'] || ds['Repeatability J1+J2 (mm)'] || (tech ? tech.repeatability : (isScara ? "±0.01mm" : "±0.02mm"));
        const ioPins = formatSignalPins(ds['Customer Wiring'] || ds['Customer signal line'] || (tech ? (tech.signals || tech.io) : (isScara ? "24 입력 / 16 출력" : "20 Signal lines")));
        const ipRating = formatIpRating(ds['IP rating'] || (tech ? tech.ip : (isScara ? "IP20" : "IP65 (Wrist IP67)")));
        const weight = ds['Weight (kg)'] || ds['Weight (excluding cables) (kg)'] || (tech ? tech.weight : (is6Axis ? "~130kg" : "12~56kg"));
        const air = ds['Customer Air'] || ds['Customer air piping (0.59Mpa)'] || (tech ? tech.air : '-');

        let axesRows = '';
        const dks = Object.keys(ds);
        // Check if we have J1-J6 info in detailSpecs
        if (dks.length > 0 && dks.some(k => k.toLowerCase().includes('j1'))) {
            axesRows = `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1); font-size: 11px; color: var(--text-muted);"><td></td><td style="text-align:right; padding: 4px 10px 4px 0;">속도</td><td style="text-align:right; padding: 4px 0;">가동범위</td></tr>`;

            // Requirement 1: Combined Speed for SCARA J1+J2 (Standard color)
            if (isScara) {
                const combinedSpeedKey = dks.find(k => k.toLowerCase().includes('speed') && k.toLowerCase().includes('j1+j2'));
                if (combinedSpeedKey) {
                    axesRows += `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>${uiText('J1+J2 합산 속도')}</strong></td><td style="text-align:right; padding-right:10px;">${formatAxisSpecValue(ds[combinedSpeedKey], combinedSpeedKey)}</td><td style="text-align:right;">-</td></tr>`;
                }
            }

            const checkNums = is6Axis ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4];
            checkNums.forEach(num => {
                let label = formatAxisLabel('J' + num);
                let q = 'j' + num;
                const sk = dks.find(k => k.toLowerCase().includes('speed') && k.toLowerCase().includes(q));
                const rk = dks.find(k => k.toLowerCase().includes('range') && k.toLowerCase().includes(q));
                
                let speedVal = formatAxisSpecValue(ds[sk], sk);
                const rangeVal = formatAxisSpecValue(ds[rk], rk);
                if (isScara && (num === 1 || num === 2)) speedVal = '-';

                if (sk || rk) {
                    axesRows += `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>${label}</strong></td><td style="text-align:right; padding-right:10px;">${speedVal}</td><td style="text-align:right;">${rangeVal}</td></tr>`;
                }
            });
        } else if (tech && tech.axes) {
            axesRows = `
                <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1); font-size: 11px; color: var(--text-muted);">
                    <td></td>
                    <td style="text-align:right; padding: 4px 5px 4px 0;">속도</td>
                    <td style="text-align:right; padding: 4px 0;">가동범위</td>
                </tr>
            ` + tech.axes.map(ax => `
                <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
                    <td style="padding:6px 0;"><strong>${formatAxisLabel(ax.axis)}</strong></td>
                    <td style="text-align:right; padding-right:10px;">${ax.speed}</td>
                    <td style="text-align:right;">${ax.range}</td>
                </tr>
            `).join('');
        }

        // Additional Specs (Requirements 4, 5, 6)
        let extraRows = '';
        if (ds) {
            // Repeatability
            if (isScara) {
                const r12 = ds[dks.find(k => k.toLowerCase().includes('repeatability') && k.toLowerCase().includes('j1+j2'))];
                const r3 = ds[dks.find(k => k.toLowerCase().includes('repeatability') && k.toLowerCase().includes('j3'))];
                const r4 = ds[dks.find(k => k.toLowerCase().includes('repeatability') && k.toLowerCase().includes('j4'))];
                if (r12) extraRows += `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>반복 정밀도 (J1+J2)</strong></td><td colspan="2" style="text-align:right;">${formatRepeatability(r12)}</td></tr>`;
                if (r3) extraRows += `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>반복 정밀도 (J3)</strong></td><td colspan="2" style="text-align:right;">${formatRepeatability(r3)}</td></tr>`;
                if (r4) extraRows += `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>반복 정밀도 (J4)</strong></td><td colspan="2" style="text-align:right;">${formatRepeatability(r4)}</td></tr>`;
            } else {
                extraRows += `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>반복 정밀도</strong></td><td colspan="2" style="text-align:right;">${formatRepeatability(repeatability)}</td></tr>`;
            }

            // Inertia
            const i4 = ds[dks.find(k => k.toLowerCase().includes('inertia') && k.toLowerCase().includes('j4'))];
            if (i4) extraRows += `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>허용 관성 모멘트 (J4)</strong></td><td colspan="2" style="text-align:right;">${i4} kg·m²</td></tr>`;
            if (is6Axis) {
                const i5 = ds[dks.find(k => k.toLowerCase().includes('inertia') && k.toLowerCase().includes('j5'))];
                const i6 = ds[dks.find(k => k.toLowerCase().includes('inertia') && k.toLowerCase().includes('j6'))];
                if (i5) extraRows += `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>허용 관성 모멘트 (J5)</strong></td><td colspan="2" style="text-align:right;">${i5} kg·m²</td></tr>`;
                if (i6) extraRows += `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>허용 관성 모멘트 (J6)</strong></td><td colspan="2" style="text-align:right;">${i6} kg·m²</td></tr>`;
            }

            // Certification
            const cert = ds[dks.find(k => k.toLowerCase().includes('cert'))];
            const certDisplay = formatCertification(cert, product);
            if (certDisplay) {
                extraRows += `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.1);"><td style="padding:6px 0;"><strong>인증 정보</strong></td><td colspan="2" style="text-align:right; font-size:11px;">${certDisplay}</td></tr>`;
            }
        }

        const specHtml = `
            <div style="margin-top: 20px; padding: 15px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;">
                <h4 style="margin-bottom: 12px; color: var(--primary-blue); border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 8px;">로봇 스펙 정보</h4>
                <table style="width:100%; font-size:13px; border-collapse: collapse; color: var(--text-main);">
                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>가반 하중(Payload)</strong></td><td colspan="2" style="text-align:right;">${product.specs['Payload(kg)'] || '-'} kg</td></tr>
                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>리치(Reach)</strong></td><td colspan="2" style="text-align:right;">${product.specs['Manipulator Length(mm)'] || '-'} mm</td></tr>
                    ${isScara ? `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>로봇 타입</strong></td><td colspan="2" style="text-align:right;">${scaraSubtype}</td></tr>` : ''}
                    ${isScara ? `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>Z축 길이</strong></td><td colspan="2" style="text-align:right;">${product.specs['Z axis Length(mm)'] || '-'} mm</td></tr>` : ''}
                    ${is6Axis ? `<tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>중공형(Hollow Wrist)</strong></td><td colspan="2" style="text-align:right;">${product.specs['Hollow Wrist'] || '-'}</td></tr>` : ''}
                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>클린 타입</strong></td><td colspan="2" style="text-align:right;">${getCleanTypeDisplay(product)}</td></tr>
                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>방수 방진 등급</strong></td><td colspan="2" style="text-align:right;">${ipRating}</td></tr>
                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>중량</strong></td><td colspan="2" style="text-align:right;">${formatWeight(weight)}</td></tr>
                    ${extraRows}
                    ${axesRows}
                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>사용자 배선</strong></td><td colspan="2" style="text-align:right;">${ioPins}</td></tr>
                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);"><td style="padding:6px 0;"><strong>사용자 공압</strong></td><td colspan="2" style="text-align:right;">${air}</td></tr>
                    <tr><td style="padding:6px 0;"><strong>권장 차단기</strong></td><td colspan="2" style="text-align:right;">${getCircuitBreaker(product.name)}</td></tr>
                </table>
            </div>
        `;
        const specDiv = document.createElement('div');
        specDiv.innerHTML = specHtml;
        leftCol.appendChild(specDiv);

        const rightCol = document.createElement('div');
        rightCol.style.flex = "2";
        rightCol.style.display = "flex";
        rightCol.style.flexDirection = "column";

        const baseCode = (product.cables && product.cables.length > 0) ? product.cables[0].code : 'N/A';

        const infoHtml = `
            <div id="dynamic-purchase-code" style="font-size:14px;margin-bottom:8px;font-weight:bold;color:var(--primary-blue);">${uiText('현재 구매 코드')}: ${baseCode}</div>
            <div id="lead-time-display" style="font-size:13px;margin-bottom:15px;color:#eee;background:rgba(255,255,255,0.05);padding:10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);">
                <strong>${uiText('예상 납기')}:</strong> <span id="lead-time-value" style="color:var(--secondary-orange); font-weight:bold;">TBD</span>
            </div>
            <h2 id="modal-model-name" style="color:var(--text-main);margin-bottom:12px;">${displayName}</h2>
            
            <h4 style="margin-bottom: 12px; color: var(--text-main);">로봇 구성 선택</h4>
            
            <div style="margin-bottom:16px;">
                <label style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px; color: var(--text-main);">파워/엔코더 케이블 길이 <span style="color:#ef4444">*</span></label>
                <div id="cable-len-container" style="display:flex; gap:10px; flex-wrap:wrap;"></div>
            </div>
            <div style="margin-bottom:20px;">
                <label style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px; color: var(--text-main);">파워/엔코더 케이블 타입 <span style="color:#ef4444">*</span></label>
                <div id="cable-type-container" style="display:flex; gap:10px; flex-wrap:wrap;"></div>
            </div>

            ${product.specs.Type === '6-Axis' ? `
            <div style="margin-bottom:20px; border-top:1px dashed rgba(255,255,255,0.1); padding-top:16px;">
                <label style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px; color: var(--text-main);">로봇 바디 옵션 <span style="color:#ef4444">*</span></label>
                <div id="robot-body-option-container" style="display:flex; flex-wrap:wrap; gap:10px;"></div>
            </div>` : ''}

            <div style="margin-bottom:20px; border-top:1px dashed rgba(255,255,255,0.1); padding-top:16px;">
                <label id="header-pendant" style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px; color: var(--text-main);">티칭 펜던트 구성 (유로 옵션)</label>
                <div id="pendant-container" style="display:flex; flex-direction:column; gap:8px;"></div>
            </div>

            ${product.specs.Type === '6-Axis' ? `
            <div style="margin-bottom:12px; border-top:1px dashed rgba(255,255,255,0.1); padding-top:16px;">
                <label id="header-arm" style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px; color: var(--text-main);">Arm I/O 케이블 구성 (유로 옵션)</label>
                <div id="arm-container" style="display:flex; flex-direction:column; gap:8px;"></div>
            </div>
            <div style="margin-bottom:20px; border-top:1px dashed rgba(255,255,255,0.1); padding-top:16px;">
                <label id="header-body" style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px; color: var(--text-main);">Body I/O 케이블 구성 (유로 옵션)</label>
                <div id="body-container" style="display:flex; flex-direction:column; gap:8px;"></div>
            </div>` : ''}

            <div style="margin-bottom:20px; border-top:1px dashed rgba(255,255,255,0.1); padding-top:16px;">
                <label id="header-other" style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px; color: var(--text-main);">기타 악세서리 (유로 옵션)</label>
                <div id="other-accessories-container" style="display:flex; flex-direction:column; gap:8px;"></div>
            </div>

            <div style="margin-bottom:20px; border-top:1px dashed rgba(255,255,255,0.1); padding-top:16px;">
                <label id="header-comm" style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px; color: var(--text-main);">통신 프로토콜 옵션 (확장카드 옵션)</label>
                <p style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">Modbus-RTU, Modbus-TCP, EtherNet/IP, EtherCAT, MC ${uiText('통신은 기본 제공됩니다.')}</p>
                <div id="comm-radios" style="display:flex; flex-wrap:wrap; gap:10px;">
                    <label class="cable-option" style="margin:0;">
                        <input type="radio" name="commSelection" value="none" checked data-code="">
                        <span>기본 프로토콜 사용</span>
                    </label>
                    <label class="cable-option" style="margin:0;">
                        <input type="radio" name="commSelection" value="IRCB501-2PN-BD" data-code="01650028" data-label="PROFINET">
                        <span>PROFINET</span>
                    </label>
                    <label class="cable-option" style="margin:0;">
                        <input type="radio" name="commSelection" value="IR-CE-CCLINK" data-code="01650040" data-label="CC-Link">
                        <span>CC-Link</span>
                    </label>
                </div>
            </div>

            <div style="margin-bottom:20px; border-top:1px dashed rgba(255,255,255,0.1); padding-top:16px;">
                <label id="header-expansion" style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px; color: var(--text-main);">컨트롤러 확장 카드 옵션</label>
                <div id="expansion-cards-container" style="display:flex; flex-direction:column; gap:8px;"></div>
            </div>
        `;
        rightCol.innerHTML = infoHtml;

        modalBody.appendChild(leftCol);
        modalBody.appendChild(rightCol);

        // Process Cables
        const lenContainer = rightCol.querySelector('#cable-len-container');
        const typeContainer = rightCol.querySelector('#cable-type-container');

        let lengths = new Set();
        let types = new Set(['Standard (표준형)']);

        if (product.cables && product.cables.length > 0) {
            product.cables.forEach(c => {
                let cableStr = c.cable;
                let isHighFlex = cableStr.includes('High flex cables');
                if (isHighFlex) types.add('High Flex (유연형)');
                let lenMatch = cableStr.match(/\d+m/);
                if (lenMatch) lengths.add(lenMatch[0]);
            });
        }

        if (lengths.size === 0) lengths.add('N/A');

        // Find Default cable
        let defaultLen = "";
        let defaultType = "Standard (표준형)";
        if (product.cables && product.cables.length > 0) {
            const defC = product.cables.find(c => c.cable.includes('(Default)'));
            if (defC) {
                const lenM = defC.cable.match(/\d+m/);
                if (lenM) defaultLen = lenM[0];
                if (defC.cable.includes('High flex')) defaultType = 'High Flex (유연형)';
            }
        }

        Array.from(lengths).sort((a, b) => parseLen(a) - parseLen(b)).forEach((l, i) => {
            const btn = document.createElement('label');
            btn.className = 'cable-option';
            btn.style.margin = '0';

            // Requirement 3: Use Default marker from data
            let isChecked = defaultLen ? (l === defaultLen) : (i === 0);

            btn.innerHTML = `<input type="radio" name="cableLenSelection" value="${l}" ${isChecked ? 'checked' : ''}><span>${l}</span>`;
            lenContainer.appendChild(btn);
        });

        Array.from(types).forEach((t, i) => {
            const btn = document.createElement('label');
            btn.className = 'cable-option';
            btn.style.margin = '0';
            // Requirement 3: Default type also from marker
            let isChecked = defaultType ? (t === defaultType) : (i === 0);
            btn.innerHTML = `<input type="radio" name="cableTypeSelection" value="${t}" ${isChecked ? 'checked' : ''}><span>${uiText(t)}</span>`;
            typeContainer.appendChild(btn);
        });

        const robotBodyOptionContainer = rightCol.querySelector('#robot-body-option-container');
        if (robotBodyOptionContainer) {
            getRobotBodyOptions(product).forEach((option, index) => {
                const btn = document.createElement('label');
                btn.className = 'cable-option';
                btn.style.margin = '0';
                btn.style.alignItems = 'center';
                btn.style.minWidth = '190px';
                btn.innerHTML = `
                    <input type="radio" name="robotBodyOption" value="${option.id}" ${index === 0 ? 'checked' : ''} data-label="${option.label}" data-spec="${option.spec}">
                    <span>
                        <strong>${uiText(option.label)}</strong>
                        <small style="display:block; margin-top:4px; color:var(--text-muted); font-size:12px; line-height:1.35;">${localizeDisplayText(option.spec)}</small>
                    </span>
                `;
                robotBodyOptionContainer.appendChild(btn);
            });
        }

        // Function to update dynamic header codes
        function updateHeaderCodes() {
            // Pendant
            const pConfig = rightCol.querySelector('input[name="pendantConfig"]:checked');
            const pSel = rightCol.querySelector('input[name="pendantLength"]:checked');
            const pHeader = rightCol.querySelector('#header-pendant');
            if (pHeader) {
                const codeHtml = (pConfig && pConfig.value !== 'none' && pSel) ? ` <span class="code-badge">${pSel.value}</span>` : '';
                pHeader.innerHTML = `${uiText('티칭 펜던트 구성 (유로 옵션)')}${codeHtml}`;
            }

            // Arm - Dynamic for multiple pin types
            const armSelections = Array.from(rightCol.querySelectorAll('input[name^="armSelection_"]:checked'));
            const armHeader = rightCol.querySelector('#header-arm');
            if (armHeader) {
                const armCodes = armSelections.filter(s => s.value !== 'none').map(s => s.value);
                const codeHtml = armCodes.length > 0 ? armCodes.map(c => `<span class="code-badge">${c}</span>`).join('') : '';
                armHeader.innerHTML = `${uiText('Arm I/O 케이블 구성 (유로 옵션)')} ${codeHtml}`;
            }

            // Body - Dynamic for multiple pin types
            const bodySelections = Array.from(rightCol.querySelectorAll('input[name^="bodySelection_"]:checked'));
            const bodyHeader = rightCol.querySelector('#header-body');
            if (bodyHeader) {
                const bodyCodes = bodySelections.filter(s => s.value !== 'none').map(s => s.value);
                const codeHtml = bodyCodes.length > 0 ? bodyCodes.map(c => `<span class="code-badge">${c}</span>`).join('') : '';
                bodyHeader.innerHTML = `${uiText('Body I/O 케이블 구성 (유로 옵션)')} ${codeHtml}`;
            }

            // Other
            const otherHeader = rightCol.querySelector('#header-other');
            if (otherHeader) {
                const checkedItems = Array.from(rightCol.querySelectorAll('input[name="accSelection"]:checked'));
                const selectedCodes = checkedItems.map(cb => cb.value);
                const codeHtml = selectedCodes.length > 0 ? selectedCodes.map(c => `<span class="code-badge">${c}</span>`).join('') : '';
                otherHeader.innerHTML = `${uiText('기타 악세서리 (유로 옵션)')} ${codeHtml}`;

                // Requirement 2: Show code on the right of each item
                rightCol.querySelectorAll('input[name="accSelection"]').forEach(cb => {
                    const codeSpan = cb.parentElement.querySelector('.item-code-inline');
                    if (codeSpan) {
                        codeSpan.style.display = cb.checked ? 'inline' : 'none';
                    }
                });
            }

            // Comm & Auto-check Expansion (Requirement 3)
            const commSel = rightCol.querySelector('input[name="commSelection"]:checked');
            const commHeader = rightCol.querySelector('#header-comm');
            if (commHeader) {
                const commCode = commSel ? commSel.getAttribute('data-code') : '';
                const codeHtml = (commSel && commSel.value !== 'none' && commCode) ? ` <span class="code-badge">${commCode}</span>` : '';
                commHeader.innerHTML = `${uiText('통신 프로토콜 옵션 (확장카드 옵션)')}${codeHtml}`;

                // Requirement 3 Fix: Sync and Clear siblings
                const commCodesToSync = ['01650028', '01650040'];
                if (commCode) {
                    commCodesToSync.forEach(c => {
                        if (c !== commCode) {
                            const cb = rightCol.querySelector(`input[name="expSelection"][value="${c}"]`);
                            if (cb) cb.checked = false;
                        }
                    });
                    const expCheckbox = rightCol.querySelector(`input[name="expSelection"][value="${commCode}"]`);
                    if (expCheckbox && !expCheckbox.checked) {
                        expCheckbox.checked = true;
                    }
                } else {
                    commCodesToSync.forEach(c => {
                        const cb = rightCol.querySelector(`input[name="expSelection"][value="${c}"]`);
                        if (cb) cb.checked = false;
                    });
                }
            }

            // Expansion
            const expansionHeader = rightCol.querySelector('#header-expansion');
            if (expansionHeader) {
                const checkedExp = Array.from(rightCol.querySelectorAll('input[name="expSelection"]:checked'));
                const selectedCodes = checkedExp.map(cb => cb.value);
                const codeBadgeHtml = selectedCodes.length > 0 ? selectedCodes.map(c => `<span class="code-badge">${c}</span>`).join('') : '';
                expansionHeader.innerHTML = `${uiText('컨트롤러 확장 카드 옵션')} ${codeBadgeHtml}`;

                // Requirement 2: Show code inline for expansion cards
                rightCol.querySelectorAll('input[name="expSelection"]').forEach(cb => {
                    const codeSpan = cb.parentElement.querySelector('.exp-code-inline');
                    if (codeSpan) {
                        codeSpan.style.display = cb.checked ? 'inline' : 'none';
                    }
                });
            }
        }

        // Function to update dynamic code display
        function updateDynamicCode() {
            const lenEl = rightCol.querySelector('input[name="cableLenSelection"]:checked');
            const typeEl = rightCol.querySelector('input[name="cableTypeSelection"]:checked');
            const lenValue = lenEl ? lenEl.value : '';
            const typeValue = typeEl ? typeEl.value : '';
            const isFlex = typeValue.includes('High Flex');

            let matched = product.cables.find(c => {
                let txt = c.cable;
                let matchFlex = isFlex ? txt.includes('High flex') : !txt.includes('High flex');
                let matchLen = txt.includes(lenValue);
                return matchFlex && matchLen;
            });

            const codeDisplay = rightCol.querySelector('#dynamic-purchase-code');
            const leadTimeVal = rightCol.querySelector('#lead-time-value');
            
            if (codeDisplay) {
                const selectedBodyOption = rightCol.querySelector('input[name="robotBodyOption"]:checked');
                const bodyOptionNeedsCode = selectedBodyOption && selectedBodyOption.value !== 'standard';
                const bodyOptionCode = getBodyOptionPurchaseCode(product, selectedBodyOption ? selectedBodyOption.value : 'standard');
                const finalCode = bodyOptionNeedsCode ? bodyOptionCode : (matched ? matched.code : (product.cables.length > 0 ? product.cables[0].code : 'N/A'));
                codeDisplay.innerHTML = `${uiText('현재 구매 코드')}: <span class="code-badge">${finalCode}</span>`;

                // Requirement 2: Dynamic Lead Time Calculation
                const isScara = product.specs.Type === 'SCARA';
                const subType = product.specs['Sub Type'] || '일반형';
                const hasCode = finalCode && finalCode !== '-';
                let timeStr = "-";

                if (isScara) {
                    const isCleanScara = product.id.endsWith('C-INT');
                    const isS60 = product.id.includes('S60');
                    if (isCleanScara) {
                        timeStr = "6\uac1c\uc6d4";
                    } else if (!hasKcsCertification(product)) {
                        timeStr = "10주";
                    } else if (isS60) {
                        timeStr = hasCode ? "6주" : "10주";
                    } else if (subType === '일반형') {
                        timeStr = hasCode ? "6주" : "7주";
                    } else if (subType === '클린형' || subType === '경제형') {
                        timeStr = hasCode ? "6주" : "10주";
                    } else {
                        timeStr = hasCode ? "6주" : "7주"; // fallback for other types like '천장형'
                    }
                } else {
                    timeStr = hasCode ? "7주" : "8주";
                }
                if (leadTimeVal) leadTimeVal.textContent = uiText(timeStr);
            }
            updateModalModelName();
            updateHeaderCodes();
        }

        lenContainer.addEventListener('change', updateDynamicCode);
        typeContainer.addEventListener('change', updateDynamicCode);
        if (robotBodyOptionContainer) {
            robotBodyOptionContainer.addEventListener('change', updateDynamicCode);
        }
        
        // Accessory Filtering Logic
        const accs = state.accessories;
        const prodName = product.name;

        // 1. Pendant Logic
        const pendantContainer = rightCol.querySelector('#pendant-container');
        const pendantOptions = accs.filter(a => a.type === 'Pendant' && isModelMatch(a.target_models, prodName));
        
        pendantContainer.innerHTML = `
            <div>
                <div style="font-size:12px; margin-bottom:5px; color:#aaa;">${uiText('펜던트 사용 여부 선택')}</div>
                <div style="display:flex; flex-wrap:wrap; gap:10px;" id="pendant-config-radios">
                    <label class="cable-option" style="margin:0;">
                        <input type="radio" name="pendantConfig" value="none" checked data-label="사용안함">
                        <span>${uiText('사용안함')}</span>
                    </label>
                    <label class="cable-option" style="margin:0;">
                        <input type="radio" name="pendantConfig" value="without-cover" data-label="비상정지 보호 커버 없음">
                        <span>${uiText('비상정지 보호 커버 없음')}</span>
                    </label>
                    <label class="cable-option" style="margin:0;">
                        <input type="radio" name="pendantConfig" value="with-cover" data-label="비상정지 보호 커버 있음">
                        <span>${uiText('비상정지 보호 커버 있음')}</span>
                    </label>
                </div>
            </div>
            <div style="margin-top:4px;">
                <div style="font-size:12px; margin-bottom:5px; color:#aaa;">${uiText('펜던트 길이 선택')}</div>
                <div style="display:flex; flex-wrap:wrap; gap:10px;" id="pendant-length-radios"></div>
            </div>
        `;
        const pConfigRadios = pendantContainer.querySelector('#pendant-config-radios');
        const pLengthRadios = pendantContainer.querySelector('#pendant-length-radios');

        function updatePendantState() {
            const config = pConfigRadios.querySelector('input[name="pendantConfig"]:checked');
            const isEnabled = config && config.value !== 'none';
            const hasCover = config && config.value === 'with-cover';
            const availableOptions = pendantOptions
                .filter(option => Boolean(option.emergency_stop_cover) === hasCover)
                .sort((a, b) => parseLen(a.spec) - parseLen(b.spec));

            pLengthRadios.innerHTML = availableOptions.map((opt, index) => `
                <label class="cable-option" style="margin:0;">
                    <input type="radio" name="pendantLength" value="${opt.code}" data-desc="${opt.description}" data-spec="${opt.spec || ''}" ${isEnabled && index === 0 ? 'checked' : ''} ${isEnabled ? '' : 'disabled'}>
                    <span>${opt.spec || uiText(opt.name)}</span>
                </label>
            `).join('');
            updateHeaderCodes();
        }

        pConfigRadios.addEventListener('change', updatePendantState);
        pLengthRadios.addEventListener('change', updateHeaderCodes);
        updatePendantState();

        // helper to get pins
        function getPinCount(desc) {
            const match = desc.match(/(\d+)\s*pin/i);
            return match ? match[1] + '핀' : null;
        }

        function formatPinCount(pin) {
            const match = String(pin).match(/^(\d+)핀$/);
            return match ? `${match[1]} ${uiText('핀')}` : uiText(pin);
        }

        // 2. Arm / Body Cable Logic (Requirement 4)
        if (product.specs.Type === '6-Axis') {
            // Group Arm I/O by pins
            const armContainer = rightCol.querySelector('#arm-container');
            const armOptions = accs.filter(a => a.name === 'Robot arm I/O cable' && isModelMatch(a.target_models, prodName));
            
            if (armOptions.length > 0) {
                armContainer.innerHTML = '';
                const pinGroups = {};
                armOptions.forEach(opt => {
                    const pin = getPinCount(opt.description) || '기본핀';
                    if (!pinGroups[pin]) pinGroups[pin] = [];
                    pinGroups[pin].push(opt);
                });

                Object.keys(pinGroups).forEach(pin => {
                    const groupDiv = document.createElement('div');
                    groupDiv.style.marginBottom = '12px';
                    groupDiv.innerHTML = `<div style="font-size:12px; margin-bottom:5px; color:#aaa;">${formatPinCount(pin)} ${uiText('케이블 선택')}</div>
                        <div style="display:flex; flex-wrap:wrap; gap:10px;" id="arm-radios-${pin}">
                            <label class="cable-option" style="margin:0;"><input type="radio" name="armSelection_${pin}" value="none" checked><span>${uiText('사용안함')}</span></label>
                        </div>`;
                    armContainer.appendChild(groupDiv);
                    
                    const radios = groupDiv.querySelector(`#arm-radios-${pin}`);
                    pinGroups[pin].forEach(opt => {
                        const isFlex = opt.description.toLowerCase().includes('flexible') && !opt.description.toLowerCase().includes('non-flexible');
                        let displaySpec = opt.spec;
                        if (opt.spec === '-') displaySpec = uiText('커넥터만');
                        else displaySpec = `${opt.spec} (${uiText(isFlex ? '플렉시블' : '논플렉시블')})`;

                        radios.innerHTML += `<label class="cable-option" style="margin:0;"><input type="radio" name="armSelection_${pin}" value="${opt.code}" data-desc="${opt.description}" data-spec="${opt.spec || ''}"><span>${displaySpec}</span></label>`;
                    });
                    radios.addEventListener('change', updateHeaderCodes);
                });
            } else {
                armContainer.innerHTML = `<span style="font-size:13px; color:#999;">${uiText('해당 모델에 호환되는 Arm 케이블 옵션이 없습니다.')}</span>`;
            }

            // Group Body I/O by pins
            const bodyContainer = rightCol.querySelector('#body-container');
            const bodyOptions = accs.filter(a => a.name === 'Robot Body I/O cable' && isModelMatch(a.target_models, prodName));
            
            if (bodyOptions.length > 0) {
                bodyContainer.innerHTML = '';
                const bodyPinGroups = {};
                bodyOptions.forEach(opt => {
                    const pin = getPinCount(opt.description) || '기본핀';
                    if (!bodyPinGroups[pin]) bodyPinGroups[pin] = [];
                    bodyPinGroups[pin].push(opt);
                });

                Object.keys(bodyPinGroups).forEach(pin => {
                    const groupDiv = document.createElement('div');
                    groupDiv.style.marginBottom = '12px';
                    groupDiv.innerHTML = `<div style="font-size:12px; margin-bottom:5px; color:#aaa;">${formatPinCount(pin)} ${uiText('케이블 선택')}</div>
                        <div style="display:flex; flex-wrap:wrap; gap:10px;" id="body-radios-${pin}">
                            <label class="cable-option" style="margin:0;"><input type="radio" name="bodySelection_${pin}" value="none" checked><span>${uiText('사용안함')}</span></label>
                        </div>`;
                    bodyContainer.appendChild(groupDiv);
                    
                    const radios = groupDiv.querySelector(`#body-radios-${pin}`);
                    bodyPinGroups[pin].forEach(opt => {
                        const isFlex = opt.description.toLowerCase().includes('flexible') && !opt.description.toLowerCase().includes('non-flexible');
                        let displaySpec = opt.spec;
                        if (opt.spec === '-') displaySpec = uiText('커넥터만');
                        else displaySpec = `${opt.spec} (${uiText(isFlex ? '플렉시블' : '논플렉시블')})`;

                        radios.innerHTML += `<label class="cable-option" style="margin:0;"><input type="radio" name="bodySelection_${pin}" value="${opt.code}" data-desc="${opt.description}" data-spec="${opt.spec || ''}"><span>${displaySpec}</span></label>`;
                    });
                    radios.addEventListener('change', updateHeaderCodes);
                });
            } else {
                bodyContainer.innerHTML = `<span style="font-size:13px; color:#999;">${uiText('해당 모델에 호환되는 Body 케이블 옵션이 없습니다.')}</span>`;
            }
        }

        // 3. Other Accessories Logic (Requirement 1 & 2)
        const otherAccContainer = rightCol.querySelector('#other-accessories-container');
        const otherOptions = accs.filter(a => {
            if (a.type === 'Pendant') return false;
            if (a.name === 'Robot arm I/O cable' || a.name === 'Robot Body I/O cable') return false;
            if (a.type === 'Software' && a.name.includes('Simulation')) return false;
            if (a.description.includes('1.0 TP Connector')) return false; 
            if (a.description.includes('TP2.0 adapter to old version')) return false;
            if (a.type === 'Expansion Card') return false;
            if (isFixedBodySpecModel(prodName) && a.name === 'Handheld motor break release box') return false;
            return isModelMatch(a.target_models, prodName);
        });

        if (otherOptions.length > 0) {
            otherOptions.forEach(acc => {
                const lbl = document.createElement('label');
                lbl.style.display = "flex"; lbl.style.alignItems = "start"; lbl.style.gap = "8px"; lbl.style.fontSize = "14px"; lbl.style.cursor = "pointer";
                lbl.innerHTML = `
                    <input type="checkbox" name="accSelection" value="${acc.code}" data-desc="${acc.name} - ${acc.description}" data-spec="${acc.spec || ''}" style="margin-top:3px;">
                    <div style="flex:1;">
                        <strong>${uiText(acc.name || 'Accessory')}</strong>
                        <span class="item-code-inline code-badge" style="display:none; margin-left:8px;">${acc.code}</span>
                        <br><span style="color:#888; font-size:13px;">${uiText(acc.description)}</span>
                    </div>
                `;
                otherAccContainer.appendChild(lbl);
            });
            otherAccContainer.addEventListener('change', updateHeaderCodes);
        } else {
            otherAccContainer.innerHTML = `<span style="color:#999; font-size:13px;">${uiText('기타 악세서리가 없습니다.')}</span>`;
        }

        // 4. Expansion Cards Logic
        const expContainer = rightCol.querySelector('#expansion-cards-container');
        const expOptions = accs.filter(a => a.type === 'Expansion Card');
        
        if (expOptions.length > 0) {
            expOptions.forEach(acc => {
                const lbl = document.createElement('label');
                lbl.style.display = "flex"; lbl.style.alignItems = "start"; lbl.style.gap = "8px"; lbl.style.fontSize = "14px"; lbl.style.cursor = "pointer";
                lbl.innerHTML = `
                    <input type="checkbox" name="expSelection" value="${acc.code}" data-desc="${acc.name} - ${acc.description}" data-spec="${acc.spec || ''}" style="margin-top:3px;">
                    <div style="flex:1;">
                        <strong>${uiText(acc.name)}</strong>
                        <span class="exp-code-inline code-badge" style="display:none; margin-left:8px;">${acc.code}</span>
                        <br><span style="color:#888; font-size:13px;">${uiText(acc.description)}</span>
                    </div>
                `;
                expContainer.appendChild(lbl);
            });
            expContainer.addEventListener('change', updateHeaderCodes);
        } else {
            expContainer.innerHTML = `<span style="color:#999; font-size:13px;">${uiText('확장 카드 옵션이 없습니다.')}</span>`;
        }

        rightCol.querySelector('#comm-radios').addEventListener('change', updateHeaderCodes);

        updateDynamicCode();
        if (window.InoRobotI18n) {
            window.InoRobotI18n.apply(modalBody);
        }
        modalOverlay.style.display = 'flex';
    }

    closeModalBtn.addEventListener('click', () => {
        modalOverlay.style.display = 'none';
        currentActiveProduct = null;
    });

    downloadPdfBtn.addEventListener('click', () => {
        if (!currentActiveProduct) return;

        const bodyCodeInput = document.getElementById('bodySelectionCode');
        const flexNode = document.querySelector('input[name="bodyFlexTemp"]:checked');
        const wantsBody = flexNode && flexNode.value !== 'none';

        if (wantsBody && bodyCodeInput && bodyCodeInput.value === "") {
            alert(uiText("선택하신 Body I/O 케이블 타입 및 길이 조합은 사용할 수 없습니다.\n다른 조합을 선택해 주세요."));
            return;
        }

        const pdfWrapper = document.createElement('div');
        pdfWrapper.id = 'pdf-render-wrapper';
        pdfWrapper.style.position = 'absolute';
        pdfWrapper.style.left = '0';
        pdfWrapper.style.top = '0';
        pdfWrapper.style.width = '800px';
        pdfWrapper.style.height = 'auto';
        pdfWrapper.style.backgroundColor = '#ffffff';
        pdfWrapper.style.zIndex = '-99999';
        pdfWrapper.style.opacity = '0';
        pdfWrapper.style.pointerEvents = 'none';

        // Prepare a hidden container to render PDF content nicely to HTML2PDF
        const pdfContainer = document.createElement('div');
        pdfContainer.style.padding = '40px';
        pdfContainer.style.paddingBottom = '80px';
        pdfContainer.style.fontFamily = '"Noto Sans KR", "Noto Sans SC", Inter, sans-serif, "Malgun Gothic"';
        pdfContainer.style.width = '720px';
        pdfContainer.style.color = '#222';
        pdfContainer.style.backgroundColor = '#fff';
        pdfContainer.style.lineHeight = '1.5';

        const lenEl = document.querySelector('input[name="cableLenSelection"]:checked');
        const typeEl = document.querySelector('input[name="cableTypeSelection"]:checked');
        const robotBodySelected = document.querySelector('input[name="robotBodyOption"]:checked');

        const cableLen = lenEl ? lenEl.value : 'N/A';
        const cableType = typeEl ? typeEl.value : 'Standard';
        const robotBodyOptionValue = robotBodySelected ? robotBodySelected.value : 'standard';

        const isFlex = cableType.includes('High Flex');
        let foundCode = 'N/A';
        if (currentActiveProduct.cables) {
            let matched = currentActiveProduct.cables.find(c => {
                let txt = c.cable;
                let matchFlex = isFlex ? txt.includes('High flex') : !txt.includes('High flex');
                let matchLen = txt.includes(cableLen);
                return matchFlex && matchLen;
            });
            if (matched) foundCode = matched.code;
            else if (currentActiveProduct.cables.length > 0) foundCode = currentActiveProduct.cables[0].code;
        }
        if (robotBodyOptionValue !== 'standard') foundCode = getBodyOptionPurchaseCode(currentActiveProduct, robotBodyOptionValue);

        const selectedAccs = [];

        if (robotBodySelected) {
            const bodyLabel = robotBodySelected.getAttribute('data-label') || robotBodySelected.value;
            const bodySpec = robotBodySelected.getAttribute('data-spec') || '';
            selectedAccs.push({
                name: uiText('로봇 바디 옵션'),
                details: `${uiText(bodyLabel)}${bodySpec ? ' (' + localizeDisplayText(bodySpec) + ')' : ''}`,
                code: getBodyOptionPurchaseCode(currentActiveProduct, robotBodyOptionValue) || '-'
            });
        }

        // Pendant
        const pConfig = document.querySelector('input[name="pendantConfig"]:checked');
        let pSelected = document.querySelector('input[name="pendantLength"]:checked');
        if (pConfig && pConfig.value !== 'none' && pSelected) {
            const pLen = pSelected.getAttribute('data-spec') || '';
            const showLen = pLen && pLen !== '-';
            selectedAccs.push({ 
                name: uiText('티칭 펜던트'),
                details: `${uiText(pConfig.getAttribute('data-label'))}${showLen ? ` (${uiText('길이:')} ${pLen})` : ''}`,
                code: pSelected.value 
            });
        }

        // Arm / Body I/O (Multi-pin)
        document.querySelectorAll('input[name^="armSelection_"]:checked').forEach(sel => {
            if (sel.value !== 'none') {
                const pinLabel = sel.name.split('_')[1];
                const armDesc = sel.getAttribute('data-desc') || (sel.nextElementSibling ? sel.nextElementSibling.textContent : '해당 호환 모델');
                const armLen = sel.getAttribute('data-spec') || '';
                const showLen = armLen && armLen !== '-';
                selectedAccs.push({ 
                    name: `${uiText('Arm I/O 케이블')} (${formatPinCount(pinLabel)})`,
                    details: `${uiText(armDesc)}${showLen ? ` (${uiText('길이:')} ${armLen})` : ''}`,
                    code: sel.value 
                });
            }
        });
        document.querySelectorAll('input[name^="bodySelection_"]:checked').forEach(sel => {
            if (sel.value !== 'none') {
                const pinLabel = sel.name.split('_')[1];
                const bodyDesc = sel.getAttribute('data-desc') || (sel.nextElementSibling ? sel.nextElementSibling.textContent : '해당 호환 모델');
                const bodyLen = sel.getAttribute('data-spec') || '';
                const showLen = bodyLen && bodyLen !== '-';
                selectedAccs.push({ 
                    name: `${uiText('Body I/O 케이블')} (${formatPinCount(pinLabel)})`,
                    details: `${uiText(bodyDesc)}${showLen ? ` (${uiText('길이:')} ${bodyLen})` : ''}`,
                    code: sel.value 
                });
            }
        });

        // Other Accs
        document.querySelectorAll('input[name="accSelection"]:checked').forEach(cb => {
            const fullDesc = cb.getAttribute('data-desc') || "";
            const itemLen = cb.getAttribute('data-spec') || "";
            const showLen = itemLen && itemLen !== '-';
            let namePart = "기타 악세서리";
            let detailPart = fullDesc;

            if (fullDesc.includes(' - ')) {
                const parts = fullDesc.split(' - ');
                namePart = parts[0];
                detailPart = parts.slice(1).join(' - ');
            }

            selectedAccs.push({
                name: uiText(namePart),
                details: `${uiText(detailPart)}${showLen ? ` (${uiText('길이:')} ${itemLen})` : ''}`,
                code: cb.value
            });
        });

        // Communication
        const selComm = document.querySelector('input[name="commSelection"]:checked');
        if (selComm && selComm.value !== 'none') {
            const commLabel = selComm.getAttribute('data-label') || selComm.value;
            selectedAccs.push({ 
                name: selComm.value, 
                details: `${commLabel} ${uiText('확장 카드')}`,
                code: selComm.getAttribute('data-code') || '-' 
            });
        }

        // Expansion Cards
        document.querySelectorAll('input[name="expSelection"]:checked').forEach(cb => {
            const fullDesc = cb.getAttribute('data-desc') || "";
            let namePart = "확장 카드";
            let detailPart = fullDesc;

            if (fullDesc.includes(' - ')) {
                const parts = fullDesc.split(' - ');
                namePart = parts[0];
                detailPart = parts.slice(1).join(' - ');
            }

            selectedAccs.push({
                name: uiText(namePart),
                details: uiText(detailPart),
                code: cb.value
            });
        });

        // Rename for PDF
        let pdfDisplayName = currentActiveProduct.name;
        let scaraSubtype = '';
        if (currentActiveProduct.specs.Type === 'SCARA') {
            const upperName = currentActiveProduct.name.toUpperCase();
            scaraSubtype = uiText((upperName.includes('TS4') || upperName.includes('TS5')) ? '천장형' : '일반형');

            if (currentActiveProduct.specs['Clean Type'] === 'Yes') {
                pdfDisplayName = pdfDisplayName.replace(/\s*\(Clean Type\)\s*/gi, '');
                pdfDisplayName = pdfDisplayName.replace(/Z(\d+)([S])/gi, (match, p1, p2) => {
                    let newNum = parseInt(p1) - 3;
                    return 'Z' + newNum + 'C';
                });
            }
        } else if (currentActiveProduct.specs.Type === '6-Axis') {
            pdfDisplayName = getBodyOptionModelName(currentActiveProduct.name, robotBodyOptionValue);
        }

        const tech = getTechSpecs(currentActiveProduct.name);
        const repeatability = tech ? tech.repeatability : (currentActiveProduct.specs.Type === 'SCARA' ? "±0.01mm" : "±0.02mm");
        const ioPins = formatSignalPins(tech ? (tech.signals || tech.io) : (currentActiveProduct.specs.Type === 'SCARA' ? "24 입력 / 16 출력" : "20 Signal lines"));
        
        // IP rating with safety check for detailSpecs and correct newline regex
        let ipRating = "IP40";
        if (currentActiveProduct.detailSpecs && currentActiveProduct.detailSpecs['IP rating']) {
            ipRating = currentActiveProduct.detailSpecs['IP rating'];
        } else if (tech && tech.ip) {
            ipRating = tech.ip;
        } else if (currentActiveProduct.specs.Type === 'SCARA') {
            ipRating = "IP20";
        }
        ipRating = formatIpRating(ipRating);
        
        const weight = tech ? tech.weight : (currentActiveProduct.specs.Type === '6-Axis' ? "~130kg" : "12~56kg");
        const cleanType = getCleanTypeDisplay(currentActiveProduct);
        const air = tech ? tech.air : (currentActiveProduct.detailSpecs ? (currentActiveProduct.detailSpecs['Customer air piping (0.59Mpa)'] || '-') : '-');

        let axesRowsHtml = '';
        if (tech && tech.axes) {
            const isScara = currentActiveProduct.specs.Type === 'SCARA';
            const ds = currentActiveProduct.detailSpecs || {};
            const dks = Object.keys(ds);

            let displayAxes = [...tech.axes];

            // Requirement 1 & 6: Split J1/J2 Range and show Combined Speed for PDF
            if (isScara) {
                const j1RangeKey = dks.find(k => k.toLowerCase().includes('range') && k.toLowerCase().includes('j1'));
                const j2RangeKey = dks.find(k => k.toLowerCase().includes('range') && k.toLowerCase().includes('j2'));
                const j1j2SpeedKey = dks.find(k => k.toLowerCase().includes('speed') && k.toLowerCase().includes('j1+j2'));
                const j1Range = ds[j1RangeKey];
                const j2Range = ds[j2RangeKey];
                const j1j2Speed = ds[j1j2SpeedKey];

                // Remove existing J1, J2, J1+J2 to avoid duplicates
                displayAxes = displayAxes.filter(a => !["J1+J2", "J1", "J2"].includes(a.axis));

                const newRows = [];
                if (j1j2Speed) newRows.push({ axis: "J1+J2 합산 속도", speed: formatAxisSpecValue(j1j2Speed, j1j2SpeedKey), range: "-" });
                if (j1Range) newRows.push({ axis: "J1", speed: "-", range: formatAxisSpecValue(j1Range, j1RangeKey) });
                if (j2Range) newRows.push({ axis: "J2", speed: "-", range: formatAxisSpecValue(j2Range, j2RangeKey) });

                displayAxes = [...newRows, ...displayAxes];
            }

            axesRowsHtml = `
                <tr style="border-bottom: 1px solid #eee; font-size: 11px; background: #f2f2f2; page-break-inside: avoid;">
                    <td style="padding: 8px; border: 1px solid #ddd;"></td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold;">속도</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold;">가동범위</td>
                </tr>
            ` + displayAxes.map(ax => `
                <tr style="border-bottom: 1px solid #eee; page-break-inside: avoid;">
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>${formatAxisLabel(ax.axis)}</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${ax.speed}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${ax.range}</td>
                </tr>
            `).join('');
        }

        const generatedAt = window.InoRobotI18n
            ? window.InoRobotI18n.formatDate(new Date(), { dateStyle: 'medium', timeStyle: 'medium' })
            : new Date().toLocaleString('ko-KR');
        const pdfFooterText = uiText('본 구성서는 선택된 옵션 기반의 가이드입니다. 제조사 사정에 따라 사양이 변경될 수 있습니다. 생성일시:');

        pdfContainer.innerHTML = `
            <div style="border-bottom: 2px solid #f7941d; padding-bottom: 15px; margin-bottom: 20px;">
                <h1 style="color: #222; margin: 0; font-size: 24px;">Inovance 로봇 구성서</h1>
            </div>

            <h3 style="color: #333; margin-bottom: 10px; background: #eee; padding: 10px; border-radius: 4px;">제품 기본 정보</h3>
            <p style="margin: 0 0 15px 10px;"><strong>모델 명:</strong> ${pdfDisplayName} / <strong>주문 코드:</strong> ${foundCode}</p>

            <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #ddd; margin-bottom: 30px; page-break-inside: avoid;">
                <tbody>
                    <tr style="background: #f9f9f9;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>가반 하중(Payload)</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${currentActiveProduct.specs['Payload(kg)'] || '-'} kg</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>리치(Reach)</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${currentActiveProduct.specs['Manipulator Length(mm)'] || '-'} mm</td></tr>
                    ${currentActiveProduct.specs.Type === 'SCARA' ? `<tr style="background: #f9f9f9;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>로봇 타입</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${scaraSubtype}</td></tr>` : ''}
                    ${currentActiveProduct.specs.Type === 'SCARA' ? `<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Z축 길이</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${currentActiveProduct.specs['Z axis Length(mm)'] || '-'} mm</td></tr>` : ''}
                    ${currentActiveProduct.specs.Type === '6-Axis' ? `<tr style="background: #f9f9f9;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>중공형(Hollow Wrist)</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${currentActiveProduct.specs['Hollow Wrist'] || '-'}</td></tr>` : ''}
                    <tr style="background: #f9f9f9;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>클린 타입</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${localizeDisplayText(cleanType)}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>반복 정밀도</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${formatRepeatability(repeatability)}</td></tr>
                    <tr style="background: #f9f9f9;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>방수 방진 등급</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${ipRating}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>중량</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${formatWeight(weight)}</td></tr>
                    ${axesRowsHtml}
                    <tr style="background: #f9f9f9;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>사용자 배선</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${ioPins}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>사용자 공압</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${air}</td></tr>
                </tbody>
            </table>

            <div class="html2pdf__page-break"></div>
            <div style="height: 50px; width: 100%;"></div>
            <h3 style="color: #333; margin-top: 10px; margin-bottom: 10px; background: #eee; padding: 10px; border-radius: 4px;">옵션 및 악세서리 구성</h3>
            <div style="margin-left: 10px; margin-bottom: 15px;">
                <p style="margin: 0; font-size: 13px;"><strong>기본 케이블 구성:</strong> ${uiText('파워/엔코더 케이블')} ${cableLen} (${uiText(cableType)})</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #ddd; margin-top: 10px; page-break-inside: avoid;">
                <thead>
                    <tr style="background: #eee;">
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">항목</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">코드</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">상세 정보</th>
                    </tr>
                </thead>
                <tbody>
                    ${selectedAccs.length > 0 ? selectedAccs.map(acc => `
                        <tr>
                            <td style="border: 1px solid #ddd; padding: 8px;">${acc.name}</td>
                            <td style="border: 1px solid #ddd; padding: 8px; font-family: monospace;">${acc.code}</td>
                            <td style="border: 1px solid #ddd; padding: 8px;">${acc.details}</td>
                        </tr>
                    `).join('') : '<tr style="page-break-inside: avoid;"><td colspan="3" style="border: 1px solid #ddd; padding: 8px; text-align: center; color: #888;">추가 선택 옵션 없음</td></tr>'}
                </tbody>
            </table>

            <div style="margin-top: 30px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 15px; page-break-inside: avoid;">
                ${pdfFooterText} ${generatedAt}
            </div>
        `;
        pdfWrapper.appendChild(pdfContainer);
        document.body.appendChild(pdfWrapper);
        if (window.InoRobotI18n) {
            window.InoRobotI18n.apply(pdfContainer);
        }

        const dlObj = {
            margin: [15, 15, 15, 15],
            filename: `Inovance_Config_${pdfDisplayName}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 1.5,
                useCORS: true,
                letterRendering: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: 720,
                scrollX: 0,
                scrollY: 0
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        setTimeout(() => {
            const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
            fontsReady.then(() => html2pdf().set(dlObj).from(pdfContainer).save()).then(() => {
                document.body.removeChild(pdfWrapper);
            }).catch(err => {
                console.error("PDF Generation Error:", err);
                document.body.removeChild(pdfWrapper);
            });
        }, 800);
    });

    document.getElementById('download-cad-btn').addEventListener('click', async () => {
        if (!currentActiveProduct) return;
        const btn = document.getElementById('download-cad-btn');
        const oldText = btn.innerText;
        btn.innerText = "준비 중...";
        btn.disabled = true;

        try {
            const zip = new JSZip();
            const product = currentActiveProduct;
            const modelId = product.id; // e.g. IR-R15H-145S-K-INT
            const type = product.specs.Type;
            const name = product.name;

            // Folder base mapping
            let folderBase = modelId.split('Z')[0]; // SCARA default
            if (type === '6-Axis') {
                const parts = modelId.split('-');
                if (parts.length >= 3) {
                    let lastPart = parts[2];
                    if (lastPart.endsWith('S')) lastPart = lastPart.slice(0, -1);
                    else if (lastPart.endsWith('S5')) lastPart = lastPart.slice(0, -2);
                    folderBase = parts[0] + '-' + parts[1] + '-' + lastPart;
                }
            }
            
            // Special mappings for folder bases
            const cadFolderMap = {
                "IR-R15H-145S-K-INT": "IR-R15H-145",
                "IR-R16-210S-INT": "IR-R16-210",
                "IR-R20H-120S-K-INT": "IR-R20H-120",
                "IR-R25-178S-INT": "IR-R25-178"
            };
            if(cadFolderMap[modelId]) folderBase = cadFolderMap[modelId];

            const typeDir = type === 'SCARA' ? 'SCARA' : '6-axis';
            const robotBaseUrl = `Robot_CAD/${typeDir}/${folderBase}/`;
            
            // Controller mapping
            let ctrl = "";
            if (type === "SCARA") {
                if (name.includes("S20") || name.includes("S35") || name.includes("S60") || name.includes("GS60")) {
                    ctrl = "IRCB501-SCARA-Highpower";
                } else {
                    ctrl = "IRCB501-SCARA-Standard";
                }
            } else {
                if (name.includes("R10-140") || name.includes("R16") || name.includes("R25")) {
                    ctrl = "IRCB501-6-axis-Highprotection";
                } else if (name.includes("R4") || name.includes("R7")) {
                    ctrl = "IRCB501-6-axis-Standard";
                } else {
                    ctrl = "IRCB501-6-axis-Highpower";
                }
            }

            // Pendant check
            const isPendant = document.querySelector('input[name="pendantConfig"]:checked')?.value !== 'none';
            
            // Build all potential file objects
            const robotFileTasks = [
                { id: '2D', ext: 'dwg', baseUrl: robotBaseUrl, modelId: modelId },
                { id: '3D', ext: 'stp', baseUrl: robotBaseUrl, modelId: modelId }
            ];

            const ctrlFiles = [
                { path: `Robot_CAD/Controller/${ctrl}/${ctrl}.dwg`, name: `${ctrl}.dwg` },
                { path: `Robot_CAD/Controller/${ctrl}/${ctrl}.stp`, name: `${ctrl}.stp` }
            ];

            const tpFiles = isPendant ? [
                { path: `Robot_CAD/IR-TP-200/IR-TP-200_2D-INT.dwg`, name: `IR-TP-200_2D.dwg` },
                { path: `Robot_CAD/IR-TP-200/IR-TP-200_3D-INT.stp`, name: `IR-TP-200_3D.stp` }
            ] : [];

            // Helper to fetch single file with fallback (for -INT suffix)
            async function fetchRobotFile(task) {
                const pathsToTry = getCadCandidatePaths(product, task.id, task.ext);

                for (let p of pathsToTry) {
                    try {
                        const r = await fetch(p);
                        if (r.ok) return { name: `${task.modelId}_${task.id}.${task.ext}`, blob: await r.blob() };
                    } catch(e) {}
                }
                return null;
            }

            async function fetchStaticFile(f) {
                try {
                    const r = await fetch(f.path);
                    if (r.ok) return { name: f.name, blob: await r.blob() };
                } catch(e) {}
                return null;
            }

            // Run in parallel
            const [robotRes, ctrlRes, tpRes] = await Promise.all([
                Promise.all(robotFileTasks.map(fetchRobotFile)),
                Promise.all(ctrlFiles.map(fetchStaticFile)),
                Promise.all(tpFiles.map(fetchStaticFile))
            ]);

            // Add to Zip
            [...robotRes, ...ctrlRes, ...tpRes].forEach(res => {
                if (res) zip.file(res.name, res.blob);
            });

            if (Object.keys(zip.files).length === 0) {
                alert(uiText("다운로드 가능한 캐드 파일이 없습니다."));
                return;
            }

            const content = await zip.generateAsync({ type: "blob", compression: "STORE" });
            saveAs(content, `Inovance_CAD_${modelId}.zip`);

        } catch (err) {
            console.error("CAD Zip Error:", err);
            alert(uiText("CAD 파일 생성 중 오류가 발생했습니다."));
        } finally {
            btn.innerText = oldText;
            btn.disabled = false;
        }
    });

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.style.display = 'none';
            currentActiveProduct = null;
        }
    });

    function captureModalSelections() {
        return new Set(Array.from(modalBody.querySelectorAll('input:checked')).map(input => `${input.name}\u0000${input.value}`));
    }

    function restoreModalSelections(selected) {
        modalBody.querySelectorAll('input').forEach(input => {
            if (input.type === 'radio' || input.type === 'checkbox') {
                input.checked = selected.has(`${input.name}\u0000${input.value}`);
            }
        });
    }

    document.addEventListener('inorobot:languagechange', () => {
        const activeProductId = currentActiveProduct && modalOverlay.style.display !== 'none'
            ? currentActiveProduct.id
            : null;
        const selected = activeProductId ? captureModalSelections() : null;
        renderFilters();
        renderProducts();
        if (activeProductId && selected) {
            openOptionsModal(activeProductId);
            restoreModalSelections(selected);
            const pendantConfig = modalBody.querySelector('input[name="pendantConfig"]:checked');
            if (pendantConfig) pendantConfig.dispatchEvent(new Event('change', { bubbles: true }));
            restoreModalSelections(selected);
            const cableLength = modalBody.querySelector('input[name="cableLenSelection"]:checked');
            if (cableLength) cableLength.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });

    renderFilters();
    renderProducts();


});
