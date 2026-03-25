document.addEventListener('DOMContentLoaded', () => {
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
            labelArea.textContent = filterCategory.label;

            const optionsArea = document.createElement('div');
            optionsArea.className = 'filter-options';

            let hasVisibleOptions = false;

            filterCategory.options.forEach(opt => {
                let isValid = false;

                if (opt.isSelected) {
                    isValid = true;
                } else {
                    isValid = state.products.some(p => {
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
                btn.textContent = opt.label;
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
            for (const catId in activeConstraints) {
                const productVal = String(product.specs[catId]);
                if (!activeConstraints[catId].includes(productVal)) {
                    return false;
                }
            }
            return true;
        });

        if (filteredProducts.length === 0) {
            productContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted)">현재 필터 규칙에 맞는 모델이 없습니다.</div>`;
            return;
        }

        filteredProducts.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';

            const name = product.name.toUpperCase();
            let scaraSubtype = '';
            if (product.specs.Type === 'SCARA') {
                if (name.includes('TS4') || name.includes('TS5')) {
                    scaraSubtype = '천장형';
                    product.image = 'scara_ceiling.png';
                } else {
                    scaraSubtype = '일반형';
                    product.image = 'scara_std.png';
                }
            } else {
                if (name.includes('R10-140') || name.includes('R16') || name.includes('R25')) {
                    product.image = 'axis6_heavy.png';
                } else if (name.includes('R4-56S-INT')) {
                    product.image = 'axis6_med.png';
                } else if (name.includes('R4') || name.includes('R7') || name.includes('R10H')) {
                    product.image = 'axis6_std.png';
                } else {
                    product.image = 'axis6_med.png';
                }
            }

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
                        <span>타입</span>
                        <span class="spec-value">${scaraSubtype}</span>
                    </div>
                    <div class="spec-row">
                        <span>Z축 길이 (mm)</span>
                        <span class="spec-value">${product.specs['Z axis Length(mm)'] || '-'}</span>
                    </div>
                `;
            } else if (product.specs.Type === '6-Axis') {
                extraSpecsHTML = `
                    <div class="spec-row">
                        <span>중공형</span>
                        <span class="spec-value">${product.specs['Hollow Wrist'] || '-'}</span>
                    </div>
                `;
            }

            card.innerHTML = `
                <img src="${product.image}" alt="${product.name}" class="product-image" style="pointer-events:none; min-height:180px;">
                <div class="product-name" style="pointer-events:none;">${displayName}</div>
                <div class="product-specs" style="pointer-events:none;">
                    <div class="spec-row">
                        <span>가반 하중 (kg)</span>
                        <span class="spec-value">${product.specs['Payload(kg)'] || '-'}</span>
                    </div>
                    <div class="spec-row">
                        <span>리치 (mm)</span>
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
        let num = parseFloat(l.replace('m', ''));
        return isNaN(num) ? 999 : num;
    }

    const technicalSpecsMap = {
        'R4-56': {
            repeatability: '±0.01 mm',
            signals: '12 Signal lines 30V 0.5A',
            air: 'Φ4mm x 4, 0.59 MPa',
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
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
            ip: 'IP40',
            weight: '74.5 kg',
            axes: [
                { axis: 'J1+J2', speed: '9400 mm/s', range: 'J1: ±139°, J2: ±151°' },
                { axis: 'J3', speed: '2100 mm/s', range: '420 mm' },
                { axis: 'J4', speed: '705°/s', range: '±360°' }
            ]
        },
        'GS60-120': {
            repeatability: 'J1+J2: ±0.07mm, J3: ±0.02mm',
            signals: '25 Signal lines',
            air: 'Φ6mm x 2, Φ8mm x 2',
            ip: 'IP40',
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

    // Modal Logic
    function openOptionsModal(productId) {
        const product = state.products.find(p => p.id === productId);
        if (!product) return;

        // Rename SCARA clean types for modal title
        let displayName = product.name;
        let scaraSubtype = '';
        if (product.specs.Type === 'SCARA') {
            const upperName = product.name.toUpperCase();
            scaraSubtype = (upperName.includes('TS4') || upperName.includes('TS5')) ? '천장형' : '일반형';

            if (product.specs['Clean Type'] === 'Yes') {
                displayName = displayName.replace(/\s*\(Clean Type\)\s*/gi, '');
                displayName = displayName.replace(/Z(\d+)([S])/gi, (match, p1, p2) => {
                    let newNum = parseInt(p1) - 3;
                    return 'Z' + newNum + 'C';
                });
            }
        }

        currentActiveProduct = product;
        document.getElementById('modal-title').textContent = `[${displayName}] 제품 상세 및 구성`;
        modalBody.innerHTML = '';

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

        const tech = getTechSpecs(product.name);
        const repeatability = tech ? tech.repeatability : (product.specs.Type === 'SCARA' ? "±0.01mm" : "±0.02mm");
        const ioPins = tech ? (tech.signals || tech.io) : (product.specs.Type === 'SCARA' ? "24 입력 / 16 출력" : "20 Signal lines");
        const ipRating = tech ? tech.ip : (product.specs.Type === 'SCARA' ? "IP40" : "IP65 (Wrist IP67)");
        const weight = tech ? tech.weight : (product.specs.Type === '6-Axis' ? "~130kg" : "12~56kg");
        const cleanType = product.specs['Clean Type'] || '-';

        let axesRows = '';
        if (tech && tech.axes) {
            axesRows = `
                <tr style="border-bottom: 1px solid #eee; font-size: 11px; color: #666;">
                    <td></td>
                    <td style="text-align:right; padding: 4px 5px 4px 0;">속도</td>
                    <td style="text-align:right; padding: 4px 0;">가동범위</td>
                </tr>
            ` + tech.axes.map(ax => `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding:6px 0;"><strong>${ax.axis} 사양</strong></td>
                    <td style="text-align:right; padding-right:10px;">${ax.speed}</td>
                    <td style="text-align:right;">${ax.range}</td>
                </tr>
            `).join('');
        }

        const specHtml = `
            <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <h4 style="margin-bottom: 12px; color: var(--primary-blue); border-bottom: 1px solid #ccc; padding-bottom: 8px;">로봇 스펙 정보</h4>
                <table style="width:100%; font-size:13px; border-collapse: collapse;">
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding:6px 0;"><strong>가반 하중(Payload)</strong></td><td colspan="2" style="text-align:right;">${product.specs['Payload(kg)'] || '-'} kg</td></tr>
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding:6px 0;"><strong>리치(Reach)</strong></td><td colspan="2" style="text-align:right;">${product.specs['Manipulator Length(mm)'] || '-'} mm</td></tr>
                    ${product.specs.Type === 'SCARA' ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding:6px 0;"><strong>로봇 타입</strong></td><td colspan="2" style="text-align:right;">${scaraSubtype}</td></tr>` : ''}
                    ${product.specs.Type === 'SCARA' ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding:6px 0;"><strong>Z축 길이</strong></td><td colspan="2" style="text-align:right;">${product.specs['Z axis Length(mm)'] || '-'} mm</td></tr>` : ''}
                    ${product.specs.Type === '6-Axis' ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding:6px 0;"><strong>중공형(Hollow Wrist)</strong></td><td colspan="2" style="text-align:right;">${product.specs['Hollow Wrist'] || '-'}</td></tr>` : ''}
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding:6px 0;"><strong>클린 타입</strong></td><td colspan="2" style="text-align:right;">${cleanType}</td></tr>
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding:6px 0;"><strong>반복 정밀도</strong></td><td colspan="2" style="text-align:right;">${repeatability}</td></tr>
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding:6px 0;"><strong>방수 방진 등급</strong></td><td colspan="2" style="text-align:right;">${ipRating}</td></tr>
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding:6px 0;"><strong>중량</strong></td><td colspan="2" style="text-align:right;">${weight}</td></tr>
                    ${axesRows}
                    <tr style="border-bottom: 1px solid #eee;"><td style="padding:6px 0;"><strong>사용자 배선</strong></td><td colspan="2" style="text-align:right;">${ioPins}</td></tr>
                    <tr><td style="padding:6px 0;"><strong>사용자 공압</strong></td><td colspan="2" style="text-align:right;">${tech ? tech.air : '-'}</td></tr>
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
            <div id="dynamic-purchase-code" style="font-size:14px;color:#666;margin-bottom:8px;font-weight:bold;color:var(--primary-blue);">현재 구매 코드: ${baseCode}</div>
            <h2 style="color:#333;margin-bottom:12px;">${displayName}</h2>
            <p style="font-size:14px;color:#555;margin-bottom:24px;line-height:1.6;">
                Inovance 산업용 로봇 (${product.specs.Type}). 제조 과정의 높은 정밀도와 효율성을 위해 설계되었습니다.
            </p>
            
            <h4 style="margin-bottom: 12px; color: var(--text-main);">로봇 구성 선택</h4>
            
            <div style="margin-bottom:16px;">
                <label style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px;">파워/엔코더 케이블 길이 <span style="color:red">*</span></label>
                <div id="cable-len-container" style="display:flex; gap:10px;"></div>
            </div>
            <div style="margin-bottom:20px;">
                <label style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px;">파워/엔코더 케이블 타입 <span style="color:red">*</span></label>
                <div id="cable-type-container" style="display:flex; gap:10px;"></div>
            </div>

            <div style="margin-bottom:20px; border-top:1px dashed #ccc; padding-top:16px;">
                <label style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px;">티칭 펜던트 길이 선택</label>
                <div id="pendant-container" style="display:flex; flex-direction:column; gap:8px;"></div>
            </div>

            ${product.specs.Type === '6-Axis' ? `
            <div style="margin-bottom:12px; border-top:1px dashed #ccc; padding-top:16px;">
                <label style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px;">Arm I/O 케이블 구성</label>
                <div id="arm-container" style="display:flex; flex-direction:column; gap:8px;"></div>
            </div>
            <div style="margin-bottom:20px; border-top:1px dashed #ccc; padding-top:16px;">
                <label style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px;">Body I/O 케이블 구성</label>
                <div id="body-container" style="display:flex; flex-direction:column; gap:8px;"></div>
            </div>` : ''}

            <div style="margin-bottom:20px; border-top:1px dashed #ccc; padding-top:16px;">
                <label style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px;">기타 악세서리</label>
                <div id="other-accessories-container" style="display:flex; flex-direction:column; gap:8px;"></div>
            </div>

            <div style="margin-bottom:20px; border-top:1px dashed #ccc; padding-top:16px;">
                <label style="display:block; font-size:13px; font-weight:bold; margin-bottom:6px;">통신 프로토콜 옵션</label>
                <p style="font-size:11px; color:#666; margin-bottom:8px;">Modbus-RTU, Modbus-TCP, EtherNet/IP, EtherCAT, MC 통신은 기본 제공됩니다.</p>
                <div id="comm-radios" style="display:flex; flex-wrap:wrap; gap:10px;">
                    <label class="cable-option" style="margin:0;">
                        <input type="radio" name="commSelection" value="none" checked>
                        <span>기본 프로토콜 사용</span>
                    </label>
                    <label class="cable-option" style="margin:0;">
                        <input type="radio" name="commSelection" value="PROFINET">
                        <span>PROFINET</span>
                    </label>
                    <label class="cable-option" style="margin:0;">
                        <input type="radio" name="commSelection" value="CC-Link">
                        <span>CC-Link</span>
                    </label>
                </div>
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

        Array.from(lengths).sort((a, b) => parseLen(a) - parseLen(b)).forEach((l, i) => {
            const btn = document.createElement('label');
            btn.className = 'cable-option';
            btn.style.margin = '0';

            let isChecked = (product.specs.Type === '6-Axis') ? (l === '5m') : (i === 0);

            btn.innerHTML = `<input type="radio" name="cableLenSelection" value="${l}" ${isChecked ? 'checked' : ''}><span>${l}</span>`;
            lenContainer.appendChild(btn);
        });

        Array.from(types).forEach((t, i) => {
            const btn = document.createElement('label');
            btn.className = 'cable-option';
            btn.style.margin = '0';
            btn.innerHTML = `<input type="radio" name="cableTypeSelection" value="${t}" ${i === 0 ? 'checked' : ''}><span>${t}</span>`;
            typeContainer.appendChild(btn);
        });

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
            if (codeDisplay) {
                const finalCode = matched ? matched.code : (product.cables.length > 0 ? product.cables[0].code : 'N/A');
                codeDisplay.textContent = `현재 구매 코드: ${finalCode} `;
            }
        }

        lenContainer.addEventListener('change', updateDynamicCode);
        typeContainer.addEventListener('change', updateDynamicCode);
        updateDynamicCode();

        // Pendant Logic
        const pendantContainer = rightCol.querySelector('#pendant-container');
        let mainPendants = state.accessories.filter(a => ['01640055', '01640056', '01640057', '01640058'].includes(a.code));

        if (mainPendants.length === 0) {
            mainPendants = state.accessories.filter(a => a.description.toLowerCase().includes('teach pendant') && a.description.match(/\d+ m\)/));
        }

        pendantContainer.innerHTML = `
            <div style="display:flex; flex-wrap:wrap; gap:10px;" id="pendant-radios">
                <label class="cable-option" style="margin:0;">
                    <input type="radio" name="pendantLength" value="none" checked data-desc="사용안함">
                    <span>사용안함</span>
                </label>
            </div>
        `;

        const pRadios = pendantContainer.querySelector('#pendant-radios');

        mainPendants.sort((a, b) => {
            let nA = (a.description.match(/\d+/) || [0])[0];
            let nB = (b.description.match(/\d+/) || [0])[0];
            return Number(nA) - Number(nB);
        }).forEach((opt) => {
            const l = opt.description.match(/\d+ ?m/) ? opt.description.match(/\d+ ?m/)[0] : opt.type;
            pRadios.innerHTML += `
                <label class="cable-option" style="margin:0;">
                    <input type="radio" name="pendantLength" value="${opt.code}" data-desc="${opt.description}">
                    <span>${l}</span>
                </label>
            `;
        });

        // Arm / Body Cable Logic parsing
        let armBodyCodesUsed = [];
        if (product.specs.Type === '6-Axis') {
            const baseModel = product.name.split('-')[1]; // e.g. R4H, R10
            let altBase = baseModel.replace(/^R/, ''); // e.g. 4H, 10

            // ALL compatible Arm Cables for this exact robot
            const armOptionsAll = state.accessories.filter(a => {
                if (!a.type.toLowerCase().includes('arm') && !a.description.toLowerCase().includes('arm')) return false;
                if (!a.type.toLowerCase().includes('cable')) return false;

                // check model compatibility strings
                let desc = a.description.toUpperCase();
                return desc.includes(baseModel.toUpperCase()) || desc.includes('/' + altBase.toUpperCase() + '/');
            });

            // Extract lengths out from arm cords
            let armLenOptions = [];
            let seenArmLabels = new Set();
            armOptionsAll.forEach(a => {
                let m = a.description.toLowerCase().match(/(\d+\.?\d*)\s*m/);
                let label = m ? m[0] : (a.description.toLowerCase().includes('without') ? 'None' : '');

                if (label && label !== 'None' && !seenArmLabels.has(label)) {
                    seenArmLabels.add(label);
                    armLenOptions.push({ code: a.code, label: label, desc: a.description });
                }
            });

            const armContainer = rightCol.querySelector('#arm-container');
            if (armLenOptions.length > 0) {
                armContainer.innerHTML = `
                    <div style="display:flex; flex-wrap:wrap; gap:10px;" id="arm-radios">
                        <label class="cable-option" style="margin:0;">
                            <input type="radio" name="armSelectionCode" value="none" checked>
                            <span>사용안함</span>
                        </label>
                    </div>
                `;
                const armRadios = armContainer.querySelector('#arm-radios');

                armLenOptions.sort((a, b) => parseLen(a.label) - parseLen(b.label)).forEach((opt) => {
                    armRadios.innerHTML += `
                        <label class="cable-option" style="margin:0;">
                            <input type="radio" name="armSelectionCode" value="${opt.code}" data-desc="${opt.desc}">
                            <span>${opt.label}</span>
                        </label>
                    `;
                });
            } else {
                armContainer.innerHTML = `<span style="font-size:13px; color:#999;">해당 모델에 호환되는 Arm 케이블 옵션이 없습니다.</span>`;
            }

            // Body Cables logic
            const bodyOptionsAll = state.accessories.filter(a => {
                if (!a.type.toLowerCase().includes('body') && !a.description.toLowerCase().includes('body')) return false;
                if (!a.type.toLowerCase().includes('cable')) return false;

                let desc = a.description.toUpperCase();
                return desc.includes(baseModel.toUpperCase()) || desc.includes('/' + altBase.toUpperCase() + '/');
            });

            // They have "Flexible", "Non-Flexible", and "5m", "10m", "15m" combinations
            let bodyOptionsParsed = bodyOptionsAll.map(a => {
                let flexMatch = a.type.toLowerCase().includes('non-flex') ? 'Non-Flexible' : 'Flexible';
                let m = a.type.toLowerCase().match(/(\d+\.?\d*)\s*m/);
                let length = m ? m[0] : '10m';
                return { code: a.code, flex: flexMatch, length: length, desc: a.description };
            });

            const bodyContainer = rightCol.querySelector('#body-container');
            if (bodyOptionsParsed.length > 0) {
                let uniqueFlex = [...new Set(bodyOptionsParsed.map(x => x.flex))];
                let uniqueLen = [...new Set(bodyOptionsParsed.map(x => x.length))];

                bodyContainer.innerHTML = `
                    <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px;" id="body-flex-radios">
                        <label class="cable-option" style="margin:0;">
                            <input type="radio" name="bodyFlexTemp" value="none" checked>
                            <span>사용안함</span>
                        </label>
                    </div>

                    <div id="body-options-block" style="display:none; margin-top:10px;">
                        <label style="display:block; font-size:13px; margin-bottom:6px;">케이블 길이:</label>
                        <div style="display:flex; flex-wrap:wrap; gap:10px;" id="body-len-radios"></div>
                        <input type="hidden" id="bodySelectionCode" name="bodySelection" value="">
                        <input type="hidden" id="bodySelectionDesc" name="bodySelectionDesc" value="">
                        <div id="body-warning" style="color:red; font-size:12px; margin-top:8px; display:none;">해당 타입과 길이의 조합은 제공되지 않습니다.</div>
                    </div>
                `;

                const bodyBlock = bodyContainer.querySelector('#body-options-block');
                const flexRadios = bodyContainer.querySelector('#body-flex-radios');
                const lenRadios = bodyContainer.querySelector('#body-len-radios');

                uniqueFlex.forEach((f, idx) => {
                    flexRadios.innerHTML += `
                        <label class="cable-option" style="margin:0;">
                            <input type="radio" name="bodyFlexTemp" value="${f}">
                            <span>${f}</span>
                        </label>
                    `;
                });

                uniqueLen.sort((a, b) => parseLen(a) - parseLen(b)).forEach((l, idx) => {
                    lenRadios.innerHTML += `
                        <label class="cable-option" style="margin:0;">
                            <input type="radio" name="bodyLenTemp" value="${l}" ${idx === 0 ? 'checked' : ''}>
                            <span>${l}</span>
                        </label>
                    `;
                });

                // function to update hidden field
                function updateBodySelection() {
                    const selFlexNode = document.querySelector('input[name="bodyFlexTemp"]:checked');
                    if (!selFlexNode || selFlexNode.value === 'none') {
                        bodyBlock.style.display = 'none';
                        document.getElementById('bodySelectionCode').value = "none";
                        document.getElementById('body-warning').style.display = 'none';
                        return;
                    }

                    bodyBlock.style.display = 'block';
                    const selFlex = selFlexNode.value;
                    const selLenNode = document.querySelector('input[name="bodyLenTemp"]:checked');
                    const selLen = selLenNode ? selLenNode.value : '';

                    const matched = bodyOptionsParsed.find(x => x.flex === selFlex && x.length === selLen);

                    if (matched) {
                        document.getElementById('bodySelectionCode').value = matched.code;
                        document.getElementById('bodySelectionDesc').value = matched.desc;
                        document.getElementById('body-warning').style.display = 'none';
                    } else {
                        document.getElementById('bodySelectionCode').value = "";
                        document.getElementById('bodySelectionDesc').value = "";
                        document.getElementById('body-warning').style.display = 'block';
                    }
                }

                flexRadios.addEventListener('change', updateBodySelection);
                lenRadios.addEventListener('change', updateBodySelection);

                setTimeout(updateBodySelection, 50);
            } else {
                bodyContainer.innerHTML = `<span style="font-size:13px; color:#999;">해당 모델에 호환되는 Body 케이블 옵션이 없습니다.</span>`;
            }
        }

        let allArmBodyCodes = state.accessories.filter(a => {
            if (!a.type.toLowerCase().includes('cable')) return false;
            if (a.type.toLowerCase().includes('arm') || a.description.toLowerCase().includes('arm') ||
                a.type.toLowerCase().includes('body') || a.description.toLowerCase().includes('body')) {
                return true;
            }
            return false;
        }).map(x => x.code);

        // Other Accessories Logic
        const otherAccContainer = rightCol.querySelector('#other-accessories-container');
        let otherOptions = state.accessories.filter(a => {
            let typStr = a.type.toLowerCase();
            let descStr = a.description.toLowerCase();

            // 1. I/O cable 삭제 (already arm/body checked but force exclusion)
            if (typStr.includes('i/o') || descStr.includes('i/o')) return false;

            // 2. 로봇 시뮬레이션 프로그램 삭제
            if (typStr.includes('simulation') || descStr.includes('simulation')) return false;

            // 3. 호밍 툴 SCARA/6-Axis 매칭 및 세부 필터링
            let isHoming = typStr.includes('homing') || descStr.includes('homing');
            if (isHoming) {
                let forScara = descStr.includes('scara');
                if (product.specs.Type === 'SCARA' && !forScara) return false;
                if (product.specs.Type === '6-Axis') {
                    if (forScara) return false;
                    // Distinguish between R4/7/10/11 and R10(1422)/16/25
                    let isR10Large = descStr.includes('r10\uff081422mm\uff09') || descStr.includes('r16') || descStr.includes('r25');
                    let isR4Small = descStr.includes('r4') || descStr.includes('r7') || descStr.includes('r11') || descStr.includes('r10\uff081100mm\uff09');

                    const prodName = product.name.toUpperCase();
                    if (isR10Large) {
                        if (!prodName.includes('R10-140') && !prodName.includes('R16') && !prodName.includes('R25')) return false;
                    }
                    if (isR4Small) {
                        if (prodName.includes('R10-140') || prodName.includes('R16') || prodName.includes('R25')) return false;
                    }
                }
            }

            // 4. 브레이크 릴리즈 박스는 다관절 용 (SCARA 배제)
            let isBrake = typStr.includes('brake') || descStr.includes('brake') || typStr.includes('release') || descStr.includes('release');
            if (isBrake && product.specs.Type === 'SCARA') return false;

            // 5. 포크 리프트 툴은 다관절 R10-140, R16, R25만
            let isForklift = typStr.includes('forklift') || descStr.includes('forklift') || typStr.includes('fork lift') || descStr.includes('fork lift');
            if (isForklift) {
                if (product.specs.Type !== '6-Axis') return false;
                if (!product.name.includes('R10-140') && !product.name.includes('R16') && !product.name.includes('R25')) return false;
            }

            // 6. Telescopic cover는 스카라 전용, 페이로드 매칭
            let isTelescopic = typStr.includes('telescopic') || descStr.includes('telescopic');
            if (isTelescopic) {
                if (product.specs.Type !== 'SCARA') return false;
                let payload = product.specs['Payload(kg)'];
                if (!descStr.includes(payload + 'kg')) return false;
            }

            // 7. Network cable accessory 필터링
            if (typStr.includes('network cable') || descStr.includes('network port')) {
                if (product.specs.Type === 'SCARA') return false;
                const prodName = product.name.toUpperCase();
                if (prodName.includes('R10-140') || prodName.includes('R16') || prodName.includes('R25')) return false;
            }

            // 8. Base exclusions (Pendant and Arm/Body)
            let isPendant = descStr.includes('pendant') || typStr.includes('pendant');
            let isArmBody = allArmBodyCodes.includes(a.code);
            return !isPendant && !isArmBody;
        });

        // 8. 엔코더 배터리 이름 수정 (여분 구매)
        otherOptions = otherOptions.map(a => {
            let descStr = a.description.toLowerCase();
            if (descStr.includes('battery')) {
                return { ...a, type: a.type, description: a.description + ' (여분 구매)' };
            }
            return a;
        });

        if (otherOptions.length > 0) {
            otherOptions.forEach(acc => {
                const lbl = document.createElement('label');
                lbl.style.display = "flex";
                lbl.style.alignItems = "start";
                lbl.style.gap = "8px";
                lbl.style.fontSize = "13px";
                lbl.style.cursor = "pointer";
                lbl.innerHTML = `
                    <input type="checkbox" name="accSelection" value="${acc.code}" data-desc="${acc.type} - ${acc.description}" style="margin-top:3px;">
                    <div>
                        <strong>${acc.type || 'Accessory'}</strong><br>
                        <span style="color:#666;">${acc.description}</span>
                    </div>
                `;
                otherAccContainer.appendChild(lbl);
            });
        } else {
            otherAccContainer.innerHTML = '<span style="color:#999; font-size:13px;">기타 악세서리가 없습니다.</span>';
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
            alert("선택하신 Body I/O 케이블 타입 및 길이 조합은 사용할 수 없습니다.\n다른 조합을 선택해 주세요.");
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
        pdfContainer.style.fontFamily = 'Inter, sans-serif, "Malgun Gothic"';
        pdfContainer.style.width = '720px';
        pdfContainer.style.color = '#222';
        pdfContainer.style.backgroundColor = '#fff';
        pdfContainer.style.lineHeight = '1.5';

        const lenEl = document.querySelector('input[name="cableLenSelection"]:checked');
        const typeEl = document.querySelector('input[name="cableTypeSelection"]:checked');

        const cableLen = lenEl ? lenEl.value : 'N/A';
        const cableType = typeEl ? typeEl.value : 'Standard';

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

        const selectedAccs = [];

        // Pendant
        let pSelected = document.querySelector('input[name="pendantLength"]:checked');
        if (pSelected && pSelected.value !== 'none') {
            selectedAccs.push({ name: '티칭 펜던트', details: pSelected.getAttribute('data-desc'), code: pSelected.value });
        }

        // Arm
        let armSelected = document.querySelector('input[name="armSelectionCode"]:checked');
        if (armSelected && armSelected.value !== 'none') {
            const armDesc = armSelected.getAttribute('data-desc') || (armSelected.nextElementSibling ? armSelected.nextElementSibling.textContent : '해당 호환 모델');
            selectedAccs.push({ name: 'Arm I/O 케이블', details: armDesc, code: armSelected.value });
        }

        // Body
        if (wantsBody) {
            const bodyDesc = document.getElementById('bodySelectionDesc').value;
            selectedAccs.push({ name: 'Body I/O 케이블', details: bodyDesc, code: bodyCodeInput.value });
        }

        // Other Accs
        document.querySelectorAll('input[name="accSelection"]:checked').forEach(cb => {
            const fullDesc = cb.getAttribute('data-desc') || "";
            let namePart = "기타 악세서리";
            let detailPart = fullDesc;

            if (fullDesc.includes(' - ')) {
                const parts = fullDesc.split(' - ');
                namePart = parts[0];
                detailPart = parts.slice(1).join(' - ');
            }

            selectedAccs.push({
                name: namePart,
                details: detailPart,
                code: cb.value
            });
        });

        // Communication
        const selComm = document.querySelector('input[name="commSelection"]:checked');
        if (selComm && selComm.value !== 'none') {
            selectedAccs.push({ name: '추가 통신 옵션', details: selComm.value, code: '-' });
        }

        // Rename for PDF
        let pdfDisplayName = currentActiveProduct.name;
        let scaraSubtype = '';
        if (currentActiveProduct.specs.Type === 'SCARA') {
            const upperName = currentActiveProduct.name.toUpperCase();
            scaraSubtype = (upperName.includes('TS4') || upperName.includes('TS5')) ? '천장형' : '일반형';

            if (currentActiveProduct.specs['Clean Type'] === 'Yes') {
                pdfDisplayName = pdfDisplayName.replace(/\s*\(Clean Type\)\s*/gi, '');
                pdfDisplayName = pdfDisplayName.replace(/Z(\d+)([S])/gi, (match, p1, p2) => {
                    let newNum = parseInt(p1) - 3;
                    return 'Z' + newNum + 'C';
                });
            }
        }

        const tech = getTechSpecs(currentActiveProduct.name);
        const repeatability = tech ? tech.repeatability : (currentActiveProduct.specs.Type === 'SCARA' ? "±0.01mm" : "±0.02mm");
        const ioPins = tech ? (tech.signals || tech.io) : (currentActiveProduct.specs.Type === 'SCARA' ? "24 입력 / 16 출력" : "20 Signal lines");
        const ipRating = tech ? tech.ip : (currentActiveProduct.specs.Type === 'SCARA' ? "IP40" : "IP65 (Wrist IP67)");
        const weight = tech ? tech.weight : (currentActiveProduct.specs.Type === '6-Axis' ? "~130kg" : "12~56kg");
        const cleanType = currentActiveProduct.specs['Clean Type'] || '-';

        let axesRows = '';
        if (tech && tech.axes) {
            axesRows = `
                <tr style="border-bottom: 1px solid #eee; font-size: 11px; background: #f2f2f2;">
                    <td style="padding: 8px; border: 1px solid #ddd;"></td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold;">속도</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold;">가동범위</td>
                </tr>
            ` + tech.axes.map(ax => `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>${ax.axis} 사양</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${ax.speed}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${ax.range}</td>
                </tr>
            `).join('');
        }

        pdfContainer.innerHTML = `
            <div style="border-bottom: 2px solid #f7941d; padding-bottom: 15px; margin-bottom: 20px;">
                <h1 style="color: #222; margin: 0; font-size: 24px;">Inovance 로봇 구성서</h1>
            </div>

            <h3 style="color: #333; margin-bottom: 10px; background: #eee; padding: 10px; border-radius: 4px;">제품 기본 정보</h3>
            <p style="margin: 0 0 15px 10px;"><strong>모델 명:</strong> ${pdfDisplayName} / <strong>주문 코드:</strong> ${foundCode}</p>

            <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #ddd; margin-bottom: 30px;">
                <tbody>
                    <tr style="background: #f9f9f9;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>가반 하중(Payload)</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${currentActiveProduct.specs['Payload(kg)'] || '-'} kg</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>리치(Reach)</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${currentActiveProduct.specs['Manipulator Length(mm)'] || '-'} mm</td></tr>
                    ${currentActiveProduct.specs.Type === 'SCARA' ? `<tr style="background: #f9f9f9;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>로봇 타입</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${scaraSubtype}</td></tr>` : ''}
                    ${currentActiveProduct.specs.Type === 'SCARA' ? `<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Z축 길이</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${currentActiveProduct.specs['Z axis Length(mm)'] || '-'} mm</td></tr>` : ''}
                    ${currentActiveProduct.specs.Type === '6-Axis' ? `<tr style="background: #f9f9f9;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>중공형(Hollow Wrist)</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${currentActiveProduct.specs['Hollow Wrist'] || '-'}</td></tr>` : ''}
                    <tr style="background: #f9f9f9;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>클린 타입</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${cleanType}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>반복 정밀도</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${repeatability}</td></tr>
                    <tr style="background: #f9f9f9;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>방수 방진 등급</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${ipRating}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>중량</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${weight}</td></tr>
                    ${axesRows}
                    <tr style="background: #f9f9f9;"><td style="padding: 8px; border: 1px solid #ddd;"><strong>사용자 배선</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${ioPins}</td></tr>
                    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>사용자 공압</strong></td><td colspan="2" style="text-align: right; border: 1px solid #ddd;">${tech ? tech.air : '-'}</td></tr>
                </tbody>
            </table>

            <h3 style="color: #333; margin-top: 30px; margin-bottom: 10px; background: #eee; padding: 10px; border-radius: 4px;">옵션 및 악세서리 구성</h3>
            <div style="margin-left: 10px; margin-bottom: 15px;">
                <p style="margin: 0; font-size: 13px;"><strong>기본 케이블 구성:</strong> 파워/엔코더 케이블 ${cableLen} (${cableType})</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #ddd;">
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
                    `).join('') : '<tr><td colspan="3" style="border: 1px solid #ddd; padding: 8px; text-align: center; color: #888;">추가 선택 옵션 없음</td></tr>'}
                </tbody>
            </table>

            <div style="margin-top: 50px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 15px;">
                본 구성서는 선택된 옵션 기반의 가이드입니다. 제조사 사정에 따라 사양이 변경될 수 있습니다. 생성일시: ${new Date().toLocaleString('ko-KR')}
            </div>
        `;
        pdfWrapper.appendChild(pdfContainer);
        document.body.appendChild(pdfWrapper);

        const dlObj = {
            margin: [10, 10, 10, 10],
            filename: `Inovance_Config_${currentActiveProduct.name}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                letterRendering: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: 720,
                scrollX: 0,
                scrollY: 0
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        setTimeout(() => {
            html2pdf().set(dlObj).from(pdfContainer).save().then(() => {
                document.body.removeChild(pdfWrapper);
            }).catch(err => {
                console.error("PDF Generation Error:", err);
                document.body.removeChild(pdfWrapper);
            });
        }, 800);
    });

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.style.display = 'none';
            currentActiveProduct = null;
        }
    });

    renderFilters();
    renderProducts();
});
