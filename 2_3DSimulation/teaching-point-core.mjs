export const teachingPointKey = (robotId, source, id, symbol = '', index = '') =>
    JSON.stringify([robotId, source, id, symbol, index]);

export function validTeachingVector(value, length) {
    return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

export function collectTeachingPoints(robotId, steps, pointFile = null) {
    const points = [], rejected = [];
    const records = pointFile ? pointFile.records || [] : steps || [];
    for (const record of records) {
        if (!pointFile && !['MOVJ', 'MOVL'].includes(record.motion)) continue;
        const joint = pointFile?.kind === 'jointPoint';
        const valid = pointFile
            ? Array.isArray(record.values) && record.values.length >= (joint ? 1 : 6)
                && record.values.every(Number.isFinite)
            : validTeachingVector(record.tcp?.position, 3)
                && validTeachingVector(record.tcp?.quaternion, 4)
                && Math.hypot(...record.tcp.quaternion) > 1e-8;
        const symbol = record.sourceSymbol || (joint ? 'JP' : 'P');
        const name = pointFile ? `${symbol}[${record.index}]` : `P[${record.pointIndex}]`;
        if (!valid) { rejected.push(name); continue; }
        const rawLabel = String(pointFile ? record.name || '' : record.label || '').trim();
        const label = pointFile && rawLabel.replace(/[\s\[\]]/g, '').toUpperCase() === `${symbol}${record.index}`.toUpperCase()
            ? '' : rawLabel;
        points.push({
            key: teachingPointKey(robotId, pointFile ? 'olp' : 'motion', pointFile?.path || record.id,
                pointFile ? symbol : '', pointFile ? record.index : ''),
            name, label,
            source: pointFile?.path || 'motion', joint, record
        });
    }
    return { points, rejected };
}

export function formatTeachingPointLabel(point, mode = 'id') {
    if (mode === 'label') return point.label || '';
    return mode === 'both' && point.label ? `${point.name} · ${point.label}` : point.name;
}

export function normalizeTeachingPointSettings(value) {
    return { enabled: value?.enabled !== false, labels: value?.labels !== false, xray: value?.xray !== false,
        labelMode: ['id', 'label', 'both'].includes(value?.labelMode) ? value.labelMode : 'id' };
}
