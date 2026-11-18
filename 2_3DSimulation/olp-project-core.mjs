import { normalizeOlpPath, parsePointsFile, parseLabels, parseRemoteIoMappingText, parsePointReference } from './wasm/project-files.mjs';

const TEXT_EXTENSIONS = new Set(['.pro', '.prj', '.pts', '.jsn', '.dat', '.cfg', '.txt', '.csv']);
export const OLP_PROJECT_SCHEMA_VERSION = 1;

export { normalizeOlpPath, normalizeOlpTextForWindows } from './wasm/project-files.mjs';

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

function parseJsonText(text, fallback = null) {
    try {
        const normalized = String(text ?? '').replace(/^\uFEFF/, '');
        return JSON.parse(normalized);
    } catch { return fallback; }
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
    return refreshOlpProjectDerivedData({
        schemaVersion: OLP_PROJECT_SCHEMA_VERSION,
        name: projectPath ? fileName(projectPath).replace(/\.prj$/i, '') : fileName(rawPaths[0]),
        projectPath,
        projectInfo,
        files,
        rootPath: rawPaths[0]?.split('/')[0] || ''
    });
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
    const { base: baseName, normalized: normalizedBaseName, symbol, index, offset } = parsePointReference(expression);
    const activeFileName = activePointFile ? fileName(activePointFile).toLowerCase() : '';
    const activeRecords = activeFileName
        ? project?.pointFiles?.find((file) => fileName(file.path).toLowerCase() === activeFileName)?.records || []
        : [];
    const records = [...activeRecords, ...(project?.pointRecords || [])];
    const direct = records.find((record) => record.name === baseName || record.name === normalizedBaseName
        || record.name?.toLowerCase() === baseName.toLowerCase()
        || record.name?.toLowerCase() === normalizedBaseName.toLowerCase());
    const kind = symbol === 'JP' ? 'jointPoint' : 'point';
    const indexed = symbol ? records.find(record => record.kind === kind && record.index === index
        && (!record.sourceSymbol || record.sourceSymbol === symbol)) : null;
    // A symbolic point name remains bound to its numeric index when a
    // recipe file without Name fields replaces the active point coordinates.
    const alias = direct || indexed;
    if (!alias) return null;
    const active = activeRecords.find(record => record.kind === alias.kind
        && record.index === alias.index && (record.sourceSymbol || 'P') === (alias.sourceSymbol || 'P'));
    const point = active || alias;
    return {
        ...point,
        name: direct?.name || point.name,
        offsetExpression: offset
    };
}
