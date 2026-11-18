import { engine, numbers } from './engine.mjs';

const encoder = new TextEncoder(), decoder = new TextDecoder();
function request(operation, input) {
    const bytes = encoder.encode(JSON.stringify(input));
    const address = engine.positions_data(bytes.length);
    new Uint8Array(engine.memory.buffer, address, bytes.length).set(bytes);
    const length = engine.positions_request(operation);
    const output = engine.positions_data(length);
    const { error, value } = JSON.parse(decoder.decode(new Uint8Array(engine.memory.buffer, output, length)));
    if (error) throw operation === 0 ? new RangeError(error) : new Error(error);
    return value;
}

function rowInfo(record) {
    return [record.key, record.symbol || 'P', record.index, record.values?.length,
        record.armParameters?.length, record.externalAxes?.length];
}
function copyRecord(record) {
    return { ...record, values: [...record.values], armParameters: [...record.armParameters], externalAxes: [...record.externalAxes] };
}
function write(record, field, component, value) {
    if (field === 'label' || field === 'index') record[field] = value;
    else record[field][component] = value;
}
export function nextPositionPointMetadata(records, standardized = true) {
    const used = records.filter(record => (record.symbol || record.sourceSymbol || 'P').toUpperCase() === 'P')
        .map(record => Number(record.index));
    return request(0, { used, standard: Boolean(standardized) });
}
export function applyPositionPointCellEdit(record, field, component, text, records = []) {
    const result = copyRecord(record);
    const value = request(1, { row: rowInfo(record), field, component, text: String(text),
        others: field === 'index' ? records.map(rowInfo) : [] });
    write(result, field, component, value);
    return result;
}
export function pastePoints(records, key, column, text, columns) {
    const edits = request(2, { rows: records.map(rowInfo), key, column, text: String(text) });
    return edits.map(([row, values]) => {
        const record = copyRecord(records[row]);
        values.forEach((value, offset) => {
            const cell = columns[column + offset];
            write(record, cell.field, cell.component, value);
        });
        return { sourceKey: records[row].key, record };
    });
}
const keys = ['Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
export function navigatePositionTable(row, col, rows, columns, event, viewportHeight) {
    const key = keys.indexOf(event.key);
    const page = key >= 8 ? Math.floor(viewportHeight / (rows[0]?.offsetHeight || 34)) : 1;
    const next = engine.position_navigate(row, col, rows.length, columns, key, event.shiftKey, event.ctrlKey || event.metaKey, page);
    return next < 0 ? null : { key: rows[Math.floor(next / columns)].dataset.ptsRow, column: next % columns };
}
export function positionSelection(row, column, anchorRow, anchorColumn) {
    if (row < 0) return null;
    numbers(4);
    engine.position_selection(row, column, anchorRow, anchorColumn);
    const [top, bottom, left, right] = numbers(4);
    return { top, bottom, left, right };
}
