const STANDARDIZATION_STORAGE_KEY = 'inorobot-simulation-position-standardization';
// These names match Generator.DataPoints in the project generator.
const STANDARD_POSITIONS = [[11, 'Work'], [10, 'Pre_work'], [1, 'Wait'], [0, 'Safe']];
const POINT_COLUMNS = [{ field: 'index', label: 'ID' }, { field: 'label', label: 'Name' }];
for (const [field, labels] of [['values', ['X', 'Y', 'Z', 'A', 'B', 'C']],
    ['armParameters', ['Arm 0', 'Arm 1', 'Arm 2', 'Arm 3']], ['externalAxes', ['E1', 'E2', 'E3', 'E4', 'E5', 'E6']]]) {
    labels.forEach((label, component) => POINT_COLUMNS.push({ field, component, label }));
}

function cellValue(record, column) {
    return column.field === 'index' ? record.index : column.field === 'label' ? record.label || '' : record[column.field][column.component];
}

export function nextPositionPointMetadata(records, standardized = true) {
    const used = new Set(records
        .filter(record => (record.symbol || record.sourceSymbol || 'P').toUpperCase() === 'P')
        .map(record => Number(record.index))
        .filter(index => Number.isInteger(index) && index >= 0 && index <= 9999));
    if (!standardized) {
        const index = Math.max(-1, ...used) + 1;
        if (index <= 9999) return { index, label: '' };
    } else {
        for (let process = 1; process <= 99; process++) {
            for (const [offset, name] of STANDARD_POSITIONS) {
                const index = process * 100 + offset;
                if (!used.has(index)) return { index, label: `P${process}_${name}` };
            }
        }
    }
    throw new RangeError('사용 가능한 포인트 번호가 없습니다.');
}

export function applyPositionPointCellEdit(record, field, component, text, records = []) {
    const updated = { ...record, values: [...record.values], armParameters: [...record.armParameters], externalAxes: [...record.externalAxes] };
    if (field === 'label') { updated.label = String(text).trim(); return updated; }
    const value = String(text).trim() === '' ? NaN : Number(text);
    if (field === 'index') {
        if (!Number.isInteger(value) || value < 0 || value > 9999) throw new Error('포인트 번호는 0부터 9999 사이의 정수여야 합니다.');
        const symbol = record.symbol || 'P';
        if (records.some(point => point.key !== record.key && (point.symbol || 'P') === symbol && point.index === value)) {
            throw new Error('이미 사용 중인 포인트 번호입니다.');
        }
        updated.index = value;
    } else {
        if (!['values', 'armParameters', 'externalAxes'].includes(field)
            || !Number.isInteger(component) || component < 0 || component >= updated[field].length
            || !Number.isFinite(value) || (field === 'armParameters' && !Number.isInteger(value))) {
            throw new Error('위치 값, Arm 파라미터 및 외부 축 값을 올바르게 입력하세요.');
        }
        updated[field][component] = value;
    }
    return updated;
}

export function buildPositionPointPaste(records, startKey, startColumn, text) {
    const row = records.findIndex(record => record.key === startKey);
    const matrix = String(text).replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(line => line.split('\t'));
    if (row < 0 || !Number.isInteger(startColumn) || startColumn < 0 || row + matrix.length > records.length
        || matrix.some(cells => startColumn + cells.length > POINT_COLUMNS.length)) {
        throw new Error('붙여넣을 범위가 위치 목록을 벗어납니다.');
    }
    const updates = matrix.map((cells, offset) => {
        let record = records[row + offset];
        cells.forEach((text, index) => {
            const column = POINT_COLUMNS[startColumn + index];
            record = applyPositionPointCellEdit(record, column.field, column.component, text);
        });
        return { sourceKey: records[row + offset].key, record };
    });
    const final = records.map(record => updates.find(update => update.sourceKey === record.key)?.record || record);
    const used = new Set();
    for (const record of final) {
        const key = `${record.symbol || 'P'}:${record.index}`;
        if (used.has(key)) throw new Error('이미 사용 중인 포인트 번호입니다.');
        used.add(key);
    }
    return updates;
}

// Keep edits inside the table; the update button separately captures the current pose.
export function createPositionPointsUi(panel, api) {
    const query = selector => panel.querySelector(selector);
    const robotSelect = query('[data-pts-robot]'), standardized = query('[data-pts-standardized]');
    const body = query('tbody'), scroll = query('.position-points-table-scroll'), error = query('[data-pts-error]');
    const columns = POINT_COLUMNS;
    let contextKey = null, selectedKey = null, activeCell = null, selectionAnchor = null, editing = null, exporting = false;
    let selectedRows = null, rowAnchorKey = null;
    try { standardized.checked = localStorage.getItem(STANDARDIZATION_STORAGE_KEY) !== 'false'; } catch { /* Default ON without storage. */ }
    function showError(message = '') { error.textContent = message; }
    function selectionBounds(records = api.records()) {
        const end = records.findIndex(record => record.key === activeCell?.key);
        const start = records.findIndex(record => record.key === selectionAnchor?.key);
        if (end < 0) return null;
        return { top: Math.min(start < 0 ? end : start, end), bottom: Math.max(start < 0 ? end : start, end),
            left: Math.min(selectionAnchor?.column ?? activeCell.column, activeCell.column),
            right: Math.max(selectionAnchor?.column ?? activeCell.column, activeCell.column) };
    }
    function syncSelection(records = api.records()) {
        const available = new Set(records.map(record => record.key));
        if (selectedRows) {
            selectedRows = new Set([...selectedRows].filter(key => available.has(key)));
            if (!available.has(activeCell?.key)) activeCell = null;
            selectedKey = selectedRows.size === 1 ? [...selectedRows][0] : selectedRows.has(activeCell?.key) ? activeCell.key : null;
        } else if (!available.has(selectedKey)) { selectedKey = null; activeCell = null; selectionAnchor = null; }
        else if (!activeCell || activeCell.key !== selectedKey) activeCell = { key: selectedKey, column: 0 };
        const single = selectedRows ? selectedRows.size === 1 : Boolean(selectedKey);
        const bounds = selectionBounds(records);
        for (const row of body.children) {
            const chosen = selectedRows ? selectedRows.has(row.dataset.ptsRow) : row.dataset.ptsRow === selectedKey;
            row.classList.toggle('selected', chosen); row.setAttribute('aria-selected', String(chosen));
            const rowIndex = records.findIndex(record => record.key === row.dataset.ptsRow);
            for (const cell of row.children) {
                const column = Number(cell.dataset.ptsColumn), active = row.dataset.ptsRow === activeCell?.key && column === activeCell.column;
                const included = selectedRows ? chosen : Boolean(bounds && rowIndex >= bounds.top && rowIndex <= bounds.bottom && column >= bounds.left && column <= bounds.right);
                cell.classList.toggle('active-cell', active); cell.tabIndex = active ? 0 : -1;
                cell.classList.toggle('cell-selected', included); cell.setAttribute('aria-selected', String(included));
            }
        }
        const locked = api.locked() || !api.robotId();
        standardized.disabled = locked;
        query('[data-pts-new]').disabled = locked;
        query('[data-pts-update]').disabled = locked || !single;
        query('[data-pts-move]').disabled = locked || !single;
        query('[data-pts-export]').disabled = locked || exporting || !records.length;
    }
    function focusCell(target, reveal = true, extend = false, keepRows = false) {
        if (!target) return;
        const row = [...body.children].find(row => row.dataset.ptsRow === target.key);
        const cell = row?.children[target.column];
        if (!cell) return;
        if (!keepRows) { selectedRows = null; rowAnchorKey = target.key; }
        if (!extend || !selectionAnchor) selectionAnchor = { ...target };
        selectedKey = target.key; activeCell = { ...target }; syncSelection();
        cell.focus({ preventScroll: true });
        if (reveal) cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    function navigation(event, origin = activeCell) {
        const rows = [...body.children];
        let row = rows.findIndex(row => row.dataset.ptsRow === origin?.key), column = origin?.column || 0;
        if (row < 0) return null;
        const control = event.ctrlKey || event.metaKey;
        if (event.key === 'Tab') {
            const next = row * columns.length + column + (event.shiftKey ? -1 : 1);
            if (next < 0 || next >= rows.length * columns.length) return null;
            row = Math.floor(next / columns.length); column = next % columns.length;
        } else if (event.key === 'Enter') row += event.shiftKey ? -1 : 1;
        else if (event.key === 'ArrowLeft') column = control ? 0 : column - 1;
        else if (event.key === 'ArrowRight') column = control ? columns.length - 1 : column + 1;
        else if (event.key === 'ArrowUp') row = control ? 0 : row - 1;
        else if (event.key === 'ArrowDown') row = control ? rows.length - 1 : row + 1;
        else if (event.key === 'Home') { column = 0; if (control) row = 0; }
        else if (event.key === 'End') { column = columns.length - 1; if (control) row = rows.length - 1; }
        else if (event.key === 'PageUp' || event.key === 'PageDown') {
            row += (event.key === 'PageUp' ? -1 : 1) * Math.max(1, Math.floor(scroll.clientHeight / (rows[0].offsetHeight || 34)));
        } else return null;
        row = Math.max(0, Math.min(rows.length - 1, row));
        column = Math.max(0, Math.min(columns.length - 1, column));
        return { key: rows[row].dataset.ptsRow, column };
    }
    function cancelEdit() {
        const current = editing; editing = null;
        if (current?.input.isConnected) current.cell.textContent = current.display;
    }
    function finishEdit({ cancel = false, navigate = null, focus = false } = {}) {
        if (!editing) return true;
        const current = editing, selection = selectedKey, wantedActive = activeCell && { ...activeCell };
        const value = current.input.value;
        cancelEdit();
        if (current.robotId !== api.robotId() || current.context !== contextKey || api.locked()) { refresh(); return false; }
        let key = current.key;
        try {
            if (!cancel && value !== current.original) {
                const records = api.records(), record = records.find(point => point.key === current.key);
                if (!record) throw new Error(api.text('수정할 위치 포인트를 찾을 수 없습니다.'));
                const column = columns[current.column];
                key = api.save(applyPositionPointCellEdit(record, column.field, column.component, value, records), current.key);
            }
            selectedKey = selection === current.key ? key : selection;
            activeCell = wantedActive?.key === current.key ? { ...wantedActive, key } : wantedActive;
            if (selectionAnchor?.key === current.key) selectionAnchor = { ...selectionAnchor, key };
            showError(); refresh();
            const origin = { key, column: current.column };
            if (focus) focusCell(navigate ? navigation(navigate, origin) || origin : origin);
            else if (wantedActive && (wantedActive.key !== current.key || wantedActive.column !== current.column)) focusCell(wantedActive, true, true, true);
            return true;
        } catch (exception) {
            showError(api.text(exception.message)); refresh();
            if (focus) focusCell({ key: current.key, column: current.column });
            return false;
        }
    }
    function beginEdit(cell, key, columnIndex, options = {}) {
        if (api.locked() || editing?.cell === cell) return;
        if (!finishEdit()) return;
        const record = api.records().find(point => point.key === key), column = columns[columnIndex];
        if (!record || !cell.isConnected || !column) return;
        selectedRows = null; rowAnchorKey = key;
        selectedKey = key; activeCell = { key, column: columnIndex }; selectionAnchor = { ...activeCell }; showError(); syncSelection();
        const value = column.field === 'index' ? record.index : column.field === 'label'
            ? record.label || '' : record[column.field][column.component];
        const doc = panel.ownerDocument, input = doc.createElement('input');
        input.type = 'text'; input.dataset.ptsCellEditor = ''; input.className = 'position-points-cell-editor';
        input.setAttribute('aria-label', api.text(column.label));
        if (column.field === 'label') input.maxLength = 80;
        else input.inputMode = column.field === 'index' || column.field === 'armParameters' ? 'numeric' : 'decimal';
        input.value = options.replace ? options.value || '' : String(value);
        const original = String(value);
        editing = { cell, input, key, column: columnIndex, original, display: cell.textContent,
            mode: options.mode || 'edit', robotId: api.robotId(), context: contextKey };
        if (column.field === 'index') {
            const wrapper = doc.createElement('span'); wrapper.className = 'position-points-index-editor';
            const prefix = doc.createElement('span'), suffix = doc.createElement('span');
            prefix.className = 'position-points-index-prefix'; prefix.textContent = `${(record.symbol || 'P').toUpperCase()}[`;
            suffix.className = 'position-points-index-suffix'; suffix.textContent = ']';
            input.maxLength = 4; input.pattern = '[0-9]*';
            input.style.width = `${Math.max(32, cell.clientWidth - 16 - prefix.textContent.length * 7 - 7)}px`;
            const accepts = text => /^\d{0,4}$/.test(input.value.slice(0, input.selectionStart) + text + input.value.slice(input.selectionEnd));
            input.addEventListener('beforeinput', event => {
                if (event.data != null && event.inputType.startsWith('insert') && !accepts(event.data)) event.preventDefault();
            });
            input.addEventListener('paste', event => { if (!accepts(event.clipboardData?.getData('text') || '')) event.preventDefault(); });
            input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); });
            wrapper.append(prefix, input, suffix); cell.replaceChildren(wrapper);
        } else {
            input.style.width = `${Math.max(52, cell.clientWidth - 16)}px`;
            cell.replaceChildren(input);
        }
        input.addEventListener('pointerdown', event => event.stopPropagation());
        input.addEventListener('click', event => event.stopPropagation());
        input.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.isComposing) return;
            if (event.key === 'Escape') { event.preventDefault(); finishEdit({ cancel: true, focus: true }); }
            else if (event.key === 'Enter' || event.key === 'Tab' || (editing?.mode === 'entry' && event.key.startsWith('Arrow'))) {
                event.preventDefault(); finishEdit({ navigate: event, focus: true });
            } else if (event.key === 'F2') {
                event.preventDefault(); if (editing) editing.mode = editing.mode === 'edit' ? 'entry' : 'edit';
            }
        });
        input.addEventListener('blur', () => { if (editing?.input === input) finishEdit(); });
        input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    }
    function refresh() {
        const doc = panel.ownerDocument, restoreFocus = !editing && body.contains(doc.activeElement);
        const robots = api.robots(), robotId = api.robotId(), key = `${robotId}:${api.contextKey()}`;
        if (contextKey !== key) {
            cancelEdit(); contextKey = key; selectedKey = null; activeCell = null; selectionAnchor = null;
            selectedRows = null; rowAnchorKey = null; showError();
        }
        robotSelect.replaceChildren(...robots.map(robot => {
            const option = doc.createElement('option'); option.value = robot.id; option.textContent = robot.name; return option;
        }));
        robotSelect.value = robotId; robotSelect.title = robots.find(robot => robot.id === robotId)?.name || '';
        const records = api.records();
        if (editing && (api.locked() || !records.some(record => record.key === editing.key))) cancelEdit();
        if (!editing) {
            const scrollTop = scroll.scrollTop, scrollLeft = scroll.scrollLeft;
            body.replaceChildren();
            for (const record of records) {
                const row = doc.createElement('tr'); row.dataset.ptsRow = record.key;
                columns.forEach((column, columnIndex) => {
                    const cell = doc.createElement('td'); cell.setAttribute('role', 'gridcell');
                    cell.dataset.ptsColumn = columnIndex; cell.dataset.ptsEditField = column.field;
                    if (column.component != null) cell.dataset.ptsEditIndex = column.component;
                    cell.textContent = column.field === 'index' ? `${(record.symbol || 'P').toUpperCase()}[${record.index}]`
                        : column.field === 'label' ? record.label || '' : column.field === 'armParameters'
                            ? String(record[column.field][column.component]) : Number(record[column.field][column.component]).toFixed(3);
                    const choose = () => { selectedKey = record.key; activeCell = { key: record.key, column: columnIndex }; syncSelection(); };
                    cell.addEventListener('focus', choose);
                    cell.addEventListener('dblclick', event => {
                        if (event.target.closest('[data-pts-cell-editor]')) return;
                        event.stopPropagation(); beginEdit(cell, record.key, columnIndex);
                    });
                    cell.addEventListener('keydown', event => {
                        if (event.target !== cell) return;
                        const target = navigation(event, { key: record.key, column: columnIndex });
                        if (target) { event.preventDefault(); event.stopPropagation(); focusCell(target, true, event.shiftKey && event.key !== 'Tab' && event.key !== 'Enter'); return; }
                        if (event.ctrlKey || event.metaKey || event.altKey || event.key === 'Tab') return;
                        if (event.key === 'F2') { event.preventDefault(); event.stopPropagation(); beginEdit(cell, record.key, columnIndex); }
                        else if (event.key === 'Backspace' || event.key === 'Delete' || event.key.length === 1 || event.key === 'Process') {
                            const value = event.key.length === 1 ? event.key : '';
                            if (column.field === 'index' && value && !/^\d$/.test(value)) { event.preventDefault(); return; }
                            if (event.key !== 'Process') event.preventDefault();
                            event.stopPropagation(); beginEdit(cell, record.key, columnIndex, { replace: true, value, mode: 'entry' });
                        }
                    });
                    row.append(cell);
                });
                const select = event => {
                    if ((event.type === 'pointerdown' && event.button !== 0) || event.target.closest('[data-pts-cell-editor]')) return;
                    const cell = event.target.closest('[data-pts-column]');
                    const target = { key: record.key, column: cell ? Number(cell.dataset.ptsColumn) : 0 };
                    const control = event.ctrlKey || event.metaKey;
                    if (event.shiftKey || control) {
                        const previous = selectedRows || new Set(selectedKey ? [selectedKey] : []);
                        if (event.shiftKey) {
                            const keys = api.records().map(record => record.key), end = keys.indexOf(record.key);
                            const start = Math.max(0, keys.indexOf(rowAnchorKey || activeCell?.key || record.key));
                            selectedRows = control ? new Set(previous) : new Set();
                            keys.slice(Math.min(start, end), Math.max(start, end) + 1).forEach(key => selectedRows.add(key));
                        } else {
                            selectedRows = new Set(previous);
                            if (selectedRows.has(record.key)) selectedRows.delete(record.key); else selectedRows.add(record.key);
                            rowAnchorKey = record.key;
                        }
                    } else { selectedRows = null; rowAnchorKey = record.key; }
                    selectedKey = record.key; activeCell = target; selectionAnchor = { ...target };
                    showError(); syncSelection();
                    if (event.shiftKey || control) { event.preventDefault(); cell?.focus({ preventScroll: true }); }
                };
                row.addEventListener('pointerdown', select);
                row.addEventListener('click', event => { if (event.detail === 0) select(event); });
                body.append(row);
            }
            scroll.scrollTop = scrollTop; scroll.scrollLeft = scrollLeft;
        }
        syncSelection(records); query('[data-pts-empty]').hidden = records.length > 0;
        query('[data-pts-count]').textContent = String(records.length);
        if (restoreFocus && activeCell) focusCell(activeCell, false, true, true);
    }
    function isTextTarget(target) { return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')); }
    function handleKeyDown(event) {
        if (event.defaultPrevented) return panel.contains(event.target);
        if (panel.classList.contains('panel-user-hidden') || !panel.isConnected || event.isComposing || isTextTarget(event.target)
            || event.target?.ownerDocument !== panel.ownerDocument || (!panel.contains(event.target) && !api.active())) return false;
        const key = String(event.key).toLowerCase(), control = event.ctrlKey || event.metaKey;
        if (control && !event.altKey && (key === 'z' || key === 'y')) {
            event.preventDefault(); event.stopPropagation();
            if (api.locked()) return true;
            const row = api.records().findIndex(record => record.key === activeCell?.key), column = activeCell?.column || 0;
            api.history(key === 'y' || event.shiftKey); refresh();
            const records = api.records(), record = records.find(record => record.key === selectedKey) || records[Math.max(0, Math.min(row, records.length - 1))];
            if (record) focusCell({ key: record.key, column }, true, true, true);
            else panel.focus();
            return true;
        }
        if (control && !event.altKey && key === 'a' && body.contains(event.target)) {
            event.preventDefault(); event.stopPropagation();
            const records = api.records();
            if (records.length) { selectedRows = null; selectionAnchor = { key: records[0].key, column: 0 }; focusCell({ key: records.at(-1).key, column: columns.length - 1 }, true, true); }
            return true;
        }
        if (control || event.altKey) return false;
        const action = { KeyA: 'new', KeyU: 'update', KeyM: 'move' }[event.code] || { a: 'new', u: 'update', m: 'move' }[key];
        if (!action) return false;
        event.preventDefault(); event.stopPropagation();
        const button = query(`[data-pts-${action}]`);
        if (!event.repeat && !button.disabled) {
            button.click(); if (activeCell) focusCell({ key: selectedKey || activeCell.key, column: activeCell.column }, true, true, true);
        }
        return true;
    }
    panel.tabIndex = -1;
    panel.addEventListener('keydown', handleKeyDown, true);
    panel.addEventListener('copy', event => {
        if (isTextTarget(event.target) || !event.clipboardData) return;
        const records = api.records(), bounds = selectionBounds(records);
        if (!bounds || (selectedRows && !selectedRows.size)) return;
        const copiedRecords = selectedRows ? records.filter(record => selectedRows.has(record.key)) : records.slice(bounds.top, bounds.bottom + 1);
        const copiedColumns = selectedRows ? columns : columns.slice(bounds.left, bounds.right + 1);
        const text = copiedRecords.map(record => copiedColumns
            .map(column => String(cellValue(record, column))).join('\t')).join('\r\n');
        event.preventDefault(); event.stopPropagation(); event.clipboardData.setData('text/plain', text);
    });
    panel.addEventListener('paste', event => {
        if (isTextTarget(event.target) || !event.clipboardData) return;
        event.preventDefault(); event.stopPropagation();
        if (api.locked()) return;
        const records = api.records(), bounds = selectionBounds(records);
        if (!bounds || (selectedRows && !selectedRows.size)) return;
        try {
            let text = event.clipboardData.getData('text/plain');
            const single = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
            let updates, pasteColumn = bounds.left;
            const rowMode = Boolean(selectedRows);
            if (rowMode) {
                const targets = records.filter(record => selectedRows.has(record.key)), lines = single.split('\n');
                if (lines.length !== 1 && lines.length !== targets.length) throw new Error(api.text('붙여넣을 범위가 위치 목록을 벗어납니다.'));
                pasteColumn = lines[0].split('\t').length === columns.length ? 0 : activeCell.column;
                updates = targets.map((record, index) => buildPositionPointPaste([record], record.key, pasteColumn, lines.length === 1 ? lines[0] : lines[index])[0]);
            } else {
                if (!/[\t\n]/.test(single) && (bounds.top !== bounds.bottom || bounds.left !== bounds.right)) {
                    text = Array.from({ length: bounds.bottom - bounds.top + 1 }, () => Array(bounds.right - bounds.left + 1).fill(single).join('\t')).join('\n');
                }
                updates = buildPositionPointPaste(records, records[bounds.top].key, bounds.left, text);
            }
            const keys = api.saveBatch(updates);
            if (rowMode) selectedRows = new Set(keys);
            showError(); refresh(); focusCell({ key: keys[0], column: pasteColumn }, true, false, rowMode);
        } catch (exception) { showError(api.text(exception.message)); refresh(); }
    });
    robotSelect.addEventListener('change', () => { cancelEdit(); api.selectRobot(robotSelect.value); refresh(); });
    query('[data-pts-move]').addEventListener('click', () => {
        if (!finishEdit() || api.locked() || !selectedKey) return;
        try { showError(); api.move(selectedKey); } catch (exception) { showError(exception.message); }
        refresh();
    });
    query('[data-pts-export]').addEventListener('click', async (event) => {
        if (!finishEdit() || api.locked() || exporting) return;
        exporting = true; syncSelection();
        try { showError(); await api.exportPoints(event); } catch (exception) { showError(exception.message); }
        finally { exporting = false; refresh(); }
    });
    standardized.addEventListener('change', () => {
        try { localStorage.setItem(STANDARDIZATION_STORAGE_KEY, String(standardized.checked)); } catch { /* Keep working without storage. */ }
    });
    query('[data-pts-new]').addEventListener('click', () => {
        if (!finishEdit() || api.locked()) return;
        try {
            const record = api.capture(), metadata = nextPositionPointMetadata(api.records(), standardized.checked);
            selectedKey = api.save({ ...record, ...metadata }, null); activeCell = { key: selectedKey, column: 0 };
            selectedRows = null; rowAnchorKey = selectedKey;
            selectionAnchor = { ...activeCell };
            showError(); refresh();
        } catch (exception) { showError(api.text(exception.message)); }
    });
    query('[data-pts-update]').addEventListener('click', () => {
        if (!finishEdit() || api.locked() || !selectedKey) return;
        try {
            const selected = api.records().find(record => record.key === selectedKey);
            if (!selected) throw new Error(api.text('수정할 위치 포인트를 찾을 수 없습니다.'));
            const current = api.capture();
            selectedKey = api.save({ ...selected, values: current.values, armParameters: current.armParameters, externalAxes: current.externalAxes }, selectedKey);
            showError(); refresh();
        } catch (exception) { showError(api.text(exception.message)); }
    });
    return { refresh, handleKeyDown };
}
