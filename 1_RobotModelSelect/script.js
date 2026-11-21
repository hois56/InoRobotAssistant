document.addEventListener('DOMContentLoaded', () => {
    const isManualEmbed = new URLSearchParams(window.location.search).get('embed') === 'manual';
    const modelPages = window.InoRobotModelPages;
    const configurationWorkbook = window.InoRobotConfigurationWorkbook;
    const escapeHtml = modelPages.escapeHtml;
    if (isManualEmbed) document.documentElement.dataset.modelSelectEmbed = 'manual';

    const uiText = (value) => window.InoRobotI18n
        ? window.InoRobotI18n.translate(String(value))
        : String(value);
    let displayTranslationLocale = '';
    let displayTranslationFragments = [];
    // Opening a model window used to run every fragment's expression over every label and froze
    // the page for most of a second. A fragment is now tried only when the text can contain it:
    // - an ASCII fragment must appear in the lower-cased text (the only non-ASCII letters that
    //   match ASCII ones case-insensitively are the long s and the Kelvin sign);
    // - any other fragment must contain its longest run of caseless characters (Hangul, digits,
    //   punctuation, spaces), which case-insensitive matching never changes.
    // Expressions are compiled only when first needed.
    const foldAsciiCase = (text) => text.toLowerCase().replace(/\u017f/g, 's');
    const getCaselessRun = (source) => {
        let longest = '';
        let run = '';
        for (const character of source) {
            if (character.toLowerCase() === character && character.toUpperCase() === character) {
                run += character;
                if (run.length > longest.length) longest = run;
            } else {
                run = '';
            }
        }
        return longest;
    };
    const getFragmentExpression = (fragment) => {
        if (fragment.expression) return fragment.expression;
        const escaped = fragment.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const startsWithWord = /^[\p{L}\p{N}]/u.test(fragment.source);
        const endsWithWord = /[\p{L}\p{N}]$/u.test(fragment.source);
        const leadingBoundary = startsWithWord ? '(?<![\\p{L}\\p{N}])' : '';
        const trailingBoundary = endsWithWord ? '(?![\\p{L}\\p{N}])' : '';
        fragment.expression = new RegExp(`${leadingBoundary}${escaped}${trailingBoundary}`, 'giu');
        return fragment.expression;
    };
    const getDisplayTranslationFragments = () => {
        const i18n = window.InoRobotI18n;
        const locale = i18n?.locale || 'ko';
        if (locale === displayTranslationLocale) return displayTranslationFragments;

        const dictionaries = [
            i18n?.get?.('legacy', {}),
            i18n?.get?.('pageTranslations.robotSelect.legacy', {})
        ];
        const translations = Object.assign({}, ...dictionaries.filter(value => value && typeof value === 'object'));
        displayTranslationFragments = Object.entries(translations)
            .filter(([source, target]) => {
                if (typeof source !== 'string' || typeof target !== 'string' || source === target) return false;
                return source.length >= 8 || /[가-힣]/u.test(source) && source.length >= 2;
            })
            .sort(([left], [right]) => right.length - left.length)
            .map(([source, target]) => {
                const ascii = /^[\x00-\x7f]*$/.test(source);
                return {
                    source,
                    target,
                    folded: ascii ? source.toLowerCase() : '',
                    required: ascii ? '' : getCaselessRun(source),
                    expression: null
                };
            });
        displayTranslationLocale = locale;
        return displayTranslationFragments;
    };
    const localizeDisplayText = (value) => {
        const source = String(value ?? '');
        const exact = uiText(source);
        if (exact !== source) return exact;
        let text = source;
        let folded = foldAsciiCase(text);
        getDisplayTranslationFragments().forEach(fragment => {
            if (fragment.folded ? !folded.includes(fragment.folded) : fragment.required && !text.includes(fragment.required)) return;
            const next = text.replace(getFragmentExpression(fragment), fragment.target);
            if (next === text) return;
            text = next;
            folded = foldAsciiCase(text);
        });
        return text;
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
    const downloadComponentsBtn = document.getElementById('download-components-btn');
    const addToCartBtn = document.getElementById('add-to-cart-btn');
    const modalBody = document.getElementById('modal-body');
    const cartToggleBtn = document.getElementById('cart-toggle-btn');
    const cartBadge = document.getElementById('cart-badge');
    const cartOverlay = document.getElementById('cart-overlay');
    const cartCloseBtn = document.getElementById('cart-close-btn');
    const cartList = document.getElementById('cart-list');
    const cartSummaryText = document.getElementById('cart-summary-text');
    const cartTotalItems = document.getElementById('cart-total-items');
    const cartTotalRobots = document.getElementById('cart-total-robots');
    const cartClearBtn = document.getElementById('cart-clear-btn');
    const cartDownloadBtn = document.getElementById('cart-download-btn');

    let currentActiveProduct = null;
    let editingCartItemId = null;
    const cartStorageKey = 'inorobot.robotModelSelect.cart.v1';

    function getCad3dPath(product) {
        const entry = window.InoRobotCadManifest?.[product?.id];
        return entry && typeof entry.threeD === 'string' ? entry.threeD : null;
    }

    function formatPinCount(pin) {
        const match = String(pin).match(/^(\d+)핀$/);
        return match ? `${match[1]} ${uiText('핀')}` : uiText(pin);
    }

    function formatHollowWrist(value) {
        const normalized = String(value ?? '').trim().toLowerCase();
        if (normalized === 'yes') return uiText('중공형');
        if (normalized === 'no') return uiText('비중공형');
        return uiText(value || '-');
    }

    function formatCleanTypeFilter(value) {
        const normalized = String(value ?? '').trim().toLowerCase();
        if (normalized === 'yes') return uiText('클린형');
        if (normalized === 'no') return uiText('기본형');
        return uiText(value || '-');
    }

    function supportsCleanTypeOption(product) {
        return product?.specs?.Type === '6-Axis' && !isFixedBodySpecModel(product.name);
    }

    function matchesFilterOption(product, categoryId, optionId) {
        const productValue = String(product?.specs?.[categoryId] ?? '');
        if (categoryId === 'Clean Type' && optionId === 'Yes') {
            return productValue === 'Yes' || supportsCleanTypeOption(product);
        }
        return productValue === optionId;
    }

    let state = {
        filters: JSON.parse(JSON.stringify(filtersData)),
        products: JSON.parse(JSON.stringify(productsData)),
        accessories: (typeof accessoriesList !== 'undefined') ? JSON.parse(JSON.stringify(accessoriesList)) : []
    };

    function updateSavedRobotOptions(item) {
        if (!item || item.kind === 'hardware' || !Array.isArray(item.accessories)) return item;
        const r7h = /^IR-R7H-/i.test(item.modelId || item.modelName || '');
        const correctedTool = r7h && state.accessories.find(part => part.code === '32022076');
        const correctedCode = code => correctedTool && code === '01660018' ? correctedTool.code : code;
        const accessories = item.accessories.filter(part => part.code !== '01660004').map(part => {
            if (correctedCode(part.code) === part.code) return part;
            return {...part, code: correctedTool.code, inputName: 'accSelection', inputValue: correctedTool.code, name: correctedTool.name,
                detail: correctedTool.description + ' (' + correctedTool.spec + ')'};
        });
        const selections = {...item.selections};
        if (Array.isArray(selections.accessories)) {
            selections.accessories = selections.accessories.filter(code => code !== '01660004').map(correctedCode);
        }
        return {...item, accessories, selections};
    }

    function loadCartItems() {
        try {
            const raw = localStorage.getItem(cartStorageKey);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.filter(Boolean).map(updateSavedRobotOptions) : [];
        } catch (error) {
            console.warn('Could not restore saved model configurations:', error);
            return [];
        }
    }

    let cartItems = loadCartItems();

    function persistCartItems() {
        try {
            localStorage.setItem(cartStorageKey, JSON.stringify(cartItems));
        } catch (error) {
            console.warn('Could not save model configurations:', error);
        }
    }

    function parsePositiveQuantity(value, fallback = 1) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }

    function getDisplayModelName(product, bodyOptionValue = 'standard') {
        if (!product) return '';
        if (product.specs?.Type === '6-Axis') return getBodyOptionModelName(product.name, bodyOptionValue);
        return modelPages.displayName(product);
    }

    function getMatchedCableSelection(product, root = modalBody) {
        const lenEl = root.querySelector('input[name="cableLenSelection"]:checked');
        const typeEl = root.querySelector('input[name="cableTypeSelection"]:checked');
        const length = lenEl ? lenEl.value : 'N/A';
        const type = typeEl ? typeEl.value : 'Standard (표준형)';
        const isFlex = type.includes('High Flex');
        const matched = InoSite.matchCable(product?.cables || [], length, isFlex);

        return {
            length,
            type,
            code: matched?.code || product?.cables?.[0]?.code || 'N/A',
            description: matched?.cable || ''
        };
    }

    // Initialize Sub Type for each product
    state.products.forEach(product => {
        if (!product || !product.specs) return;
        product.specs['Sub Type'] = modelPages.subtype(product);
    });

    function isHiddenProduct(product) {
        return modelPages.isHiddenProduct(product);
    }

    function getModalRobotQuantity() {
        const input = modalBody.querySelector('input[name="robotQuantity"]');
        return parsePositiveQuantity(input ? input.value : 1);
    }

    function selectionQuantityInput(input) {
        return input?.closest('label')?.querySelector('.accessory-quantity');
    }

    function getSelectionQuantity(input, fallback = 1) {
        const quantityInput = selectionQuantityInput(input);
        return parsePositiveQuantity(quantityInput ? quantityInput.value : fallback, fallback);
    }

    function splitAccessoryDescription(fullDescription, fallbackName) {
        const source = String(fullDescription || '');
        if (!source.includes(' - ')) {
            return { name: fallbackName, detail: source };
        }
        const parts = source.split(' - ');
        return { name: parts.shift() || fallbackName, detail: parts.join(' - ') };
    }

    function createCartAccessoryRow({ category, name, detail, code, quantity, input }) {
        return {
            category,
            name: name || category,
            detail: detail || '',
            code: code || '-',
            quantity: parsePositiveQuantity(quantity),
            inputName: input?.name || '',
            inputValue: input?.value || ''
        };
    }

    function collectCurrentAccessoryRows(robotQuantity) {
        const rows = [];
        const addRow = row => rows.push(createCartAccessoryRow(row));

        const bodyOption = modalBody.querySelector('input[name="robotBodyOption"]:checked');
        if (bodyOption && bodyOption.value !== 'standard') {
            addRow({
                category: 'Robot Body',
                name: '로봇 바디 옵션',
                detail: `${bodyOption.dataset.label || bodyOption.value}${bodyOption.dataset.spec ? ` (${bodyOption.dataset.spec})` : ''}`,
                code: getBodyOptionPurchaseCode(currentActiveProduct, bodyOption.value),
                quantity: robotQuantity,
                input: bodyOption
            });
        }

        const pendantConfig = modalBody.querySelector('input[name="pendantConfig"]:checked');
        const pendantLength = modalBody.querySelector('input[name="pendantLength"]:checked:not(:disabled)');
        if (pendantConfig && pendantConfig.value !== 'none' && pendantLength) {
            const pendantSpec = pendantLength.dataset.spec || '';
            addRow({
                category: 'Pendant',
                name: '티칭 펜던트',
                detail: `${pendantConfig.dataset.label || pendantConfig.value}${pendantSpec && pendantSpec !== '-' ? ` (길이: ${pendantSpec})` : ''}`,
                code: pendantLength.value,
                quantity: getSelectionQuantity(pendantLength),
                input: pendantLength
            });
        }

        const selectedIoCableSet = modalBody.querySelector('input[name="ioCableSetSelection"][data-code]:checked');
        if (selectedIoCableSet) {
            const quantity = getSelectionQuantity(selectedIoCableSet);
            addRow({
                category: 'Arm I/O Cable',
                name: `Arm I/O 케이블 (${selectedIoCableSet.dataset.armPin || '기본핀'})`,
                detail: `${selectedIoCableSet.dataset.armDesc || ''}${selectedIoCableSet.dataset.armSpec && selectedIoCableSet.dataset.armSpec !== '-' ? ` (길이: ${selectedIoCableSet.dataset.armSpec})` : ''}`,
                code: selectedIoCableSet.dataset.code || selectedIoCableSet.value,
                quantity,
                input: selectedIoCableSet
            });
            addRow({
                category: 'Body I/O Cable',
                name: `Body I/O 케이블 (${selectedIoCableSet.dataset.bodyPin || '기본핀'})`,
                detail: `${selectedIoCableSet.dataset.bodyDesc || ''}${selectedIoCableSet.dataset.bodySpec && selectedIoCableSet.dataset.bodySpec !== '-' ? ` (길이: ${selectedIoCableSet.dataset.bodySpec})` : ''}`,
                code: selectedIoCableSet.dataset.code || selectedIoCableSet.value,
                quantity,
                input: selectedIoCableSet
            });
        } else {
            modalBody.querySelectorAll('input[name^="armSelection_"]:checked, input[name^="bodySelection_"]:checked').forEach(input => {
                if (input.value === 'none') return;
                const isArm = input.name.startsWith('armSelection_');
                const pin = input.name.split('_')[1] || '기본핀';
                const spec = input.dataset.spec || '';
                addRow({
                    category: isArm ? 'Arm I/O Cable' : 'Body I/O Cable',
                    name: `${isArm ? 'Arm' : 'Body'} I/O 케이블 (${pin})`,
                    detail: `${input.dataset.desc || ''}${spec && spec !== '-' ? ` (길이: ${spec})` : ''}`,
                    code: input.value,
                    quantity: getSelectionQuantity(input),
                    input
                });
            });
        }

        modalBody.querySelectorAll('input[name="accSelection"]:checked').forEach(input => {
            const descriptor = splitAccessoryDescription(input.dataset.desc, '기타 악세서리');
            const spec = input.dataset.spec || '';
            addRow({
                category: 'Accessory',
                name: descriptor.name,
                detail: `${descriptor.detail}${spec && spec !== '-' ? ` (길이: ${spec})` : ''}`,
                code: input.value,
                quantity: getSelectionQuantity(input),
                input
            });
        });

        const communication = modalBody.querySelector('input[name="commSelection"]:checked');
        if (communication && communication.value !== 'none') {
            addRow({
                category: 'Communication',
                name: communication.dataset.label || communication.value,
                detail: '확장 카드',
                code: communication.dataset.code || '-',
                quantity: getSelectionQuantity(communication),
                input: communication
            });
        }

        const communicationCode = communication && communication.value !== 'none'
            ? communication.dataset.code
            : '';
        modalBody.querySelectorAll('input[name="expSelection"]:checked').forEach(input => {
            if (communicationCode && input.value === communicationCode) return;
            const descriptor = splitAccessoryDescription(input.dataset.desc, '확장 카드');
            addRow({
                category: 'Expansion Card',
                name: descriptor.name,
                detail: descriptor.detail,
                code: input.value,
                quantity: getSelectionQuantity(input),
                input
            });
        });

        modalBody.querySelectorAll('input[name="remoteCouplerSelection"]:checked').forEach(input => {
            const descriptor = splitAccessoryDescription(input.dataset.desc, '리모트 커플러');
            addRow({
                category: 'Remote Coupler',
                name: descriptor.name,
                detail: descriptor.detail,
                code: input.value,
                quantity: getSelectionQuantity(input),
                input
            });
        });

        return rows;
    }

    function collectCurrentCartItem() {
        if (!currentActiveProduct) return null;

        const robotQuantity = getModalRobotQuantity();
        const cable = getMatchedCableSelection(currentActiveProduct);
        const bodyOption = modalBody.querySelector('input[name="robotBodyOption"]:checked');
        const pendantConfig = modalBody.querySelector('input[name="pendantConfig"]:checked');
        const pendantLength = modalBody.querySelector('input[name="pendantLength"]:checked:not(:disabled)');
        const communication = modalBody.querySelector('input[name="commSelection"]:checked');
        const bodyOptionValue = bodyOption ? bodyOption.value : 'standard';

        const armSelections = Array.from(modalBody.querySelectorAll('input[name^="armSelection_"]:checked'))
            .filter(input => input.value !== 'none')
            .map(input => ({ name: input.name, value: input.value }));
        const bodySelections = Array.from(modalBody.querySelectorAll('input[name^="bodySelection_"]:checked'))
            .filter(input => input.value !== 'none')
            .map(input => ({ name: input.name, value: input.value }));

        return {
            id: editingCartItemId || `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            modelId: currentActiveProduct.id,
            productName: currentActiveProduct.name,
            modelName: getDisplayModelName(currentActiveProduct, bodyOptionValue),
            robotQuantity,
            cable,
            bodyOptionValue,
            purchaseCode: bodyOptionValue !== 'standard'
                ? getBodyOptionPurchaseCode(currentActiveProduct, bodyOptionValue)
                : cable.code,
            accessories: collectCurrentAccessoryRows(robotQuantity),
            selections: {
                cableLength: cable.length,
                cableType: cable.type,
                bodyOption: bodyOptionValue,
                pendantConfig: pendantConfig ? pendantConfig.value : 'none',
                pendantLength: pendantLength ? pendantLength.value : '',
                ioCableSet: (modalBody.querySelector('input[name="ioCableSetSelection"]:checked') || {}).value || '',
                armSelections,
                bodySelections,
                accessories: Array.from(modalBody.querySelectorAll('input[name="accSelection"]:checked')).map(input => input.value),
                communication: communication ? communication.value : 'none',
                expansion: Array.from(modalBody.querySelectorAll('input[name="expSelection"]:checked:not([data-included-by-protocol])')).map(input => input.value),
                remoteCouplers: Array.from(modalBody.querySelectorAll('input[name="remoteCouplerSelection"]:checked')).map(input => input.value)
            }
        };
    }

    function renderCart() {
        if (!cartList) return;

        const totalRobots = cartItems.reduce((sum, item) => sum + (item.kind === 'hardware' ? 0 : parsePositiveQuantity(item.robotQuantity)), 0);
        cartBadge.textContent = String(cartItems.length);
        cartTotalItems.textContent = String(cartItems.length);
        cartTotalRobots.textContent = String(totalRobots);
        cartSummaryText.textContent = `${uiText('총 구성 수')}: ${cartItems.length} · ${uiText('총 로봇 수량')}: ${totalRobots}`;
        cartClearBtn.disabled = cartItems.length === 0;
        cartDownloadBtn.disabled = cartItems.length === 0;

        if (cartItems.length === 0) {
            cartList.innerHTML = `<div class="cart-empty">${escapeHtml(uiText('구성 목록이 비어 있습니다.'))}</div>`;
            return;
        }

        cartList.innerHTML = cartItems.map((item, index) => {
            const hardware = item.kind === 'hardware';
            const cable = item.cable || {};
            const accessories = Array.isArray(item.accessories) ? item.accessories : [];
            const detailRows = hardware ? [] : [
                { name: uiText('기본 케이블'), detail: `${uiText(cable.type || '-')}${cable.length ? ` / ${cable.length}` : ''}`, code: cable.code || '-', quantity: item.robotQuantity },
                ...accessories.map(option => ({
                    name: localizeDisplayText(option.name || option.category),
                    detail: localizeDisplayText(option.detail || ''),
                    code: option.code || '-',
                    quantity: option.quantity || 1
                }))
            ];

            const title = hardware ? localizeDisplayText(item.name) : (item.modelName || item.productName || item.modelId);
            const meta = hardware
                ? `${escapeHtml(getConfigurationComponentType(item.category, item.name))} · <span class="cart-item-detail-code">${escapeHtml(item.code)}</span>`
                : `${escapeHtml(uiText('로봇 수량'))}: ${escapeHtml(item.robotQuantity)} · ${escapeHtml(item.purchaseCode || item.modelId)}`;
            const details = hardware
                ? `<div class="cart-hardware-details"><span>${escapeHtml(hardwareDescription(item))}</span>
                    <label>${escapeHtml(uiText('수량'))}<input class="hardware-quantity" type="number" min="1" step="1" required
                        data-hardware-quantity="${escapeHtml(item.id)}" value="${escapeHtml(item.quantity)}"></label></div>`
                : `<div class="cart-item-details">${detailRows.map(row => `
                    <span class="cart-item-detail-name">${escapeHtml(row.name)}</span>
                    <span>${escapeHtml(row.detail)} <span class="cart-item-detail-code">${escapeHtml(row.code)}</span></span>
                    <span class="cart-item-detail-qty">${escapeHtml(row.quantity)}${escapeHtml(uiText('개'))}</span>`).join('')}</div>`;
            return `
                <article class="cart-item" data-cart-id="${escapeHtml(item.id)}">
                    <div class="cart-item-header">
                        <div>
                            <div class="cart-item-title">${index + 1}. ${escapeHtml(title)}</div>
                            <div class="cart-item-meta">${meta}</div>
                        </div>
                        <div class="cart-item-actions">
                            ${hardware ? '' : `<button class="cart-item-action" type="button" data-cart-action="edit" data-cart-id="${escapeHtml(item.id)}">${escapeHtml(uiText('구성 수정'))}</button>`}
                            <button class="cart-item-action" type="button" data-cart-action="delete" data-cart-id="${escapeHtml(item.id)}">${escapeHtml(uiText('구성 삭제'))}</button>
                        </div>
                    </div>
                    ${details}
                </article>
            `;
        }).join('');
    }

    function setCartOpen(isOpen) {
        if (!cartOverlay) return;
        cartOverlay.style.display = isOpen ? 'flex' : 'none';
        cartOverlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    }

    function syncAccessoryQuantityControls() {
        modalBody.querySelectorAll('.accessory-quantity-wrap').forEach(wrapper => {
            const selectionInput = wrapper.closest('label')?.querySelector('input[type="checkbox"], input[type="radio"]');
            const visible = Boolean(selectionInput && selectionInput.checked && !selectionInput.disabled);
            wrapper.classList.toggle('is-hidden', !visible);
        });
    }

    const accessorySelectionSelector = [
        'input[name="pendantLength"]',
        'input[name="ioCableSetSelection"]',
        'input[name^="armSelection_"]',
        'input[name^="bodySelection_"]',
        'input[name="accSelection"]',
        'input[name="commSelection"]',
        'input[name="expSelection"]',
        'input[name="remoteCouplerSelection"]'
    ].join(',');

    function setupAccessoryQuantityControls() {
        modalBody.querySelectorAll(accessorySelectionSelector).forEach(selectionInput => {
            if (selectionInput.value === 'none' || selectionInput.disabled) return;
            const label = selectionInput.closest('label');
            if (!label || label.querySelector('.accessory-quantity-wrap')) return;

            const wrapper = document.createElement('span');
            wrapper.className = 'accessory-quantity-wrap is-hidden';
            wrapper.innerHTML = `<span>${escapeHtml(uiText('수량'))}</span><input class="accessory-quantity" type="number" min="1" step="1" value="1" aria-label="${escapeHtml(uiText('수량'))}">`;
            const quantityInput = wrapper.querySelector('.accessory-quantity');
            quantityInput.addEventListener('change', () => {
                quantityInput.value = String(parsePositiveQuantity(quantityInput.value));
            });
            quantityInput.addEventListener('click', event => event.stopPropagation());
            quantityInput.addEventListener('keydown', event => event.stopPropagation());
            label.appendChild(wrapper);

            selectionInput.addEventListener('change', syncAccessoryQuantityControls);
        });

        syncAccessoryQuantityControls();
    }

    function findModalSelectionInput(name, value) {
        return Array.from(modalBody.querySelectorAll('input')).find(input => input.name === name && input.value === value) || null;
    }

    function linkCommunicationCards(radios) {
        const standard = radios.querySelector('input[value="none"]');
        for (const protocol of radios.querySelectorAll('input[type="radio"]:not([value="none"])')) {
            const card = findModalSelectionInput('expSelection', protocol.dataset.code);
            if (!card) continue;

            // A protocol supplies its card until the protocol changes. Explicit card selections persist.
            const syncSelection = () => {
                if (protocol.checked && !card.checked) {
                    card.checked = true;
                    card.dataset.includedByProtocol = '';
                } else if (!protocol.checked && card.hasAttribute('data-included-by-protocol')) {
                    card.checked = false;
                    delete card.dataset.includedByProtocol;
                }
            };
            radios.addEventListener('change', syncSelection);
            card.addEventListener('change', () => {
                if (!card.checked && protocol.checked) {
                    standard.checked = true;
                    delete card.dataset.includedByProtocol;
                }
            });
            syncSelection();

            const protocolQuantity = selectionQuantityInput(protocol);
            const cardQuantity = selectionQuantityInput(card);
            // Older configurations stored the quantity only on the option that supplied the card.
            if (protocol.checked) cardQuantity.value = protocolQuantity.value;
            else protocolQuantity.value = cardQuantity.value;
            for (const [field, other] of [[protocolQuantity, cardQuantity], [cardQuantity, protocolQuantity]]) {
                const mirrorQuantity = () => { other.value = field.value; };
                field.addEventListener('input', mirrorQuantity);
                field.addEventListener('change', mirrorQuantity);
            }
        }
    }

    function restoreCartItemToModal(cartItem) {
        if (!cartItem) return;
        const selections = cartItem.selections || {};
        const setInput = (name, value, dispatch = true) => {
            if (!value) return null;
            const input = findModalSelectionInput(name, value);
            if (!input) return null;
            input.checked = true;
            if (dispatch) input.dispatchEvent(new Event('change', { bubbles: true }));
            return input;
        };

        const robotQuantityInput = modalBody.querySelector('input[name="robotQuantity"]');
        if (robotQuantityInput) robotQuantityInput.value = String(parsePositiveQuantity(cartItem.robotQuantity));
        setInput('cableLenSelection', selections.cableLength, false);
        setInput('cableTypeSelection', selections.cableType, false);
        setInput('robotBodyOption', selections.bodyOption || 'standard', false);
        setInput('pendantConfig', selections.pendantConfig || 'none', true);
        setInput('pendantLength', selections.pendantLength, false);
        setInput('ioCableSetSelection', selections.ioCableSet, false);

        (selections.armSelections || []).forEach(item => setInput(item.name, item.value, false));
        (selections.bodySelections || []).forEach(item => setInput(item.name, item.value, false));
        (selections.accessories || []).forEach(value => setInput('accSelection', value, false));
        setInput('commSelection', selections.communication || 'none', false);
        (selections.expansion || []).forEach(value => setInput('expSelection', value, false));
        (selections.remoteCouplers || []).forEach(value => setInput('remoteCouplerSelection', value, false));

        setupAccessoryQuantityControls();
        (cartItem.accessories || []).forEach(option => {
            const input = findModalSelectionInput(option.inputName, option.inputValue);
            const quantityInput = selectionQuantityInput(input);
            if (quantityInput) {
                quantityInput.value = String(parsePositiveQuantity(option.quantity));
            }
        });
        syncAccessoryQuantityControls();
    }

    const visibleProducts = state.products.filter(product => !isHiddenProduct(product));
    const catalogGroups = modelPages.groupCatalogProducts(visibleProducts);
    const hardwareType = {id: 'paid-hardware', label: '유료 하드웨어 옵션'};
    const typeFilter = state.filters.find(group => group.id === 'Type');
    typeFilter.label = '타입';
    typeFilter.options.push(hardwareType);
    const hardwareCategories = [
        {id: 'pendant', label: '펜던트', type: 'Pendant', groups: [
            ['비상정지 보호 커버 없음', part => part.type === 'Pendant' && !part.emergency_stop_cover],
            ['비상정지 보호 커버 있음', part => part.type === 'Pendant' && part.emergency_stop_cover],
            ['티칭 펜던트 연장 케이블', part => isPendantExtensionCable(part.name)]
        ]},
        {id: 'expansion', label: '확장 카드', type: 'Expansion Card'},
        {id: 'accessories', label: '기타 악세서리', type: 'Accessory', groups: [
            ['Homing tool', part => part.type === 'Zeroing tool'],
            ['펜던트 케이블·플러그', part => isPendantExtensionCable(part.name) || part.type === 'Pendant dummy Plug'],
            ['SCARA J3 보호 커버', part => part.type === 'Telescopic Cover'],
            ['Encoder Battery', part => part.type === 'Encoder Battery'],
            ['Fork lift tool for robots', part => part.type === 'Fork lift tool']
        ]},
        {id: 'coupler', label: '리모트 커플러', type: 'Remote Coupler', groups: [
            ['EtherCAT 커플러', part => /EtherCAT remote module/i.test(part.description)],
            ['디지털 입출력', part => /digital (input|output) module/i.test(part.description)],
            ['아날로그 입출력', part => /analog (input|output) module/i.test(part.description)]
        ]}
    ];
    function hardwareCategoryType(accessory) {
        if (['Expansion Card', 'Remote Coupler', 'Pendant'].includes(accessory.type)) return accessory.type;
        if (accessory.type === 'Software' || ['Robot arm I/O cable', 'Robot Body I/O cable'].includes(accessory.name)
            || /1\.0 TP Connector|TP2\.0 adapter to old version/.test(accessory.description)) return null;
        return 'Accessory';
    }
    function isPendantExtensionCable(name) {
        return /teach pendant extension cable/i.test(name);
    }
    for (const category of hardwareCategories) {
        category.parts = state.accessories.filter(part => hardwareCategoryType(part) === category.type
            || (category.type === 'Pendant' && isPendantExtensionCable(part.name)));
        category.sections = category.type === 'Expansion Card' ? groupExpansionCards(category.parts) : groupHardwareParts(category);
    }
    function groupHardwareParts(category) {
        const sections = category.groups.map(([label, matches]) => ({label, matches, parts: []}));
        const other = {label: category.label, parts: []};
        for (const part of category.parts) {
            const section = sections.find(group => group.matches(part)) || other;
            section.parts.push(part);
        }
        return [...sections, other].filter(section => section.parts.length);
    }
    function groupExpansionCards(parts) {
        const remaining = new Map(parts.map(part => [part.code, part]));
        const sections = [
            ['Communication', ['01650028', '01650040']],
            ['입출력', ['01650026', '01650027', '01650025']],
            ['안전 확장', ['01650030']]
        ].map(([label, codes]) => {
            const members = codes.map(code => remaining.get(code)).filter(Boolean);
            members.forEach(part => remaining.delete(part.code));
            return {label, parts: members};
        }).filter(section => section.parts.length);
        if (remaining.size) sections.push({label: '확장 카드', parts: [...remaining.values()]});
        return sections;
    }
    const expansionSections = hardwareCategories.find(category => category.id === 'expansion').sections;
    const hardwareDialog = document.getElementById('hardware-dialog');
    const hardwareOrderForm = document.getElementById('hardware-order-form');
    const hardwareAddButton = document.getElementById('add-hardware-to-cart');

    function appendHardwareCards() {
        const cards = hardwareCategories.map(category => {
            const count = uiText('{count}개 품목').replace('{count}', category.parts.length);
            return `<button type="button" class="product-card hardware-category-card" data-hardware-category="${category.id}" aria-haspopup="dialog">
                <span class="hardware-photo"><img src="Model_image/hardware-${category.id}.webp?v=20261121-hardware" alt=""></span>
                <span class="hardware-card-caption"><strong>${escapeHtml(uiText(category.label))}</strong>
                    <span>${escapeHtml(count)}</span></span></button>`;
        }).join('');
        productContainer.insertAdjacentHTML('beforeend', `<div class="product-grid hardware-grid" role="group"
            aria-label="${escapeHtml(uiText(hardwareType.label))}">${cards}</div>`);
    }

    function hardwareDescription(part) {
        return [part.description, part.spec].filter(value => value && value !== '-').map(localizeDisplayText).join(' · ');
    }

    function hardwareDraft() {
        return new Map(Array.from(hardwareOrderForm.querySelectorAll('[name="hardwarePart"]:checked'), input =>
            [input.value, input.closest('tr').querySelector('.hardware-quantity').value]));
    }

    function renderHardwareDetails(category, selected = new Map()) {
        hardwareDialog.dataset.category = category.id;
        hardwareDialog.querySelector('h2').textContent = uiText(category.label);
        hardwareAddButton.textContent = uiText('구성 목록에 담기');
        hardwareAddButton.disabled = !selected.size;
        const labels = ['품목명', '구매 코드', '호환 모델', '수량'].map(key => escapeHtml(uiText(key)));
        function partRow(part) {
            const name = escapeHtml(uiText(part.name));
            const code = escapeHtml(part.code);
            const checked = selected.has(part.code);
            const targets = part.target_models === 'All' ? uiText('전체 모델') : part.target_models;
            return `<tr><th scope="row"><label class="hardware-choice"><input type="checkbox" name="hardwarePart" value="${code}"${checked ? ' checked' : ''}>
                <span>${name}<small>${escapeHtml(hardwareDescription(part))}</small></span></label></th>
                <td data-label="${labels[1]}"><code>${code}</code></td><td data-label="${labels[2]}">${escapeHtml(targets)}</td>
                <td data-label="${labels[3]}"><input class="hardware-quantity" type="number" min="1" step="1" required
                    aria-label="${name} ${labels[3]}" value="${escapeHtml(selected.get(part.code) ?? 1)}"${checked ? '' : ' disabled'}></td></tr>`;
        }
        const bodies = category.sections.map(section => {
            const heading = `<tr><th scope="rowgroup" colspan="4" class="hardware-section-heading">${escapeHtml(uiText(section.label))}</th></tr>`;
            return `<tbody>${heading}${section.parts.map(partRow).join('')}</tbody>`;
        }).join('');
        hardwareDialog.querySelector('.hardware-parts').innerHTML = `<table><thead><tr>${labels.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead>${bodies}</table>`;
    }

    hardwareOrderForm.addEventListener('click', event => {
        if (event.target.closest('label, input, button')) return;
        const checkbox = event.target.closest('tr')?.querySelector('[name="hardwarePart"]');
        checkbox?.click();
    });

    hardwareOrderForm.addEventListener('change', event => {
        if (event.target.name !== 'hardwarePart') return;
        event.target.closest('tr').querySelector('.hardware-quantity').disabled = !event.target.checked;
        hardwareAddButton.disabled = !hardwareOrderForm.querySelector('[name="hardwarePart"]:checked');
    });

    hardwareOrderForm.addEventListener('submit', event => {
        event.preventDefault();
        const selected = hardwareDraft();
        if (!selected.size || !hardwareOrderForm.reportValidity()) return;
        const category = hardwareCategories.find(group => group.id === hardwareDialog.dataset.category);
        const updated = cartItems.slice();
        for (const [code, amount] of selected) {
            const part = category.parts.find(member => member.code === code);
            if (!part) return;
            const id = 'hardware-' + code;
            const index = updated.findIndex(item => item.id === id);
            const quantity = Number(amount) + (index < 0 ? 0 : updated[index].quantity);
            if (!Number.isSafeInteger(quantity) || quantity < 1) {
                alert(uiText('수량은 1개 이상이어야 합니다.'));
                return;
            }
            const item = {kind: 'hardware', id, category: hardwareCategoryType(part), code: part.code, name: part.name,
                description: part.description, spec: part.spec, quantity};
            if (index < 0) updated.push(item);
            else updated[index] = item;
        }
        cartItems = updated;
        persistCartItems();
        renderCart();
        hardwareDialog.close();
        setCartOpen(true);
        cartCloseBtn.focus();
    });

    hardwareDialog.addEventListener('click', event => {
        if (event.target === hardwareDialog) hardwareDialog.close();
    });
    const optionGroups = [];
    const allOptions = state.filters.flatMap((category, group) => category.options.map(option => {
        optionGroups.push(group);
        return { category, option };
    }));
    const catalog = InoSite.catalog(optionGroups, state.filters.length, visibleProducts.map(product =>
        allOptions.flatMap(({ category, option }, index) => matchesFilterOption(product, category.id, option.id) ? [index] : [])));
    const optionIndex = new Map(allOptions.map(({ option }, i) => [option, i]));
    const productCards = new Map();
    function filterResult() {
        return catalog.select(allOptions.map(({ option }) => Number(option !== hardwareType && Boolean(option.isSelected))));
    }

    function renderFilters(result) {
        filterContainer.replaceChildren();

        state.filters.forEach(filterCategory => {
            if (hardwareType.isSelected && filterCategory !== typeFilter) return;
            const row = document.createElement('div');
            row.className = 'filter-row';
            row.dataset.filterId = filterCategory.id;

            const labelArea = document.createElement('div');
            labelArea.className = 'filter-label';
            labelArea.textContent = uiText(filterCategory.label);

            const optionsArea = document.createElement('div');
            optionsArea.className = 'filter-options';

            let hasVisibleOptions = false;

            filterCategory.options.forEach(opt => {
                if (filterCategory.id === 'Sub Type' && opt.id === '경제형') return;

                if (opt !== hardwareType && !opt.isSelected && !result.available[optionIndex.get(opt)]) return;
                hasVisibleOptions = true;

                const btn = document.createElement('button');
                btn.className = opt.isSelected ? 'filter-option active' : 'filter-option';
                btn.textContent = filterCategory.id === 'Hollow Wrist'
                    ? formatHollowWrist(opt.id)
                    : filterCategory.id === 'Clean Type'
                        ? formatCleanTypeFilter(opt.id)
                        : uiText(opt.label);
                btn.dataset.filterId = filterCategory.id;
                btn.dataset.optionId = opt.id;
                btn.setAttribute('aria-pressed', String(Boolean(opt.isSelected)));
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

    function renderModelCards(result) {
        const matchingProducts = new Set(Array.from(result.rows, i => visibleProducts[i]));

        if (matchingProducts.size === 0) {
            productContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted)">${uiText('현재 필터 규칙에 맞는 모델이 없습니다.')}</div>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        const template = document.createElement('template');
        for (const variants of catalogGroups) {
            const product = variants.find(variant => matchingProducts.has(variant));
            if (!product) continue;
            if (!productCards.has(product)) {
                template.innerHTML = modelPages.catalogCardHtml(variants, product, uiText);
                productCards.set(product, template.content.firstElementChild);
            }
            fragment.appendChild(productCards.get(product));
        }
        productContainer.replaceChildren(fragment);
    }

    productContainer.addEventListener('click', event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const hardwareCard = event.target.closest('[data-hardware-category]');
        if (hardwareCard) {
            renderHardwareDetails(hardwareCategories.find(category => category.id === hardwareCard.dataset.hardwareCategory));
            hardwareDialog.showModal();
            hardwareDialog.querySelector('.hardware-parts').scrollTop = 0;
            return;
        }
        const link = event.target.closest('a[href]');
        const productId = link ? modelPages.productFromUrl(link.href, visibleProducts)?.id : event.target.closest('.product-card')?.dataset.productId;
        if (!productId) return;
        event.preventDefault();
        openOptionsModal(productId);
    });

    function renderCatalog(result = filterResult()) {
        renderFilters(result);
        if (hardwareType.isSelected) {
            productContainer.replaceChildren();
        } else {
            renderModelCards(result);
        }
        if (hardwareType.isSelected || !typeFilter.options.some(option => option.isSelected)) {
            appendHardwareCards();
        }
    }

    function toggleFilter(categoryId, optionId, forceState) {
        const category = state.filters.find(c => c.id === categoryId);
        if (!category) return;
        const option = category.options.find(o => o.id === optionId);
        if (!option) return;

        if (option === hardwareType || hardwareType.isSelected) {
            allOptions.forEach(entry => { entry.option.isSelected = false; });
            option.isSelected = forceState;
            renderCatalog();
            return;
        }

        option.isSelected = forceState;

        const result = filterResult();
        let pruned = false;
        allOptions.forEach(({ option }, i) => {
            if (option.isSelected && !result.available[i]) {
                option.isSelected = false;
                pruned = true;
            }
        });
        renderCatalog(pruned ? filterResult() : result);
    }

    function resetFilters() {
        state.filters.forEach(cat => {
            cat.options.forEach(opt => opt.isSelected = false);
        });
        renderCatalog();
    }

    resetBtn.addEventListener('click', resetFilters);

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

    const controllerTypeByModel = {
        'IRCB501-4AD-INT': 'Standard',
        'IRCB501-4CD-INT': 'Standard',
        'IRCB501-6LD-INT': 'Standard',
        'IRCB501-4ED-INT': 'High Power',
        'IRCB501-4MD-INT': 'High Power',
        'IRCB501-6FD-INT': 'High Power',
        'IRCB501-6KD-INT': 'High Power',
        'IRCB501-6ND-INT': 'High Protection'
    };

    function getCompatibleController(product) {
        const name = String(product?.name || '').toUpperCase();
        let model = String(product?.detailSpecs?.Controller || '').trim();

        // The selection guide and the robot introduction training material
        // specify the R10-140, R16 and R25 families as High Protection.
        if (InoSite.modelProfile(name).fixed) {
            model = 'IRCB501-6ND-INT';
        }

        let type = controllerTypeByModel[model];
        // GS60 uses the 4MD controller model number but belongs to the
        // High Protection robot/controller category.
        if (InoSite.modelProfile(name).gs60) type = 'High Protection';
        return model && type ? `${model} (${type})` : '-';
    }

    function getRobotBodyOptions(product) {
        if (product.specs.Type === 'SCARA') {
            const variants = catalogGroups.find(group => group.includes(product));
            if (!variants || variants.length === 1) return [];
            return variants.map(variant => ({
                id: variant.id,
                label: modelPages.subtype(variant),
                spec: variant.specs['Clean Type'] === 'Yes' ? modelPages.scaraCleanClass : '클린 사양 없음'
            }));
        }
        if (product.specs.Type !== '6-Axis') return [];

        const name = product.name.toUpperCase();

        if (isFixedBodySpecModel(name)) {
            return [
                { id: 'standard', label: '기본형', spec: 'Body: IP65, Wrist: IP67, 클린 사양 없음' }
            ];
        }

        const cleanClass = InoSite.modelProfile(name).highPayload ? 'ISO Class 4' : 'ISO Class 3';
        const standardIp = InoSite.modelProfile(name).highPayload ? 'IP54' : 'IP40';
        return [
            { id: 'standard', label: '기본형', spec: `${standardIp}, 클린 사양 없음` },
            { id: 'clean', label: '클린형', spec: cleanClass },
            { id: 'ip67', label: '방수방진형', spec: 'IP67' }
        ];
    }

    function getCleanTypeDisplay(product) {
        const cleanType = product?.specs?.['Clean Type'] || '-';
        if (product?.specs?.Type === 'SCARA' && cleanType === 'Yes') return modelPages.scaraCleanClass;
        if (!product || !product.specs || product.specs.Type !== '6-Axis') return cleanType;

        const name = product.name.toUpperCase();
        if (isFixedBodySpecModel(name)) return 'No';
        if (name.includes('R15H') || name.includes('R20H')) return 'No (Option : Class 4)';
        return 'No (Option : Class 3)';
    }

    function isFixedBodySpecModel(name) {
        return InoSite.modelProfile(name).fixed;
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

    function formatWeight(value) {
        return modelPages.formatSpecWithUnit(value, 'kg');
    }

    function formatRepeatability(value) {
        return modelPages.formatSpecWithUnit(value, 'mm');
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
        return '-';
    }

    function getCircuitBreaker(name) {
        const amps = InoSite.modelProfile(name).breaker;
        return amps ? amps + 'A' : '-';
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

        return [...new Set(paths)];
    }

    // Permalinks are real static routes; modal navigation is enhanced with browser history.
    const initialCatalogUrl = new URL(window.location.href);
    if (initialCatalogUrl.pathname.startsWith(modelPages.routePrefix)) initialCatalogUrl.pathname = modelPages.catalogPath;
    initialCatalogUrl.searchParams.delete('model');
    const catalogNavigationUrl = initialCatalogUrl.pathname + initialCatalogUrl.search + initialCatalogUrl.hash;

    function updateModelPageMetadata(product) {
        const i18n = window.InoRobotI18n;
        const title = product
            ? getDisplayModelName(product) + ' ' + uiText('제품 상세 및 구성') + ' | INOVANCE'
            : (i18n?.get('pages.robotSelect.title') || 'INOVANCE Robot Model Selection');
        const description = product
            ? getDisplayModelName(product) + ' · ' + uiText('가반 하중 (kg)') + ': ' + product.specs['Payload(kg)'] + ' · ' + uiText('리치 (mm)') + ': ' + product.specs['Manipulator Length(mm)'] + '. ' + uiText('제품 상세 및 구성')
            : (i18n?.get('pages.robotSelect.description') || 'Select an INOVANCE robot and configure its options.');
        const canonical = 'https://inovancerobot.com' + (product ? modelPages.modelPath(product.id) : modelPages.catalogPath);
        document.title = title;
        let schema = document.querySelector('script[data-model-structured-data]');
        if (product) {
            if (!schema) {
                schema = document.createElement('script');
                schema.type = 'application/ld+json';
                schema.dataset.modelStructuredData = '';
                document.head.appendChild(schema);
            }
            schema.textContent = JSON.stringify({
                '@context': 'https://schema.org', '@type': 'Product', name: getDisplayModelName(product),
                sku: product.id, url: canonical, description,
                image: 'https://inovancerobot.com/1_RobotModelSelect/' + modelPages.imagePath(product),
                brand: {'@type': 'Brand', name: 'INOVANCE'},
                additionalProperty: Object.entries(product.specs).map(([name, value]) => ({'@type': 'PropertyValue', name, value}))
            });
        } else schema?.remove();
        document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical);
        for (const [selector, value] of [
            ['meta[name="description"]', description], ['meta[property="og:title"]', title],
            ['meta[property="og:description"]', description], ['meta[property="og:url"]', canonical],
            ['meta[name="twitter:title"]', title], ['meta[name="twitter:description"]', description]
        ]) document.querySelector(selector)?.setAttribute('content', value);
    }

    function showModelRoute(product, replace = false) {
        if (isManualEmbed || isHiddenProduct(product)) return;
        updateModelPageMetadata(product);
        const target = new URL(window.location.href);
        target.pathname = modelPages.modelPath(product.id);
        target.searchParams.delete('model');
        target.hash = '';
        if (target.pathname + target.search === window.location.pathname + window.location.search) return;
        const previous = history.state && typeof history.state === 'object' ? history.state : {};
        const nextState = {...previous};
        if (!replace) nextState.inorobotModelModal = {listUrl: catalogNavigationUrl};
        history[replace ? 'replaceState' : 'pushState'](nextState, '', target.pathname + target.search);
    }

    function restoreModelFromLocation() {
        if (isManualEmbed) return;
        const product = modelPages.productFromUrl(window.location.href, state.products);
        if (product) {
            openOptionsModal(product.id, {replaceUrl: true});
        } else {
            closeOptionsModal({syncUrl: false});
            updateModelPageMetadata(null);
        }
    }

    window.addEventListener('popstate', restoreModelFromLocation);

    // Modal Logic
    function openOptionsModal(productId, {configuration = null, editingId = null, replaceUrl = false} = {}) {
        const product = state.products.find(p => p.id === productId);
        if (!product) return;

        currentActiveProduct = product;
        editingCartItemId = editingId;

        // CAD availability is known from the static manifest, so opening the
        // modal does not require one or more network HEAD requests.
        const cadBtn = document.getElementById('download-cad-btn');
        const isCadAvailable = Boolean(getCad3dPath(product));
        cadBtn.disabled = !isCadAvailable;
        cadBtn.innerText = uiText(isCadAvailable ? "CAD 다운로드" : "CAD 파일 없음");
        cadBtn.style.opacity = isCadAvailable ? "1" : "0.4";
        cadBtn.style.cursor = isCadAvailable ? "pointer" : "not-allowed";

        const displayName = modelPages.displayName(product);
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
        img.src = modelPages.imagePath(product);
        img.alt = displayName;
        img.style.maxWidth = "100%";
        img.style.maxHeight = "350px";
        img.style.objectFit = "contain";
        imgContainer.appendChild(img);

        leftCol.appendChild(imgContainer);

        const ds = product.detailSpecs || {};
        const is6Axis = product.specs.Type === '6-Axis';
        const isScara = product.specs.Type === 'SCARA';
        const bodyOptions = getRobotBodyOptions(product);
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
            axesRows = `<tr style="border-bottom: 1px solid var(--tool-line); font-size: 11px; color: var(--text-muted);"><td></td><td style="text-align:right; padding: 4px 10px 4px 0;">속도</td><td style="text-align:right; padding: 4px 0;">가동범위</td></tr>`;

            // Requirement 1: Combined Speed for SCARA J1+J2 (Standard color)
            if (isScara) {
                const combinedSpeedKey = dks.find(k => k.toLowerCase().includes('speed') && k.toLowerCase().includes('j1+j2'));
                if (combinedSpeedKey) {
                    axesRows += `<tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>${uiText('J1+J2 합산 속도')}</strong></td><td style="text-align:right; padding-right:10px;">${formatAxisSpecValue(ds[combinedSpeedKey], combinedSpeedKey)}</td><td style="text-align:right;">-</td></tr>`;
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
                    axesRows += `<tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>${label}</strong></td><td style="text-align:right; padding-right:10px;">${speedVal}</td><td style="text-align:right;">${rangeVal}</td></tr>`;
                }
            });
        } else if (tech && tech.axes) {
            axesRows = `
                <tr style="border-bottom: 1px solid var(--tool-line); font-size: 11px; color: var(--text-muted);">
                    <td></td>
                    <td style="text-align:right; padding: 4px 5px 4px 0;">속도</td>
                    <td style="text-align:right; padding: 4px 0;">가동범위</td>
                </tr>
            ` + tech.axes.map(ax => `
                <tr style="border-bottom: 1px solid var(--tool-line);">
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
                if (r12) extraRows += `<tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>반복 정밀도 (J1+J2)</strong></td><td colspan="2" style="text-align:right;">${formatRepeatability(r12)}</td></tr>`;
                if (r3) extraRows += `<tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>반복 정밀도 (J3)</strong></td><td colspan="2" style="text-align:right;">${formatRepeatability(r3)}</td></tr>`;
                if (r4) extraRows += `<tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>반복 정밀도 (J4)</strong></td><td colspan="2" style="text-align:right;">${formatRepeatability(r4)}</td></tr>`;
            } else {
                extraRows += `<tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>반복 정밀도</strong></td><td colspan="2" style="text-align:right;">${formatRepeatability(repeatability)}</td></tr>`;
            }

            for (const [label, value] of modelPages.wristTorqueSpecs(product, uiText)) {
                extraRows += `<tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>${escapeHtml(label)}</strong></td><td colspan="2" style="text-align:right;">${escapeHtml(value)}</td></tr>`;
            }

            // Inertia
            const i4 = ds[dks.find(k => k.toLowerCase().includes('inertia') && k.toLowerCase().includes('j4'))];
            if (i4) extraRows += `<tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>허용 관성 모멘트 (J4)</strong></td><td colspan="2" style="text-align:right;">${i4} kg·m²</td></tr>`;
            if (is6Axis) {
                const i5 = ds[dks.find(k => k.toLowerCase().includes('inertia') && k.toLowerCase().includes('j5'))];
                const i6 = ds[dks.find(k => k.toLowerCase().includes('inertia') && k.toLowerCase().includes('j6'))];
                if (i5) extraRows += `<tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>허용 관성 모멘트 (J5)</strong></td><td colspan="2" style="text-align:right;">${i5} kg·m²</td></tr>`;
                if (i6) extraRows += `<tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>허용 관성 모멘트 (J6)</strong></td><td colspan="2" style="text-align:right;">${i6} kg·m²</td></tr>`;
            }

            // Certification
            const cert = ds[dks.find(k => k.toLowerCase().includes('cert'))];
            const certDisplay = formatCertification(cert, product);
            if (certDisplay) {
                extraRows += `<tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>인증 정보</strong></td><td colspan="2" style="text-align:right; font-size:11px;">${certDisplay}</td></tr>`;
            }
        }

        const specHtml = `
            <div style="margin-top: 20px; padding: 15px; background: var(--tool-inset); border: 1px solid var(--tool-line); border-radius: 8px;">
                <h4 style="margin-bottom: 12px; color: var(--primary-blue); border-bottom: 1px solid var(--tool-line); padding-bottom: 8px;">로봇 스펙 정보</h4>
                <table style="width:100%; font-size:13px; border-collapse: collapse; color: var(--text-main);">
                    <tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>가반 하중(Payload)</strong></td><td colspan="2" style="text-align:right;">${product.specs['Payload(kg)'] || '-'} kg</td></tr>
                    <tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>리치(Reach)</strong></td><td colspan="2" style="text-align:right;">${product.specs['Manipulator Length(mm)'] || '-'} mm</td></tr>
                    ${isScara ? `<tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>로봇 타입</strong></td><td colspan="2" style="text-align:right;">${uiText(modelPages.subtype(product))}</td></tr>` : ''}
                    ${isScara ? `<tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>Z축 길이</strong></td><td colspan="2" style="text-align:right;">${product.specs['Z axis Length(mm)'] || '-'} mm</td></tr>` : ''}
                    ${isScara && ds['Standard cycle time (s)'] ? `<tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>${uiText('표준 사이클 시간')}</strong></td><td colspan="2" style="text-align:right;">${ds['Standard cycle time (s)']} s</td></tr>` : ''}
                    ${is6Axis ? `<tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>중공형(Hollow Wrist)</strong></td><td colspan="2" style="text-align:right;">${formatHollowWrist(product.specs['Hollow Wrist'])}</td></tr>` : ''}
                    <tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>클린 타입</strong></td><td colspan="2" style="text-align:right;">${getCleanTypeDisplay(product)}</td></tr>
                    <tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>${uiText('호환 컨트롤러')}</strong></td><td colspan="2" style="text-align:right; white-space:nowrap;">${getCompatibleController(product)}</td></tr>
                    <tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>방수 방진 등급</strong></td><td colspan="2" style="text-align:right;">${ipRating}</td></tr>
                    <tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>중량</strong></td><td colspan="2" style="text-align:right;">${formatWeight(weight)}</td></tr>
                    ${extraRows}
                    ${axesRows}
                    <tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>사용자 배선</strong></td><td colspan="2" style="text-align:right;">${ioPins}</td></tr>
                    <tr style="border-bottom: 1px solid var(--tool-line);"><td style="padding:6px 0;"><strong>사용자 공압</strong></td><td colspan="2" style="text-align:right;">${air}</td></tr>
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

        const optionalHeading = title => `
            <div class="configuration-heading">
                <h3>${escapeHtml(uiText(title))}</h3>
                <span class="configuration-codes"></span>
            </div>`;

        const infoHtml = `
            <div id="dynamic-purchase-code" style="font-size:14px;margin-bottom:8px;font-weight:bold;color:var(--primary-blue);">${uiText('현재 구매 코드')}: ${baseCode}</div>
            <div id="lead-time-display" style="font-size:13px;margin-bottom:15px;color:#eee;background:rgba(255,255,255,0.05);padding:10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);">
                <strong>${uiText('예상 납기')}:</strong> <span id="lead-time-value" style="color:var(--secondary-orange); font-weight:bold;">TBD</span>
            </div>
            <h2 id="modal-model-name" style="color:var(--text-main);margin-bottom:12px;">${displayName}</h2>

            <ol class="configuration-sections">
                <li>
                    <div class="configuration-heading">
                        <h3>${uiText('로봇 구성 (필수)')}</h3>
                        <label class="robot-quantity" for="robot-quantity">
                            <span>${uiText('수량')}</span>
                            <input id="robot-quantity" name="robotQuantity" type="number" min="1" step="1" value="1" class="accessory-quantity" aria-label="${escapeHtml(uiText('로봇 수량'))}">
                        </label>
                    </div>
                    <div class="configuration-field">
                        <h4>${uiText('파워/엔코더 케이블 길이')}</h4>
                        <div id="cable-len-container" class="configuration-options"></div>
                    </div>
                    <div class="configuration-field">
                        <h4>${uiText('파워/엔코더 케이블 타입')}</h4>
                        <div id="cable-type-container" class="configuration-options"></div>
                    </div>
                    ${bodyOptions.length ? `
                    <div class="configuration-field">
                        <h4>${uiText('로봇 바디 옵션')}</h4>
                        <div id="robot-body-option-container" class="configuration-options"></div>
                    </div>` : ''}
                </li>
                <li>
                    ${optionalHeading('펜던트 구성 (선택)')}
                    <div id="pendant-container" class="configuration-stack"></div>
                </li>
                ${is6Axis ? `
                <li>
                    ${optionalHeading('I/O 케이블 구성 (선택)')}
                    <div class="configuration-field">
                        <h4 id="arm-cable-title">${uiText('Arm I/O 케이블')}</h4>
                        <div id="arm-container" class="configuration-stack"></div>
                    </div>
                    <div class="configuration-field">
                        <h4>${uiText('Body I/O 케이블')}</h4>
                        <div id="body-container" class="configuration-stack"></div>
                    </div>
                </li>` : ''}
                <li>
                    ${optionalHeading('통신 구성 (선택)')}
                    <p class="configuration-note">Modbus-RTU, Modbus-TCP, EtherNet/IP, EtherCAT, MC ${uiText('통신은 기본 제공됩니다.')}</p>
                    <div id="comm-radios" class="configuration-options">
                        <label class="cable-option" style="margin:0;">
                            <input type="radio" name="commSelection" value="none" checked data-code="">
                            <span>${uiText('기본 프로토콜 사용')}</span>
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
                </li>
                <li>
                    ${optionalHeading('컨트롤러 확장 카드 (선택)')}
                    <div id="expansion-cards-container" class="configuration-stack"></div>
                </li>
                <li>
                    ${optionalHeading('리모트 커플러 (선택)')}
                    <div id="remote-couplers-container" class="configuration-stack"></div>
                </li>
                <li>
                    ${optionalHeading('기타 액세서리 (선택)')}
                    <div id="other-accessories-container" class="configuration-stack"></div>
                </li>
            </ol>
        `;
        rightCol.innerHTML = infoHtml;

        modalBody.appendChild(leftCol);
        modalBody.appendChild(rightCol);

        const robotQuantityInput = rightCol.querySelector('input[name="robotQuantity"]');
        if (robotQuantityInput) {
            robotQuantityInput.addEventListener('change', () => {
                robotQuantityInput.value = String(parsePositiveQuantity(robotQuantityInput.value));
            });
        }

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
            const inputName = isScara ? 'scaraVariant' : 'robotBodyOption';
            const selectedId = isScara ? product.id : 'standard';
            bodyOptions.forEach(option => {
                const btn = document.createElement('label');
                btn.className = 'cable-option';
                btn.style.margin = '0';
                btn.style.alignItems = 'center';
                btn.style.minWidth = '190px';
                btn.innerHTML = `
                    <input type="radio" name="${inputName}" value="${option.id}" ${option.id === selectedId ? 'checked' : ''} data-label="${option.label}" data-spec="${option.spec}">
                    <span>
                        <strong>${uiText(option.label)}</strong>
                        <small class="configuration-hint">${localizeDisplayText(option.spec)}</small>
                    </span>
                `;
                robotBodyOptionContainer.appendChild(btn);
            });
        }

        function updateHeaderCodes() {
            for (const badges of rightCol.querySelectorAll('.configuration-codes')) {
                const codes = new Set();
                for (const input of badges.closest('li').querySelectorAll(accessorySelectionSelector)) {
                    if (input.checked && !input.disabled && input.value !== 'none') {
                        codes.add(input.dataset.code || input.value);
                    }
                }
                badges.innerHTML = Array.from(codes, code => `<span class="code-badge">${escapeHtml(code)}</span>`).join('');
            }
            syncAccessoryQuantityControls();
        }

        // Function to update dynamic code display
        function updateDynamicCode() {
            const lenEl = rightCol.querySelector('input[name="cableLenSelection"]:checked');
            const typeEl = rightCol.querySelector('input[name="cableTypeSelection"]:checked');
            const lenValue = lenEl ? lenEl.value : '';
            const typeValue = typeEl ? typeEl.value : '';
            const isFlex = typeValue.includes('High Flex');

            const matched = InoSite.matchCable(product.cables, lenValue, isFlex);

            const codeDisplay = rightCol.querySelector('#dynamic-purchase-code');
            const leadTimeVal = rightCol.querySelector('#lead-time-value');
            
            if (codeDisplay) {
                const selectedBodyOption = rightCol.querySelector('input[name="robotBodyOption"]:checked');
                const bodyOptionNeedsCode = selectedBodyOption && selectedBodyOption.value !== 'standard';
                const bodyOptionCode = getBodyOptionPurchaseCode(product, selectedBodyOption ? selectedBodyOption.value : 'standard');
                const finalCode = bodyOptionNeedsCode ? bodyOptionCode : (matched ? matched.code : (product.cables.length > 0 ? product.cables[0].code : 'N/A'));
                codeDisplay.innerHTML = `${uiText('현재 구매 코드')}: <span class="code-badge">${finalCode}</span>`;

                if (leadTimeVal) {
                    leadTimeVal.textContent = uiText(InoSite.leadTime(product, finalCode, hasKcsCertification(product)));
                }
            }
            updateModalModelName();
            updateHeaderCodes();
        }

        lenContainer.addEventListener('change', updateDynamicCode);
        typeContainer.addEventListener('change', updateDynamicCode);
        robotBodyOptionContainer?.addEventListener('change', event => {
            if (!isScara) {
                updateDynamicCode();
                return;
            }
            const scrollTop = modalBody.scrollTop;
            openOptionsModal(event.target.value, {
                configuration: collectCurrentCartItem(), editingId: editingCartItemId, replaceUrl: true
            });
            modalBody.scrollTop = scrollTop;
            modalBody.querySelector('input[name="scaraVariant"]:checked')?.focus({preventScroll: true});
        });
        
        // Accessory Filtering Logic
        const accs = state.accessories;
        const prodName = product.name;
        const scaraVariant = /^IR-(S\d+)-\d+Z\d+([CS])-/i.exec(prodName);
        const compatibilityName = scaraVariant ? `${prodName} ${scaraVariant[1]}${scaraVariant[2]}` : prodName;
        const compatible = InoSite.compatibleAccessories(compatibilityName, accs);

        // 1. Pendant Logic
        const pendantContainer = rightCol.querySelector('#pendant-container');
        const pendantOptions = compatible.filter(a => a.type === 'Pendant');
        
        pendantContainer.innerHTML = `
            <div>
                <div class="configuration-hint">${uiText('펜던트 사용 여부 선택')}</div>
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
                <div class="configuration-hint">${uiText('펜던트 길이 선택')}</div>
                <div style="display:flex; flex-wrap:wrap; gap:10px;" id="pendant-length-radios"></div>
            </div>
        `;
        const pConfigRadios = pendantContainer.querySelector('#pendant-config-radios');
        const pLengthRadios = pendantContainer.querySelector('#pendant-length-radios');

        function updatePendantState() {
            const config = pConfigRadios.querySelector('input[name="pendantConfig"]:checked');
            const isEnabled = config && config.value !== 'none';
            const hasCover = config && config.value === 'with-cover';
            const hasCoverMetadata = pendantOptions.some(option => option.emergency_stop_cover !== undefined && option.emergency_stop_cover !== null);
            const optionHasCover = option => option.emergency_stop_cover === true
                || ['true', 'yes', '1', 'with-cover'].includes(String(option.emergency_stop_cover || '').toLowerCase());
            const availableOptions = pendantOptions
                .filter(option => !hasCoverMetadata || optionHasCover(option) === hasCover)
                .sort((a, b) => parseLen(a.spec) - parseLen(b.spec));

            pLengthRadios.innerHTML = availableOptions.map((opt, index) => `
                <label class="cable-option" style="margin:0;">
                    <input type="radio" name="pendantLength" value="${opt.code}" data-desc="${opt.description}" data-spec="${opt.spec || ''}" ${isEnabled && index === 0 ? 'checked' : ''} ${isEnabled ? '' : 'disabled'}>
                    <span>${opt.spec || uiText(opt.name)}</span>
                </label>
            `).join('');
            setupAccessoryQuantityControls();
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

        // 2. Arm / Body Cable Logic (Requirement 4)
        if (is6Axis) {
            const armContainer = rightCol.querySelector('#arm-container');
            const armOptions = compatible.filter(a => a.name === 'Robot arm I/O cable');
            const bodyContainer = rightCol.querySelector('#body-container');
            const bodyOptions = compatible.filter(a => a.name === 'Robot Body I/O cable');

            // R15H/R20H Arm and Body I/O cables are sold as one selectable set.
            const ioSetGroups = {};
            [...armOptions, ...bodyOptions].forEach(opt => {
                if (!opt.setId) return;
                if (!ioSetGroups[opt.setId]) ioSetGroups[opt.setId] = {};
                if (opt.name === 'Robot arm I/O cable') ioSetGroups[opt.setId].arm = opt;
                if (opt.name === 'Robot Body I/O cable') ioSetGroups[opt.setId].body = opt;
            });
            const pairedIoCableSets = Object.entries(ioSetGroups)
                .filter(([, set]) => set.arm && set.body)
                .map(([setId, set]) => ({ setId, ...set }));

            if (pairedIoCableSets.length > 0) {
                rightCol.querySelector('#arm-cable-title').textContent = uiText('Arm/Body I/O 케이블은 세트로 선택됩니다.');
                bodyContainer.closest('.configuration-field').hidden = true;
                armContainer.innerHTML = `<div id="io-cable-set-radios" class="configuration-stack">
                    <label class="cable-option" style="margin:0;">
                        <input type="radio" name="ioCableSetSelection" value="none" checked><span>${uiText('사용안함')}</span>
                    </label>
                </div>`;
                const radios = armContainer.querySelector('#io-cable-set-radios');
                pairedIoCableSets.forEach(set => {
                    const armPin = getPinCount(set.arm.description) || '기본핀';
                    const bodyPin = getPinCount(set.body.description) || '기본핀';
                    const armSpec = set.arm.spec === '-' ? uiText('커넥터만') : set.arm.spec;
                    const bodySpec = set.body.spec === '-' ? uiText('커넥터만') : set.body.spec;
                    const label = document.createElement('label');
                    label.className = 'cable-option';
                    label.style.margin = '0';
                    label.innerHTML = `<input type="radio" name="ioCableSetSelection" value="${set.setId}" data-code="${set.arm.code}" data-arm-pin="${armPin}" data-arm-desc="${set.arm.description}" data-arm-spec="${set.arm.spec || ''}" data-body-pin="${bodyPin}" data-body-desc="${set.body.description}" data-body-spec="${set.body.spec || ''}">
                        <span><strong>${set.arm.code}</strong><small class="configuration-hint">${uiText('Arm I/O 케이블')}: ${formatPinCount(armPin)} ${armSpec}<br>${uiText('Body I/O 케이블')}: ${formatPinCount(bodyPin)} ${bodySpec}</small></span>`;
                    radios.appendChild(label);
                });
                radios.addEventListener('change', updateHeaderCodes);
            } else {
            // Group Arm I/O by pins
            
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
                    groupDiv.innerHTML = `<div class="configuration-hint">${formatPinCount(pin)} ${uiText('케이블 선택')}</div>
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
                armContainer.innerHTML = `<span class="configuration-hint">${uiText('해당 모델에 호환되는 Arm 케이블 옵션이 없습니다.')}</span>`;
            }

            // Group Body I/O by pins
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
                    groupDiv.innerHTML = `<div class="configuration-hint">${formatPinCount(pin)} ${uiText('케이블 선택')}</div>
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
                bodyContainer.innerHTML = `<span class="configuration-hint">${uiText('해당 모델에 호환되는 Body 케이블 옵션이 없습니다.')}</span>`;
                }
            }
        }

        // 3. Other Accessories Logic (Requirement 1 & 2)
        const otherAccContainer = rightCol.querySelector('#other-accessories-container');
        const otherOptions = compatible.filter(a => hardwareCategoryType(a) === 'Accessory');

        if (otherOptions.length > 0) {
            otherOptions.forEach(acc => {
                const lbl = document.createElement('label');
                lbl.style.display = "flex"; lbl.style.alignItems = "start"; lbl.style.gap = "8px"; lbl.style.fontSize = "14px"; lbl.style.cursor = "pointer";
                lbl.innerHTML = `
                    <input type="checkbox" name="accSelection" value="${acc.code}" data-desc="${acc.name} - ${acc.description}" data-spec="${acc.spec || ''}" style="margin-top:3px;">
                    <div style="flex:1;">
                        <strong>${uiText(acc.name || 'Accessory')}</strong>
                        <span class="option-item-code code-badge">${acc.code}</span>
                        <br><span class="configuration-hint">${uiText(acc.description)}</span>
                    </div>
                `;
                otherAccContainer.appendChild(lbl);
            });
            otherAccContainer.addEventListener('change', updateHeaderCodes);
        } else {
            otherAccContainer.innerHTML = `<span class="configuration-hint">${uiText('기타 악세서리가 없습니다.')}</span>`;
        }

        // 4. Expansion Cards Logic
        const expContainer = rightCol.querySelector('#expansion-cards-container');
        if (expansionSections.length) {
            expContainer.innerHTML = expansionSections.map(section => {
                const choices = section.parts.map(part => `<label class="expansion-card-choice">
                    <input type="checkbox" name="expSelection" value="${escapeHtml(part.code)}"
                        data-desc="${escapeHtml(part.name + ' - ' + part.description)}" data-spec="${escapeHtml(part.spec || '')}">
                    <span class="expansion-card-description"><strong>${escapeHtml(uiText(part.name))}</strong>
                        <span class="option-item-code code-badge">${escapeHtml(part.code)}</span><br>
                        <span class="configuration-hint">${escapeHtml(uiText(part.description))}</span></span>
                </label>`).join('');
                return `<section class="configuration-stack expansion-group"><h4 class="expansion-group-title">${escapeHtml(uiText(section.label))}</h4>${choices}</section>`;
            }).join('');
            expContainer.addEventListener('change', updateHeaderCodes);
        } else {
            expContainer.innerHTML = `<span class="configuration-hint">${uiText('확장 카드 옵션이 없습니다.')}</span>`;
        }

        // 5. Remote Coupler Logic
        const remoteCouplerContainer = rightCol.querySelector('#remote-couplers-container');
        const remoteCouplerOptions = accs.filter(a => a.type === 'Remote Coupler');

        if (remoteCouplerOptions.length > 0) {
            remoteCouplerOptions.forEach(acc => {
                const lbl = document.createElement('label');
                lbl.style.display = "flex"; lbl.style.alignItems = "start"; lbl.style.gap = "8px"; lbl.style.fontSize = "14px"; lbl.style.cursor = "pointer";
                lbl.innerHTML = `
                    <input type="checkbox" name="remoteCouplerSelection" value="${acc.code}" data-desc="${acc.name} - ${acc.description}" data-spec="${acc.spec || ''}" style="margin-top:3px;">
                    <div style="flex:1;">
                        <strong>${uiText(acc.name)}</strong>
                        <span class="option-item-code code-badge">${acc.code}</span>
                        <br><span class="configuration-hint">${uiText(acc.description)}</span>
                    </div>
                `;
                remoteCouplerContainer.appendChild(lbl);
            });
            remoteCouplerContainer.addEventListener('change', updateHeaderCodes);
        } else {
            remoteCouplerContainer.innerHTML = `<span class="configuration-hint">${uiText('리모트 커플러 옵션이 없습니다.')}</span>`;
        }

        setupAccessoryQuantityControls();
        if (configuration) restoreCartItemToModal(configuration);
        const communicationRadios = rightCol.querySelector('#comm-radios');
        linkCommunicationCards(communicationRadios);
        communicationRadios.addEventListener('change', updateHeaderCodes);
        updateDynamicCode();
        if (addToCartBtn) {
            addToCartBtn.textContent = uiText(editingId ? '구성 수정' : '구성 담기');
        }
        if (window.InoRobotI18n) {
            window.InoRobotI18n.apply(modalBody);
        }
        modalOverlay.style.display = 'flex';
        showModelRoute(product, replaceUrl);
    }

    function closeOptionsModal({syncUrl = true} = {}) {
        const wasOpen = modalOverlay.style.display !== 'none';
        modalOverlay.style.display = 'none';
        currentActiveProduct = null;
        editingCartItemId = null;
        if (!syncUrl || isManualEmbed || !wasOpen) return;
        updateModelPageMetadata(null);
        if (history.state?.inorobotModelModal) {
            history.back();
        } else {
            const previous = history.state && typeof history.state === 'object' ? {...history.state} : {};
            delete previous.inorobotModelModal;
            history.replaceState(previous, '', catalogNavigationUrl);
        }
    }

    closeModalBtn.addEventListener('click', closeOptionsModal);

    function addCurrentConfigurationToCart() {
        if (!currentActiveProduct) return;

        const robotQuantityInput = modalBody.querySelector('input[name="robotQuantity"]');
        const rawRobotQuantity = robotQuantityInput ? Number.parseInt(robotQuantityInput.value, 10) : NaN;
        if (!Number.isFinite(rawRobotQuantity) || rawRobotQuantity < 1) {
            alert(uiText('수량은 1개 이상이어야 합니다.'));
            return;
        }
        const invalidAccessoryQuantity = Array.from(modalBody.querySelectorAll('.accessory-quantity-wrap:not(.is-hidden) .accessory-quantity'))
            .some(input => {
                const value = Number.parseInt(input.value, 10);
                return !Number.isFinite(value) || value < 1;
            });
        if (invalidAccessoryQuantity) {
            alert(uiText('수량은 1개 이상이어야 합니다.'));
            return;
        }

        const cartItem = collectCurrentCartItem();
        if (!cartItem) return;

        if (editingCartItemId) {
            const index = cartItems.findIndex(item => item.id === editingCartItemId);
            if (index >= 0) cartItems[index] = cartItem;
            else cartItems.push(cartItem);
        } else {
            cartItems.push(cartItem);
        }

        persistCartItems();
        renderCart();
        closeOptionsModal();
        setCartOpen(true);
    }

    addToCartBtn?.addEventListener('click', addCurrentConfigurationToCart);
    cartToggleBtn?.addEventListener('click', () => setCartOpen(true));
    cartCloseBtn?.addEventListener('click', () => setCartOpen(false));
    cartOverlay?.addEventListener('click', event => {
        if (event.target === cartOverlay) setCartOpen(false);
    });
    cartClearBtn?.addEventListener('click', () => {
        if (cartItems.length === 0) return;
        if (!window.confirm(uiText('전체 구성 삭제') + '?')) return;
        cartItems = [];
        persistCartItems();
        renderCart();
    });
    cartList?.addEventListener('change', event => {
        const id = event.target.dataset.hardwareQuantity;
        if (!id) return;
        const item = cartItems.find(entry => entry.id === id && entry.kind === 'hardware');
        if (!item) return;
        const quantity = event.target.valueAsNumber;
        if (!Number.isSafeInteger(quantity) || quantity < 1) {
            event.target.value = String(item.quantity);
            return;
        }
        item.quantity = quantity;
        persistCartItems();
    });
    cartList?.addEventListener('click', event => {
        const button = event.target.closest('[data-cart-action]');
        if (!button) return;

        const item = cartItems.find(entry => entry.id === button.dataset.cartId);
        if (!item) return;

        if (button.dataset.cartAction === 'delete') {
            cartItems = cartItems.filter(entry => entry.id !== item.id);
            persistCartItems();
            renderCart();
            return;
        }

        if (button.dataset.cartAction === 'edit') {
            const product = state.products.find(entry => entry.id === item.modelId);
            if (!product) return;
            setCartOpen(false);
            openOptionsModal(product.id, {configuration: item, editingId: item.id});
        }
    });

    function createConfigurationReport(items) {
        const parts = items.flatMap(item => {
            if (item.kind === 'hardware') {
                return [{kind: 'option', modelNumber: localizeDisplayText(item.name), code: item.code,
                    type: getConfigurationComponentType(item.category, item.name),
                    details: hardwareDescription(item), quantity: parsePositiveQuantity(item.quantity)}];
            }
            const product = state.products.find(entry => entry.id === item.modelId);
            const modelNumber = item.modelName || (product ? getDisplayModelName(product, item.bodyOptionValue) : item.modelId || item.productName || '-');
            const cable = item.cable || {};
            const accessories = Array.isArray(item.accessories) ? item.accessories : [];
            const bodyOption = accessories.find(option => option.category === 'Robot Body');
            const robotCode = item.purchaseCode || cable.code || '-';
            const cableMovement = getPowerEncoderCableMovement(cable);
            const cableDetail = cableMovement
                ? [cableMovement, cable.length].filter(Boolean).join(' / ')
                : cable.description || [cable.type, cable.length].filter(Boolean).join(' / ');
            const robotCableDetail = cableMovement
                ? `${uiText('파워/엔코더 케이블')}: ${cableDetail}`
                : localizeDisplayText(cableDetail);
            const hasSeparateCableCode = Boolean(cable.code && cable.code !== robotCode);
            const robotDetails = [
                robotCableDetail,
                bodyOption ? localizeDisplayText(bodyOption.detail || bodyOption.name) : ''
            ].filter(Boolean).join(' / ');
            const rows = [{
                kind: 'robot',
                modelNumber: modelNumber || '-',
                code: robotCode,
                type: getConfigurationRobotType(product),
                details: robotDetails,
                quantity: parsePositiveQuantity(item.robotQuantity)
            }];

            if (hasSeparateCableCode) {
                rows.push({
                    kind: 'cable',
                    modelNumber: uiText('기본 케이블'),
                    code: cable.code,
                    type: uiText('파워/엔코더 케이블'),
                    details: cableMovement ? cableDetail : localizeDisplayText(cableDetail),
                    quantity: parsePositiveQuantity(item.robotQuantity)
                });
            }

            const cableSets = new Map();
            accessories.forEach(option => {
                if (option.category === 'Robot Body') return;
                const part = {
                    kind: 'option',
                    modelNumber: localizeDisplayText(option.name || option.category || '-'),
                    code: option.code || '-',
                    type: getConfigurationComponentType(option.category, option.name),
                    details: localizeDisplayText(option.detail || ''),
                    quantity: parsePositiveQuantity(option.quantity)
                };
                // Arm and body entries from the same I/O set share one ordered quantity.
                if (option.inputName === 'ioCableSetSelection' && option.code) {
                    const set = cableSets.get(option.code);
                    if (set) {
                        for (const field of ['modelNumber', 'type', 'details']) {
                            set[field] = [...new Set([set[field], part[field]].filter(Boolean))].join('\n');
                        }
                        set.quantity = Math.max(set.quantity, part.quantity);
                        return;
                    }
                    cableSets.set(option.code, part);
                }
                rows.push(part);
            });

            return rows;
        });
        return configurationWorkbook.createReport(parts, uiText, items.length);
    }

    function getPowerEncoderCableMovement(cable) {
        const cableText = `${cable?.type || ''} ${cable?.description || ''}`.toLowerCase();
        if (/non[-\s]?flexible/.test(cableText)) return uiText('비가동형');
        if (/high[-\s]?flex|flexible|유연형|가동형/.test(cableText)) return uiText('가동형');
        if (/standard|표준형|비가동형/.test(cableText)) return uiText('비가동형');
        return '';
    }

    function getConfigurationRobotType(product) {
        if (product?.specs?.Type === '6-Axis') return uiText('다관절');
        if (product?.specs?.Type === 'SCARA') {
            const isCeilingMounted = product.specs['Sub Type'] === '천장형'
                || /\bTS[45]\b/i.test(String(product.name || ''));
            return uiText(isCeilingMounted ? '천장형 SCARA 로봇' : 'SCARA');
        }
        return uiText('로봇');
    }

    function getConfigurationComponentType(category, name = '') {
        if (isPendantExtensionCable(name)) return uiText('티칭 펜던트 연장 케이블');
        if (category === 'Pendant') return uiText('펜던트');
        if (category === 'Arm I/O Cable') return uiText('Arm I/O (J4)');
        if (category === 'Body I/O Cable') return uiText('Arm I/O (Base)');
        if (category === 'Communication') return uiText('Communication');
        if (category === 'Expansion Card') return uiText('확장 카드');
        if (category === 'Remote Coupler') return uiText('리모트 커플러');
        return uiText('기타 악세서리');
    }

    function getConfigurationWorkbookFilename(items) {
        const safeModel = String(items[0]?.modelId || items[0]?.modelName || items[0]?.code || 'Robot')
            .replace(/[\\/:*?"<>|]+/g, '_');
        const date = new Date().toISOString().slice(0, 10);
        return items.length === 1
            ? `Inovance_Config_${safeModel}_${date}.xlsx`
            : `Inovance_Configurations_${date}.xlsx`;
    }

    function renderConfigurationWorkbookPreview(report) {
        const preview = document.createElement('div');
        preview.className = 'model-manual-configuration-sheet';
        const totalWidth = report.columns.reduce((sum, column) => sum + column.width, 0);
        const columnTags = report.columns.map(column => `<col style="width:${100 * column.width / totalWidth}%">`);
        const headers = report.columns.map(column => `<th scope="col">${escapeHtml(column.label)}</th>`);
        const rows = report.rows.map(({kind, values}) => `<tr class="sheet-${kind}">` +
            values.map((value, i) => `<td class="sheet-${report.columns[i].format}">${escapeHtml(value)}</td>`).join('') + '</tr>');
        preview.innerHTML = `<table><colgroup>${columnTags.join('')}</colgroup><thead>
            <tr class="sheet-summary"><th colspan="3">${escapeHtml(report.title)}</th>
                <td>${escapeHtml(report.configurationLabel)}</td><td>${report.configurationCount}</td>
                <td>${escapeHtml(report.quantityLabel)}</td><td>${report.robotQuantity}</td></tr>
            <tr>${headers.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
        return preview;
    }

    async function downloadConfigurationWorkbook(items, button) {
        const selectedItems = Array.isArray(items) ? items.filter(Boolean) : [];
        if (selectedItems.length === 0) {
            alert(uiText('구성 목록이 비어 있습니다.'));
            return;
        }

        const report = createConfigurationReport(selectedItems);

        const oldText = button?.textContent;
        if (button) {
            button.disabled = true;
            button.textContent = uiText('구성서 생성 중...');
        }

        try {
            const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            const blob = InoSite.workbook(configurationWorkbook.buildFiles(report), mimeType);
            const filename = getConfigurationWorkbookFilename(selectedItems);
            if (window.saveAs) {
                window.saveAs(blob, filename);
            } else {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
        } catch (error) {
            console.error('Configuration Excel Generation Error:', error);
            alert(uiText('엑셀 파일 생성 중 오류가 발생했습니다.'));
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = oldText;
            }
        }
    }

    downloadComponentsBtn.addEventListener('click', () => {
        const items = cartItems.length > 0 ? cartItems : [collectCurrentCartItem()].filter(Boolean);
        downloadConfigurationWorkbook(items, downloadComponentsBtn);
    });

    cartDownloadBtn?.addEventListener('click', () => downloadConfigurationWorkbook(cartItems, cartDownloadBtn));
    document.getElementById('download-cad-btn').addEventListener('click', async () => {
        const product = currentActiveProduct;
        if (!product) return;
        const btn = document.getElementById('download-cad-btn');
        const oldText = btn.innerText;
        btn.innerText = "준비 중...";
        btn.disabled = true;

        try {
            const zip = new JSZip();
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
            const pendantConfig = document.querySelector('input[name="pendantConfig"]:checked')?.value;
            const isPendant = pendantConfig && pendantConfig !== 'none';
            
            // Build all potential file objects
            const robotFileTasks = [
                { id: '2D', ext: 'dwg', baseUrl: robotBaseUrl, modelId: modelId },
                { id: '3D', ext: 'stp', baseUrl: robotBaseUrl, modelId: modelId }
            ];

            const ctrlFiles = [
                { path: `Robot_CAD/Controller/${ctrl}/${ctrl}.dwg`, name: `${ctrl}.dwg` },
                { path: `Robot_CAD/Controller/${ctrl}/${ctrl}.stp`, name: `${ctrl}.stp` }
            ];

            const tpFiles = isPendant ? (() => {
                const pendantCadName = pendantConfig === 'with-cover'
                    ? 'IR-TP200-EMO-INT'
                    : 'IR-TP-200';
                const pendantCadFiles = pendantConfig === 'with-cover'
                    ? [`${pendantCadName}.dwg`, `${pendantCadName}.stp`]
                    : [`${pendantCadName}_2D-INT.dwg`, `${pendantCadName}_3D-INT.stp`];

                return pendantCadFiles.map(fileName => ({
                    path: `Robot_CAD/IR-TP-200/${fileName}`,
                    name: fileName
                }));
            })() : [];

            // Helper to fetch single file with fallback (for -INT suffix)
            async function fetchRobotFile(task) {
                const manifestPath = task.id === '3D' && task.ext === 'stp'
                    ? getCad3dPath(product)
                    : null;
                const fallbackPaths = getCadCandidatePaths(product, task.id, task.ext);
                const pathsToTry = manifestPath
                    ? [manifestPath, ...fallbackPaths.filter(path => path !== manifestPath)]
                    : fallbackPaths;

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
            if (currentActiveProduct === product) {
                btn.innerText = oldText;
                btn.disabled = false;
            }
        }
    });

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeOptionsModal();
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
        productCards.clear();
        const activeProductId = currentActiveProduct && modalOverlay.style.display !== 'none'
            ? currentActiveProduct.id
            : null;
        const draft = activeProductId ? collectCurrentCartItem() : null;
        renderCatalog();
        renderCart();
        if (hardwareDialog.open) {
            renderHardwareDetails(hardwareCategories.find(category => category.id === hardwareDialog.dataset.category), hardwareDraft());
        }
        if (activeProductId && draft) {
            openOptionsModal(activeProductId, {configuration: draft, editingId: editingCartItemId, replaceUrl: true});
        }
    });

    renderCatalog();
    renderCart();
    restoreModelFromLocation();

    if (isManualEmbed) {
        const demoFilters = [
            { categoryId: 'Type', optionId: '6-Axis' },
            { categoryId: 'Payload(kg)', optionId: '25' },
            { categoryId: 'Manipulator Length(mm)', optionId: '1783' }
        ];
        const demoOptions = [
            ['cableTypeSelection', 'High Flex (유연형)'],
            ['pendantConfig', 'without-cover'],
            ['commSelection', 'IRCB501-2PN-BD']
        ];
        const demoProductId = 'IR-R25-178S-INT';
        let manualTargets = [];
        let manualCursor = null;
        let manualSpotlight = null;
        let manualRipple = null;
        let manualToast = null;
        let manualPreview = null;
        let manualFocusPoint = null;
        let manualCue = '';
        let manualTargetToken = 0;
        let manualPaused = false;
        let manualAnimateScroll = false;
        let manualScrollAnimation = null;
        let manualScrollTracking = false;
        let manualConfiguredOptionCount = -1;
        let manualActivationFrame = null;
        const manualReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const MANUAL_SCROLL_DURATION = 720;

        function isManualRootScroller(element) {
            return element === document.scrollingElement
                || element === document.documentElement
                || element === document.body;
        }

        function getManualScrollTop(element) {
            return isManualRootScroller(element)
                ? (window.scrollY || document.documentElement.scrollTop || 0)
                : element.scrollTop;
        }

        function setManualScrollTop(element, value) {
            if (isManualRootScroller(element)) window.scrollTo(0, value);
            else element.scrollTop = value;
        }

        function getManualScrollContainer(target) {
            const modalScroller = target.closest('.modal-body');
            let ancestor = target.parentElement;
            while (ancestor && ancestor !== document.body) {
                const style = window.getComputedStyle(ancestor);
                if (/(auto|scroll|overlay)/.test(style.overflowY)
                    && ancestor.scrollHeight > ancestor.clientHeight + 1) return ancestor;
                ancestor = ancestor.parentElement;
            }
            if (modalScroller) return modalScroller;
            return document.scrollingElement || document.documentElement;
        }

        function cancelManualScroll(complete = false) {
            const animation = manualScrollAnimation;
            if (!animation) {
                setManualScrollTracking(false);
                return;
            }
            if (animation.frame !== null) cancelAnimationFrame(animation.frame);
            manualScrollAnimation = null;
            setManualScrollTracking(false);
            if (!complete) return;
            setManualScrollTop(animation.container, animation.end);
            animation.onUpdate?.(1);
            animation.onComplete?.();
        }

        function cancelManualActivation() {
            if (manualActivationFrame === null) return;
            window.cancelAnimationFrame(manualActivationFrame);
            manualActivationFrame = null;
        }

        function setManualScrollTracking(tracking) {
            manualScrollTracking = Boolean(tracking);
            manualSpotlight?.classList.toggle('is-scroll-tracking', manualScrollTracking);
        }

        function finishManualScrollTracking() {
            if (!manualScrollTracking) return;
            manualScrollTracking = false;
            manualSpotlight?.classList.remove('is-scroll-tracking');
        }

        function startManualScroll(container, end, options = {}) {
            cancelManualScroll(false);
            const start = getManualScrollTop(container);
            const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
            const destination = Math.max(0, Math.min(maximum, end));
            const animate = Boolean(options.animate)
                && !manualPaused
                && !manualReducedMotion.matches
                && Math.abs(destination - start) > 1;

            if (!animate) {
                setManualScrollTracking(false);
                setManualScrollTop(container, destination);
                options.onUpdate?.(1);
                options.onComplete?.();
                return;
            }

            const animation = {
                container,
                start,
                end: destination,
                elapsed: 0,
                duration: Math.max(180, Number(options.duration) || MANUAL_SCROLL_DURATION),
                lastTimestamp: 0,
                frame: null,
                onUpdate: options.onUpdate,
                onComplete: options.onComplete,
                step: null
            };

            animation.step = timestamp => {
                if (manualScrollAnimation !== animation || manualPaused) return;
                if (!animation.lastTimestamp) animation.lastTimestamp = timestamp;
                else {
                    animation.elapsed += Math.min(64, timestamp - animation.lastTimestamp);
                    animation.lastTimestamp = timestamp;
                }
                const progress = Math.min(1, animation.elapsed / animation.duration);
                const eased = progress < 0.5
                    ? 4 * progress * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
                setManualScrollTop(container, animation.start + (animation.end - animation.start) * eased);
                animation.onUpdate?.(progress);
                if (progress < 1) {
                    animation.frame = requestAnimationFrame(animation.step);
                    return;
                }
                manualScrollAnimation = null;
                animation.frame = null;
                finishManualScrollTracking();
                animation.onComplete?.();
            };

            manualScrollAnimation = animation;
            setManualScrollTracking(true);
            animation.frame = requestAnimationFrame(animation.step);
        }

        function scrollManualTargetIntoView(target, options = {}) {
            const container = getManualScrollContainer(target);
            const targetRect = target.getBoundingClientRect();
            const rootScroller = isManualRootScroller(container);
            const containerRect = rootScroller
                ? { top: 0, height: window.innerHeight }
                : container.getBoundingClientRect();
            const current = getManualScrollTop(container);
            const relativeTop = rootScroller ? targetRect.top : targetRect.top - containerRect.top;
            const destination = current + relativeTop
                - Math.max(0, (containerRect.height - targetRect.height) / 2);
            startManualScroll(container, destination, options);
        }

        manualReducedMotion.addEventListener?.('change', event => {
            if (event.matches) cancelManualScroll(true);
        });

        function ensureManualEffects() {
            if (manualCursor) return;
            manualCursor = document.createElement('div');
            manualCursor.className = 'model-manual-cursor';
            manualCursor.setAttribute('aria-hidden', 'true');
            manualCursor.innerHTML = '<svg viewBox="0 0 24 30" fill="currentColor"><path d="M2.2 1.6 20.4 17c.9.8.3 2.3-.9 2.3h-7l-3.7 7.8c-.5 1.1-2.1.9-2.4-.2L.4 3.2c-.4-1.4.8-2.5 1.8-1.6Z"/></svg>';
            document.body.appendChild(manualCursor);

            manualSpotlight = document.createElement('div');
            manualSpotlight.className = 'model-manual-spotlight';
            manualSpotlight.setAttribute('aria-hidden', 'true');
            document.body.appendChild(manualSpotlight);

            manualRipple = document.createElement('div');
            manualRipple.className = 'model-manual-ripple';
            manualRipple.setAttribute('aria-hidden', 'true');
            document.body.appendChild(manualRipple);
        }

        function clearManualTargets(hideCursor = true, preserveFocus = false) {
            cancelManualActivation();
            cancelManualScroll(false);
            manualTargetToken += 1;
            manualTargets.forEach(element => element.classList.remove('model-manual-pressed', 'model-manual-hover'));
            manualTargets = [];
            if (!preserveFocus) manualFocusPoint = null;
            if (hideCursor && manualCursor) manualCursor.classList.remove('is-visible');
            if (manualSpotlight) manualSpotlight.classList.remove('is-visible', 'is-pulsing');
            if (manualRipple) manualRipple.classList.remove('is-visible');
        }

        function highlightManualTargets(elements, pointElement, options = {}) {
            clearManualTargets(false, true);
            manualTargets = elements.filter(element => element instanceof HTMLElement);

            const target = pointElement instanceof HTMLElement
                ? pointElement
                : manualTargets[manualTargets.length - 1];
            if (!target) {
                if (manualCursor) manualCursor.classList.remove('is-visible');
                return false;
            }

            const token = manualTargetToken;
            const positionEffects = complete => {
                if (token !== manualTargetToken) return;
                const rect = target.getBoundingClientRect();
                ensureManualEffects();
                setManualScrollTracking(manualScrollTracking);
                const cursorX = Math.min(
                    window.innerWidth - 28,
                    Math.max(8, rect.left + Math.min(rect.width * (options.cursorX ?? 0.72), rect.width - 8))
                );
                const cursorY = Math.min(
                    window.innerHeight - 34,
                    Math.max(8, rect.top + Math.min(rect.height * (options.cursorY ?? 0.66), rect.height - 6))
                );
                if (options.updateFocus !== false) {
                    manualFocusPoint = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                }
                manualCursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0)`;
                manualCursor.classList.add('is-visible');

                if (options.ring !== false) {
                    const computedRadius = window.getComputedStyle(target).borderRadius || '10px';
                    manualSpotlight.style.left = `${Math.round(rect.left - 4)}px`;
                    manualSpotlight.style.top = `${Math.round(rect.top - 4)}px`;
                    manualSpotlight.style.width = `${Math.round(rect.width + 8)}px`;
                    manualSpotlight.style.height = `${Math.round(rect.height + 8)}px`;
                    manualSpotlight.style.borderRadius = computedRadius;
                    manualSpotlight.classList.add('is-visible');
                    if (complete) {
                        manualSpotlight.classList.remove('is-pulsing');
                        void manualSpotlight.offsetWidth;
                        manualSpotlight.classList.add('is-pulsing');
                    }
                }

                if (options.hover) target.classList.add('model-manual-hover');
                if (options.pressed && complete) {
                    target.classList.add('model-manual-pressed');
                    manualRipple.style.left = `${cursorX}px`;
                    manualRipple.style.top = `${cursorY}px`;
                    manualRipple.classList.remove('is-visible');
                    void manualRipple.offsetWidth;
                    manualRipple.classList.add('is-visible');
                    if (typeof options.onActivate === 'function') {
                        cancelManualActivation();
                        const activationToken = manualTargetToken;
                        manualActivationFrame = window.requestAnimationFrame(() => {
                            manualActivationFrame = null;
                            if (activationToken !== manualTargetToken) return;
                            options.onActivate();
                        });
                    }
                }
            };

            // Publish the next target before either document schedules its
            // animation frame. This keeps the parent camera from briefly
            // falling back to an unrelated position between cues.
            positionEffects(false);
            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (token !== manualTargetToken) return;
                if (options.scroll === false) {
                    positionEffects(true);
                    return;
                }
                scrollManualTargetIntoView(target, {
                    animate: options.animateScroll ?? manualAnimateScroll,
                    onComplete: () => positionEffects(true)
                });
            }));
            return true;
        }

        function setManualFilters(selections) {
            state.filters.forEach(category => {
                category.options.forEach(option => { option.isSelected = false; });
            });
            selections.forEach(({ categoryId, optionId }) => {
                const category = state.filters.find(item => item.id === categoryId);
                const option = category?.options.find(item => item.id === optionId);
                if (option) option.isSelected = true;
            });
            renderCatalog();
        }

        function manualFiltersMatch(count) {
            const expected = demoFilters.slice(0, count);
            const selected = state.filters.flatMap(category => category.options
                .filter(option => option.isSelected)
                .map(option => ({ categoryId: category.id, optionId: option.id })));
            return selected.length === expected.length && expected.every(filter => selected.some(item => (
                item.categoryId === filter.categoryId && item.optionId === filter.optionId
            )));
        }

        function findFilterButton(categoryId, optionId) {
            return Array.from(filterContainer.querySelectorAll('.filter-option')).find(button => (
                button.dataset.filterId === categoryId && button.dataset.optionId === optionId
            )) || null;
        }

        function selectManualFilter(categoryId, optionId) {
            toggleFilter(categoryId, optionId, true);
            const button = findFilterButton(categoryId, optionId);
            return highlightManualTargets(button ? [button] : [], button);
        }

        function selectManualOption(name, value, shouldHighlight = true) {
            const input = Array.from(modalBody.querySelectorAll(`input[name="${name}"]`))
                .find(element => element.value === value);
            if (!input) return false;
            input.click();
            if (shouldHighlight) {
                const target = input.closest('label') || input;
                highlightManualTargets([target], target);
            }
            return true;
        }

        function showManualProduct(productId = demoProductId) {
            const card = productContainer.querySelector(`[data-product-id="${productId}"]`);
            return highlightManualTargets(card ? [card] : [], card);
        }

        function openManualProduct(productId = demoProductId) {
            clearManualTargets();
            openOptionsModal(productId);
            modalBody.scrollTop = 0;
            return modalOverlay.style.display === 'flex';
        }

        function highlightManualDownloads(targetName = 'both') {
            const cadButton = document.getElementById('download-cad-btn');
            const componentsButton = document.getElementById('download-components-btn');
            const targets = targetName === 'cad'
                ? [cadButton]
                : targetName === 'pdf'
                    ? [componentsButton]
                    : [cadButton, componentsButton];
            const pointTarget = targetName === 'cad' ? cadButton : componentsButton;
            return highlightManualTargets(targets, pointTarget, { ring: false, hover: true, scroll: false });
        }

        function configureManualOptions(shouldHighlight = false) {
            demoOptions.forEach(([name, value]) => selectManualOption(name, value, shouldHighlight));
        }

        function prepareManualScene(scene) {
            clearManualTargets();
            closeOptionsModal();

            if (scene === 'filters') {
                setManualFilters([]);
                window.scrollTo({ top: 0, behavior: 'auto' });
                return true;
            }

            setManualFilters(demoFilters);

            if (scene === 'products') {
                return showManualProduct();
            }

            openManualProduct();
            if (scene === 'downloads') {
                configureManualOptions(false);
                return highlightManualDownloads('both');
            }
            return true;
        }

        function completeManualScene(scene) {
            prepareManualScene(scene);
            if (scene === 'filters') {
                setManualFilters(demoFilters);
                const reachButton = findFilterButton(demoFilters[2].categoryId, demoFilters[2].optionId);
                return highlightManualTargets(reachButton ? [reachButton] : [], reachButton);
            }
            if (scene === 'options') {
                configureManualOptions(false);
                const commInput = modalBody.querySelector('input[name="commSelection"][value="IRCB501-2PN-BD"]');
                const target = commInput?.closest('label') || commInput;
                return highlightManualTargets(target ? [target] : [], target);
            }
            return true;
        }

        function closeManualToast() {
            manualToast?.remove();
            manualToast = null;
        }

        function showManualToast(filename) {
            closeManualToast();
            manualToast = document.createElement('div');
            manualToast.className = 'model-manual-download-toast';
            manualToast.setAttribute('role', 'status');
            manualToast.innerHTML = `
                <span class="model-manual-toast-check" aria-hidden="true">✓</span>
                <span><strong>${uiText('다운로드 완료')}</strong><small></small></span>
            `;
            manualToast.querySelector('small').textContent = filename;
            document.body.appendChild(manualToast);
        }

        function closeManualPreview() {
            if (!manualPreview) return;
            manualPreview.element.remove();
            manualPreview = null;
        }

        function showManualPreview(progress = 0) {
            closeManualPreview();
            const item = collectCurrentCartItem();
            if (!item) return false;
            const report = createConfigurationReport([item]);
            const filename = getConfigurationWorkbookFilename([item]);
            const viewer = document.createElement('section');
            viewer.className = 'model-manual-document-viewer';
            viewer.innerHTML = `
                <header>
                    <span class="model-manual-document-icon model-manual-spreadsheet-icon" aria-hidden="true">XLSX</span>
                    <span><strong>${uiText('구성 내역 확인')}</strong><small></small></span>
                    <button type="button" tabindex="-1" aria-hidden="true">×</button>
                </header>
                <div class="model-manual-document-scroll"></div>
            `;
            viewer.querySelector('header small').textContent = filename;
            const scrollArea = viewer.querySelector('.model-manual-document-scroll');
            scrollArea.appendChild(renderConfigurationWorkbookPreview(report));
            document.body.appendChild(viewer);
            manualPreview = { element: viewer, scrollArea };
            manualFocusPoint = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            setManualPreviewScroll(progress);
            return true;
        }

        function setManualPreviewScroll(progress) {
            if (!manualPreview) return false;
            const normalized = Math.max(0, Math.min(1, Number(progress) || 0));
            const scrollArea = manualPreview.scrollArea;
            scrollArea.scrollTop = normalized * Math.max(0, scrollArea.scrollHeight - scrollArea.clientHeight);
            return true;
        }

        function resetManualDownloadButtons() {
            const cadButton = document.getElementById('download-cad-btn');
            const componentsButton = document.getElementById('download-components-btn');
            if (cadButton && currentActiveProduct) {
                const hasCad = Boolean(getCad3dPath(currentActiveProduct));
                cadButton.textContent = uiText(hasCad ? 'CAD 다운로드' : 'CAD 파일 없음');
                cadButton.disabled = !hasCad;
            }
            if (componentsButton) {
                componentsButton.textContent = uiText('구성 요소 엑셀 다운로드');
                componentsButton.disabled = false;
            }
        }

        function getManualOptionTarget(name, value) {
            const input = Array.from(modalBody.querySelectorAll(`input[name="${name}"]`))
                .find(element => element.value === value);
            return input?.closest('label') || input || null;
        }

        function prepareManualFilters(count) {
            manualConfiguredOptionCount = -1;
            closeManualPreview();
            closeManualToast();
            closeOptionsModal();
            if (!manualFiltersMatch(count)) setManualFilters(demoFilters.slice(0, count));
        }

        // The demo options already picked in the open window (by a guide clicking them, say).
        function countAppliedDemoOptions() {
            const applied = demoOptions.findIndex(([name, value]) => (
                modalBody.querySelector(`input[name="${name}"]:checked`)?.value !== value
            ));
            return applied < 0 ? demoOptions.length : applied;
        }

        function prepareManualConfiguredModal(optionCount = 0) {
            const previousScrollTop = modalOverlay.style.display === 'flex' ? modalBody.scrollTop : 0;
            const demoModalOpen = modalOverlay.style.display === 'flex'
                && currentActiveProduct?.id === demoProductId;
            // A window opened by clicking the card (not through this timeline) is reused as well, so
            // the picture does not close and rebuild under the next cue.
            if (demoModalOpen && manualConfiguredOptionCount < 0) {
                manualConfiguredOptionCount = Math.min(optionCount, countAppliedDemoOptions());
            }
            const canReuseModal = demoModalOpen
                && manualConfiguredOptionCount >= 0
                && optionCount >= manualConfiguredOptionCount;
            closeManualPreview();
            closeManualToast();
            if (!canReuseModal) {
                closeOptionsModal();
                setManualFilters(demoFilters);
                openOptionsModal(demoProductId);
            }
            const selectionStart = canReuseModal ? manualConfiguredOptionCount : 0;
            demoOptions.slice(selectionStart, optionCount).forEach(([name, value]) => {
                selectManualOption(name, value, false);
            });
            manualConfiguredOptionCount = optionCount;
            resetManualDownloadButtons();
            modalBody.scrollTop = Math.min(previousScrollTop, Math.max(0, modalBody.scrollHeight - modalBody.clientHeight));
        }

        function pointAtManualFilter(index, options = {}) {
            const filter = demoFilters[index];
            const button = findFilterButton(filter.categoryId, filter.optionId);
            return highlightManualTargets(button ? [button] : [], button, options);
        }

        function pointAtManualOption(index, options = {}) {
            const [name, value] = demoOptions[index];
            const target = getManualOptionTarget(name, value);
            return highlightManualTargets(target ? [target] : [], target, options);
        }

        function activateManualFilter(index) {
            setManualFilters(demoFilters.slice(0, index + 1));
        }

        function activateManualOption(index) {
            const [name, value] = demoOptions[index] || [];
            if (!name || !selectManualOption(name, value, false)) return;
            manualConfiguredOptionCount = Math.max(manualConfiguredOptionCount, index + 1);
        }

        function pointAtManualDownload(kind, options = {}) {
            const button = document.getElementById(kind === 'cad' ? 'download-cad-btn' : 'download-components-btn');
            return highlightManualTargets(button ? [button] : [], button, {
                ring: false,
                hover: true,
                pressed: Boolean(options.pressed),
                onActivate: options.onActivate,
                scroll: false,
                updateFocus: !options.keepFocus,
                cursorX: kind === 'cad' ? 0.68 : 0.72
            });
        }

        function renderManualTimelineCue(cue, options = {}) {
            if (!cue || (cue === manualCue && !options.force)) return true;
            manualCue = cue;
            manualAnimateScroll = Boolean(options.animateScroll) && !manualReducedMotion.matches;
            const keepCursorForScreenMove = cue === 'results'
                && manualAnimateScroll
                && manualCursor?.classList.contains('is-visible');
            clearManualTargets(!keepCursorForScreenMove, keepCursorForScreenMove);

            if (cue === 'reset') {
                prepareManualFilters(0);
                window.scrollTo({ top: 0, behavior: 'auto' });
            } else if (cue === 'filter_type' || cue === 'filter_payload' || cue === 'filter_reach') {
                const filterIndex = { filter_type: 0, filter_payload: 1, filter_reach: 2 }[cue];
                prepareManualFilters(filterIndex + 1);
                pointAtManualFilter(filterIndex);
            } else if (/^filter_(type|payload|reach)_(focus|press)$/.test(cue)) {
                const [, filterName, phase] = cue.match(/^filter_(type|payload|reach)_(focus|press)$/);
                const filterIndex = { type: 0, payload: 1, reach: 2 }[filterName];
                prepareManualFilters(filterIndex);
                pointAtManualFilter(filterIndex, {
                    scroll: phase === 'focus',
                    pressed: phase === 'press',
                    onActivate: phase === 'press' ? () => activateManualFilter(filterIndex) : null
                });
            } else if (cue === 'results') {
                prepareManualFilters(3);
                const resultsToken = manualTargetToken;
                const resultsRect = productContainer.getBoundingClientRect();
                manualFocusPoint = {
                    x: resultsRect.left + resultsRect.width / 2,
                    y: resultsRect.top + resultsRect.height / 2
                };
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    if (resultsToken !== manualTargetToken) return;
                    scrollManualTargetIntoView(productContainer, {
                        animate: manualAnimateScroll,
                        onUpdate: () => {
                            const rect = productContainer.getBoundingClientRect();
                            manualFocusPoint = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                        }
                    });
                }));
            } else if (cue === 'model_focus' || cue === 'model_press') {
                prepareManualFilters(3);
                const card = productContainer.querySelector(`[data-product-id="${demoProductId}"]`);
                highlightManualTargets(card ? [card] : [], card, {
                    scroll: cue === 'model_focus',
                    hover: true,
                    pressed: cue === 'model_press',
                    onActivate: cue === 'model_press'
                        ? () => {
                            openOptionsModal(demoProductId);
                            modalBody.scrollTop = 0;
                            manualConfiguredOptionCount = 0;
                        }
                        : null,
                    cursorX: 0.66,
                    cursorY: 0.62
                });
            } else if (cue === 'modal_open') {
                if (modalOverlay.style.display !== 'flex' || currentActiveProduct?.id !== demoProductId) {
                    prepareManualConfiguredModal(0);
                }
                modalOverlay.querySelector('.modal-content')?.classList.add('model-manual-enter');
                manualFocusPoint = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            } else if (cue === 'option_flex' || cue === 'option_pendant' || cue === 'option_comm') {
                const optionIndex = { option_flex: 0, option_pendant: 1, option_comm: 2 }[cue];
                prepareManualConfiguredModal(optionIndex + 1);
                pointAtManualOption(optionIndex);
            } else if (/^option_(flex|pendant|comm)_(focus|press)$/.test(cue)) {
                const [, optionName, phase] = cue.match(/^option_(flex|pendant|comm)_(focus|press)$/);
                const optionIndex = { flex: 0, pendant: 1, comm: 2 }[optionName];
                prepareManualConfiguredModal(optionIndex);
                pointAtManualOption(optionIndex, {
                    scroll: phase === 'focus',
                    pressed: phase === 'press',
                    onActivate: phase === 'press' ? () => activateManualOption(optionIndex) : null
                });
            } else if (cue === 'configured') {
                prepareManualConfiguredModal(4);
                const code = document.getElementById('dynamic-purchase-code');
                highlightManualTargets(code ? [code] : [], code, { cursorX: 0.9, cursorY: 0.5 });
            } else if (cue === 'cad_focus' || cue === 'cad_press' || cue === 'cad_done') {
                prepareManualConfiguredModal(4);
                const button = document.getElementById('download-cad-btn');
                pointAtManualDownload('cad', {
                    pressed: cue === 'cad_press',
                    onActivate: cue === 'cad_press' && button
                        ? () => { button.textContent = uiText('준비 중...'); }
                        : null,
                    keepFocus: cue === 'cad_done'
                });
                if (cue === 'cad_done') {
                    showManualToast(`Inovance_CAD_${demoProductId}.zip`);
                    manualFocusPoint = { x: window.innerWidth - 180, y: window.innerHeight - 78 };
                }
            } else if (cue === 'pdf_focus' || cue === 'pdf_press' || cue === 'pdf_done') {
                prepareManualConfiguredModal(4);
                const button = document.getElementById('download-components-btn');
                pointAtManualDownload('pdf', {
                    pressed: cue === 'pdf_press',
                    onActivate: cue === 'pdf_press' && button
                        ? () => { button.textContent = uiText('구성서 생성 중...'); }
                        : null,
                    keepFocus: cue === 'pdf_done'
                });
                if (cue === 'pdf_done') {
                    showManualToast(`Inovance_Config_${demoProductId}.xlsx`);
                    manualFocusPoint = { x: window.innerWidth - 180, y: window.innerHeight - 78 };
                }
            } else if (cue === 'preview') {
                prepareManualConfiguredModal(4);
                clearManualTargets();
                showManualPreview(0);
            }
            return true;
        }

        document.addEventListener('click', event => {
            if (event.target.closest('#download-cad-btn, #download-components-btn')) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, true);

        const manualApi = Object.freeze({
            renderTimelineCue: renderManualTimelineCue,
            setPreviewScroll: setManualPreviewScroll,
            resetTimeline: () => {
                manualCue = '';
                closeManualPreview();
                closeManualToast();
                clearManualTargets();
            },
            getFocusPoint: () => manualFocusPoint ? { ...manualFocusPoint } : null,
            prepareScene: prepareManualScene,
            completeScene: completeManualScene,
            selectFilter: selectManualFilter,
            showProduct: showManualProduct,
            openProduct: openManualProduct,
            selectOption: selectManualOption,
            highlightDownloads: highlightManualDownloads,
            clearHighlights: clearManualTargets,
            setPaused: paused => {
                manualPaused = Boolean(paused);
                document.documentElement.classList.toggle('model-manual-paused', manualPaused);
                const animation = manualScrollAnimation;
                if (!animation) return;
                if (manualPaused) {
                    if (animation.frame !== null) cancelAnimationFrame(animation.frame);
                    animation.frame = null;
                    animation.lastTimestamp = 0;
                } else if (animation.frame === null) {
                    animation.frame = requestAnimationFrame(animation.step);
                }
            },
            cancel: () => {
                manualCue = '';
                manualConfiguredOptionCount = -1;
                closeManualPreview();
                closeManualToast();
                clearManualTargets();
                closeOptionsModal();
                setManualFilters([]);
                window.scrollTo({ top: 0, behavior: 'auto' });
            },
            getState: () => ({
                cue: manualCue,
                modalOpen: modalOverlay.style.display === 'flex',
                productId: currentActiveProduct?.id || null,
                optionCount: manualConfiguredOptionCount,
                options: {
                    cableLength: modalBody.querySelector('input[name="cableLenSelection"]:checked')?.value || null,
                    cableType: modalBody.querySelector('input[name="cableTypeSelection"]:checked')?.value || null,
                    pendant: modalBody.querySelector('input[name="pendantConfig"]:checked')?.value || null,
                    communication: modalBody.querySelector('input[name="commSelection"]:checked')?.value || null
                },
                toast: manualToast?.querySelector('small')?.textContent || null,
                previewOpen: Boolean(manualPreview),
                previewScrollTop: manualPreview?.scrollArea.scrollTop || 0,
                pageScrollTop: window.scrollY || document.documentElement.scrollTop || 0,
                modalScrollTop: modalBody.scrollTop,
                scrollTracking: manualScrollTracking,
                cursorVisible: Boolean(manualCursor?.classList.contains('is-visible')),
                spotlightVisible: Boolean(manualSpotlight?.classList.contains('is-visible')),
                filters: state.filters.flatMap(category => category.options
                    .filter(option => option.isSelected)
                    .map(option => ({ categoryId: category.id, optionId: option.id })))
            })
        });

        window.InoRobotModelManual = manualApi;
        document.dispatchEvent(new CustomEvent('inorobot:model-manual-ready'));
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'inorobot:model-manual-ready' }, window.location.origin);
        }
    }

});
