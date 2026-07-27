const TEXT_EXTENSIONS = new Set(['.pro', '.prj', '.pts', '.jsn', '.dat', '.cfg', '.txt', '.csv']);
const WORD_START = 32;
const BIT_START = 512;

export const OLP_PROJECT_SCHEMA_VERSION = 1;

export function normalizeOlpPath(value) {
    const parts = String(value || '')
        .replaceAll('\\', '/')
        .replace(/^\.\//, '')
        .split('/')
        .filter((part) => part && part !== '.');
    if (parts.some((part) => part === '..')) throw new Error(`Parent traversal is not allowed in OLP path: ${value}`);
    return parts.join('/');
}

function fileName(path) {
    return normalizeOlpPath(path).split('/').at(-1) || '';
}

function withoutSelectedFolderRoot(paths) {
    const firstParts = paths.map((path) => path.split('/')[0]).filter(Boolean);
    if (!firstParts.length || !firstParts.every((part) => part === firstParts[0])) return paths;
    return paths.map((path) => path.split('/').slice(1).join('/') || fileName(path));
}

function isTextPath(path) {
    const lower = path.toLowerCase();
    return [...TEXT_EXTENSIONS].some((extension) => lower.endsWith(extension));
}

// InoRobot project files are consumed by Windows robot software.  Keep the
// in-browser editor/runtime newline normalization independent from the file
// format used when a project is written back to disk.
export function normalizeOlpTextForWindows(text) {
    return String(text ?? '')
        .replace(/^\uFEFF/, '')
        .replace(/\r?\n/g, '\r\n');
}

function parseJsonText(text, fallback = null) {
    try {
        const normalized = String(text ?? '').replace(/^\uFEFF/, '');
        return JSON.parse(normalized);
    } catch { return fallback; }
}

function stripQuoted(value) {
    return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}

function parseNumericList(value) {
    return (String(value || '').match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [])
        .map(Number)
        .filter(Number.isFinite);
}

function parsePointsFile(path, text, kind) {
    const records = [];
    let sequentialIndex = 0;
    String(text || '').split(/\r?\n/).forEach((line) => {
        // JP.pts is the only joint-point file.  Every other .pts file is a
        // Cartesian point file, but it can contain both P[] and LP[] symbols.
        // Keep the source symbol so an OLP program using LP[n] resolves the
        // intended record instead of accidentally selecting P[n].
        const match = line.match(/\b(JP|LP|P)\s*\[\s*(\d+)\s*\]\s*=\s*([^;]+)/i);
        if (!match) return;
        const sourceSymbol = match[1].toUpperCase();
        const values = parseNumericList(match[3]);
        if (!values.length) return;
        const segments = String(line).split(';');
        const armParameters = parseNumericList(segments[1] || '').slice(0, 4);
        const externalAxes = parseNumericList(segments[2] || '').slice(0, 6);
        const nameMatch = line.match(/\bName\s*=\s*([^;]+)/i);
        const notesMatch = line.match(/\bNotes\s*=\s*([^;]+)/i);
        const index = Number(match[2]);
        const name = nameMatch
            ? stripQuoted(nameMatch[1])
            : notesMatch
                ? stripQuoted(notesMatch[1])
                : `${sourceSymbol}${index}`;
        records.push({
            kind,
            sourceSymbol,
            index: Number.isInteger(index) ? index : sequentialIndex,
            name,
            values: kind === 'jointPoint' ? values.slice(0, 16) : values.slice(0, 6),
            armParameters: kind === 'point' ? armParameters : [],
            externalAxes: kind === 'point' ? externalAxes : [],
            path,
            notes: notesMatch ? stripQuoted(notesMatch[1]) : '',
            sourceLine: line
        });
        sequentialIndex += 1;
    });
    return records;
}

function parseLabels(value) {
    const labels = {};
    const groups = [
        ['InputBitLabels', 'In'],
        ['InputWordLabels', 'InW'],
        ['OutputBitLabels', 'Out'],
        ['OutputWordLabels', 'OutW']
    ];
    groups.forEach(([key, prefix]) => {
        const entries = value?.[key]?.LabelsArray;
        if (!Array.isArray(entries)) return;
        entries.forEach((entry) => {
            const label = String(entry?.sLabel || '').trim();
            const index = Number(entry?.nIndex);
            if (label && Number.isFinite(index)) labels[label] = `${prefix}[${index}]`;
        });
    });
    return labels;
}

function parseRemoteIoMappingText(text) {
    const normalized = String(text ?? '').replace(/^\uFEFF/, '');
    const jsonStart = normalized.indexOf('{');
    if (jsonStart < 0) return [];
    const value = parseJsonText(normalized.slice(jsonStart), null);
    const entries = value?.BusIoFuncMap;
    if (!Array.isArray(entries)) return [];
    return entries
        .map((entry) => {
            const ioType = Number(entry?.IoType);
            const funcId = Number(entry?.FuncId);
            const memAddr = Number(entry?.MemAddr);
            const length = Number(entry?.Length);
            const name = String(entry?.Name || '').trim();
            if (!Number.isFinite(ioType) || !Number.isFinite(funcId) || !Number.isFinite(memAddr)
                || !Number.isFinite(length) || length <= 0 || ![0, 1].includes(ioType)) return null;
            const direction = ioType === 1 ? 'Out' : 'In';
            const mapped = memAddr >= 0;
            const address = !mapped ? null
                : length === 16 && memAddr >= BIT_START && (memAddr - BIT_START) % 16 === 0
                    ? `${direction}W[${WORD_START + ((memAddr - BIT_START) / 16)}]`
                    : `${direction}[${memAddr}]`;
            const normalizedName = name.toLowerCase();
            const command = mapped && ioType === 0 && length === 1
                ? (funcId === 0 || /start\s+program/.test(normalizedName) ? 'start'
                    : funcId === 1 || /stop\s+program/.test(normalizedName) ? 'stop'
                        : funcId === 2 || /reset\s+program/.test(normalizedName) ? 'reset'
                            : funcId === 5 || /clear\s+alarm/.test(normalizedName) ? 'clearAlarm' : '')
                : '';
            return {
                ioType,
                funcId,
                memAddr,
                length,
                name,
                direction,
                mapped,
                address,
                command
            };
        })
        .filter(Boolean);
}

function findRemoteIoMapping(files) {
    for (const [path, record] of files.entries()) {
        if (!path.toLowerCase().endsWith('.dat') || typeof record.text !== 'string') continue;
        const entries = parseRemoteIoMappingText(record.text);
        if (entries.length) return { path, entries };
    }
    return { path: null, entries: [] };
}

function collectProgramFiles(projectInfo, files) {
    const listed = [];
    const candidates = projectInfo?.ProgramFiles || projectInfo?.ProgramFileList || projectInfo?.programFiles;
    if (Array.isArray(candidates)) {
        candidates.forEach((entry) => {
            const value = typeof entry === 'string' ? entry : entry?.FileName || entry?.Name || entry?.Path;
            if (value) listed.push(normalizeOlpPath(value));
        });
    }
    files.forEach((_, path) => {
        if (path.toLowerCase().endsWith('.pro') && !listed.includes(path)) listed.push(path);
    });
    return listed;
}

export async function buildOlpProjectFromFiles(inputFiles) {
    const sourceFiles = [...(inputFiles || [])].filter(Boolean);
    if (!sourceFiles.length) throw new Error('No project files were selected.');
    const rawPaths = sourceFiles.map((file) => normalizeOlpPath(file.webkitRelativePath || file.relativePath || file.name));
    const paths = withoutSelectedFolderRoot(rawPaths);
    const files = new Map();
    for (let index = 0; index < sourceFiles.length; index += 1) {
        const file = sourceFiles[index];
        const path = paths[index] || fileName(rawPaths[index]);
        if (!path || path.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error(`Invalid OLP project path: ${path}`);
        if (files.has(path)) throw new Error(`Duplicate OLP project path: ${path}`);
        let text = null;
        if (isTextPath(path) || file.type?.startsWith('text/')) {
            try { text = await file.text(); } catch { text = null; }
        }
        files.set(path, { path, file, text, binary: text === null });
    }

    const findPath = (predicate) => [...files.keys()].find((path) => predicate(path.toLowerCase(), path));
    const projectPath = findPath((lower) => lower.endsWith('.prj'));
    const projectInfo = projectPath ? parseJsonText(files.get(projectPath)?.text, {}) : {};
    const labelsPath = findPath((lower) => lower.endsWith('/labels.jsn') || lower === 'labels.jsn');
    const labelsInfo = labelsPath ? parseJsonText(files.get(labelsPath)?.text, {}) : {};
    const remoteIoMapping = findRemoteIoMapping(files);
    const pointFiles = [...files.entries()]
        .filter(([path, record]) => path.toLowerCase().endsWith('.pts') && typeof record.text === 'string')
        .map(([path, record]) => ({
            path,
            kind: fileName(path).toLowerCase() === 'jp.pts' ? 'jointPoint' : 'point',
            records: parsePointsFile(path, record.text, fileName(path).toLowerCase() === 'jp.pts' ? 'jointPoint' : 'point')
        }));
    const pointRecords = pointFiles.flatMap((entry) => entry.records);
    const pointsByName = new Map(pointRecords.map((record) => [record.name, record]));
    const pointsByIndex = new Map(pointRecords.flatMap((record) => [
        [`${record.kind}:${record.index}`, record],
        [`${record.sourceSymbol || (record.kind === 'jointPoint' ? 'JP' : 'P')}:${record.index}`, record]
    ]));
    const programs = [...files.entries()]
        .filter(([path, record]) => path.toLowerCase().endsWith('.pro') && typeof record.text === 'string')
        .map(([path, record]) => ({ path, text: record.text }));

    return {
        schemaVersion: OLP_PROJECT_SCHEMA_VERSION,
        name: projectPath ? fileName(projectPath).replace(/\.prj$/i, '') : fileName(rawPaths[0]),
        projectPath,
        projectInfo,
        labels: parseLabels(labelsInfo),
        labelsInfo,
        remoteIoMappingPath: remoteIoMapping.path,
        remoteIoMapping: remoteIoMapping.entries,
        files,
        programs,
        programFiles: collectProgramFiles(projectInfo, files),
        pointFiles,
        pointRecords,
        pointsByName,
        pointsByIndex,
        rootPath: rawPaths[0]?.split('/')[0] || ''
    };
}

export function updateOlpFileText(project, path, text) {
    const record = project?.files?.get(path);
    if (!record) return false;
    record.text = String(text ?? '');
    record.binary = false;
    const program = project.programs?.find((entry) => entry.path === path);
    if (program) program.text = record.text;
    if (/\.pts$/i.test(path) || /(^|\/)labels\.jsn$/i.test(path) || /\.dat$/i.test(path)) refreshOlpProjectDerivedData(project);
    return true;
}

export function refreshOlpProjectDerivedData(project) {
    if (!project?.files) return project;
    const findPath = (predicate) => [...project.files.keys()].find((candidate) => predicate(candidate.toLowerCase(), candidate));
    const labelsPath = findPath((lower) => lower.endsWith('/labels.jsn') || lower === 'labels.jsn');
    const labelsInfo = labelsPath ? parseJsonText(project.files.get(labelsPath)?.text, {}) : {};
    const remoteIoMapping = findRemoteIoMapping(project.files);
    const pointFiles = [...project.files.entries()]
        .filter(([path, record]) => path.toLowerCase().endsWith('.pts') && typeof record.text === 'string')
        .map(([path, record]) => {
            const kind = fileName(path).toLowerCase() === 'jp.pts' ? 'jointPoint' : 'point';
            return { path, kind, records: parsePointsFile(path, record.text, kind) };
        });
    const pointRecords = pointFiles.flatMap((entry) => entry.records);
    project.labelsInfo = labelsInfo;
    project.labels = parseLabels(labelsInfo);
    project.remoteIoMappingPath = remoteIoMapping.path;
    project.remoteIoMapping = remoteIoMapping.entries;
    project.pointFiles = pointFiles;
    project.pointRecords = pointRecords;
    project.pointsByName = new Map(pointRecords.map((record) => [record.name, record]));
    project.pointsByIndex = new Map(pointRecords.flatMap((record) => [
        [`${record.kind}:${record.index}`, record],
        [`${record.sourceSymbol || (record.kind === 'jointPoint' ? 'JP' : 'P')}:${record.index}`, record]
    ]));
    project.programs = [...project.files.entries()]
        .filter(([path, record]) => path.toLowerCase().endsWith('.pro') && typeof record.text === 'string')
        .map(([path, record]) => ({ path, text: record.text }));
    project.programFiles = collectProgramFiles(project.projectInfo, project.files);
    return project;
}

export function getOlpEditableFiles(project) {
    return [...(project?.files?.values() || [])]
        .filter((record) => record.text !== null)
        .sort((left, right) => left.path.localeCompare(right.path, undefined, { numeric: true }));
}

export function resolveOlpPoint(project, expression, activePointFile = null) {
    const raw = String(expression || '').trim().replace(/[;,]$/, '');
    const offsetMatch = raw.match(/^Offset\s*\(\s*([^,]+?)(?:\s*,\s*([^\)]+))?\s*\)$/i);
    const baseExpression = offsetMatch?.[1]?.trim() || raw;
    const baseName = baseExpression.replace(/^Point\s*\(/i, '').replace(/\)$/, '').trim();
    const normalizedBaseName = baseName.replace(/^(?:LP|JP|P)\[/i, (prefix) => prefix.slice(0, -1)).replace(/\]$/, '');
    const activeFileName = activePointFile ? fileName(activePointFile).toLowerCase() : '';
    const activeRecords = activeFileName
        ? project?.pointFiles?.find((file) => fileName(file.path).toLowerCase() === activeFileName)?.records || []
        : [];
    const records = [...activeRecords, ...(project?.pointRecords || [])];
    const direct = records.find((record) => record.name === baseName || record.name === normalizedBaseName
        || record.name?.toLowerCase() === baseName.toLowerCase()
        || record.name?.toLowerCase() === normalizedBaseName.toLowerCase());
    const indexMatch = baseName.match(/^(JP|LP|P)\s*\[?\s*(\d+)\s*\]?$/i);
    const kind = indexMatch?.[1]?.toLowerCase() === 'jp' ? 'jointPoint' : 'point';
    const indexed = indexMatch
        ? records.find((record) => record.kind === kind && record.index === Number(indexMatch[2])
            && (!record.sourceSymbol || record.sourceSymbol === indexMatch[1].toUpperCase()))
        : null;
    const point = direct || indexed;
    if (!point) return null;
    return {
        ...point,
        offsetExpression: offsetMatch?.[2]?.trim() || null
    };
}
