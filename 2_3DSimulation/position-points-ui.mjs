import { syncSettingsOptions } from './settings-controls.mjs';
import { nextPositionPointMetadata, applyPositionPointCellEdit, pastePoints, navigatePositionTable, positionSelection } from './wasm/positions.mjs';

const STANDARDIZATION_STORAGE_KEY = 'inorobot-simulation-position-standardization';
const POINT_COLUMNS = [{ field: 'index', label: 'ID' }, { field: 'label', label: 'Name' }];
for (const [field, labels] of [['values', ['X', 'Y', 'Z', 'A', 'B', 'C']],
    ['armParameters', ['Arm 0', 'Arm 1', 'Arm 2', 'Arm 3']], ['externalAxes', ['E1', 'E2', 'E3', 'E4', 'E5', 'E6']]]) {
    labels.forEach((label, component) => POINT_COLUMNS.push({ field, component, label }));
}

function cellValue(record, column) {
    return column.field === 'index' ? record.index : column.field === 'label' ? record.label || '' : record[column.field][column.component];
}

export { nextPositionPointMetadata, applyPositionPointCellEdit };

export function buildPositionPointPaste(records, startKey, startColumn, text) {
    return pastePoints(records, startKey, startColumn, text, POINT_COLUMNS);
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
        return positionSelection(end, activeCell?.column ?? 0, start, selectionAnchor?.column ?? activeCell?.column ?? 0);
    }
    function selectedRecords(records = api.records()) {
        if (selectedRows) return records.filter(record => selectedRows.has(record.key));
        const bounds = selectionBounds(records);
        return bounds ? records.slice(bounds.top, bounds.bottom + 1) : [];
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
        query('[data-pts-delete]').disabled = locked || !selectedRecords(records).length;
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
        const row = rows.findIndex(row => row.dataset.ptsRow === origin?.key);
        return navigatePositionTable(row, origin?.column || 0, rows, columns.length, event, scroll.clientHeight);
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
    function refreshRobots(robots = api.robots(), robotId = api.robotId()) {
        syncSettingsOptions(robotSelect, robots.map(robot => ({ value: robot.id, label: robot.name })), robotId);
        if (!robotId) robotSelect.value = '';
        robotSelect.title = robots.find(robot => robot.id === robotId)?.name || '';
    }
    function refreshScene() {
        if (contextKey !== `${api.robotId()}:${api.contextKey()}`) refresh();
        else refreshRobots();
    }
    function refresh() {
        const doc = panel.ownerDocument, restoreFocus = !editing && body.contains(doc.activeElement);
        const robots = api.robots(), robotId = api.robotId(), key = `${robotId}:${api.contextKey()}`;
        if (contextKey !== key) {
            cancelEdit(); contextKey = key; selectedKey = null; activeCell = null; selectionAnchor = null;
            selectedRows = null; rowAnchorKey = null; showError();
        }
        refreshRobots(robots, robotId);
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
                        else if (event.key === 'Backspace' || event.key.length === 1 || event.key === 'Process') {
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
        const action = { KeyA: 'new', KeyU: 'update', KeyM: 'move', Delete: 'delete' }[event.code]
            || { a: 'new', u: 'update', m: 'move', delete: 'delete' }[key];
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
    query('[data-pts-delete]').addEventListener('click', () => {
        if (!finishEdit() || api.locked()) return;
        const records = api.records(), targets = selectedRecords(records);
        if (!targets.length) return;
        const row = records.findIndex(record => record.key === targets[0].key), column = activeCell?.column || 0;
        try {
            api.remove(targets.map(record => record.key));
            selectedRows = null; selectedKey = null; activeCell = null; selectionAnchor = null; rowAnchorKey = null;
            showError(); refresh();
            const remaining = api.records(), next = remaining[Math.min(row, remaining.length - 1)];
            if (next) focusCell({ key: next.key, column });
            else panel.focus();
        } catch (exception) { showError(api.text(exception.message)); refresh(); }
    });
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
    return { refresh, refreshScene, handleKeyDown };
}
