// Trace data definitions and CSV helpers shared by the 3D simulation trace UI.
// The channel names intentionally follow InoRobotTrace so captured files remain
// familiar to users of the debugging tool.

export const TRACE_MAX_POINTS = 120000;
export const TRACE_INTERVALS = Object.freeze([1, 2, 4, 8, 10, 20, 50, 100]);

const CHANNEL = (id, group, name, unit, sources) => Object.freeze({
    id, group, name, unit, sources: Object.freeze([...sources])
});

const MOTION_SOURCES = ['program', 'olp', 'virtual', 'real'];
const SIMULATION_SOURCES = ['program', 'olp'];

export const TRACE_CHANNELS = Object.freeze([
    CHANNEL('tcp_speed', 'Speed', 'TCP Speed', 'mm/s', MOTION_SOURCES),
    ...Array.from({ length: 6 }, (_, index) => CHANNEL(
        `joint_speed_j${index + 1}`, 'Joint Speed', `J${index + 1}`, 'deg/s', MOTION_SOURCES
    )),
    ...Array.from({ length: 6 }, (_, index) => CHANNEL(
        `joint_pos_j${index + 1}`, 'Joint Position', `J${index + 1}`, 'deg', MOTION_SOURCES
    )),
    ...[
        ['pos_x', 'Pos X', 'mm'], ['pos_y', 'Pos Y', 'mm'], ['pos_z', 'Pos Z', 'mm'],
        ['pos_a', 'Pos A', 'deg'], ['pos_b', 'Pos B', 'deg'], ['pos_c', 'Pos C', 'deg']
    ].map(([id, name, unit]) => CHANNEL(id, 'Current Position', name, unit, MOTION_SOURCES)),
    CHANNEL('program_line', 'Line Monitor', 'Program Line', '', ['program', 'olp', 'real']),
    CHANNEL('motion_line', 'Line Monitor', 'Motion Line', '', ['program', 'olp', 'real']),
    CHANNEL('motion_state', 'Line Monitor', 'Motion State', '', ['program', 'olp']),
    CHANNEL('cycle_time', 'System', 'Cycle Time', 's', ['program']),
    CHANNEL('collision_status', 'System', 'Collision Status', '', SIMULATION_SOURCES),
    CHANNEL('controller_time', 'Controller', 'Controller Time', 's', ['virtual']),
    CHANNEL('sequence', 'Controller', 'Sequence', '', ['virtual']),
    CHANNEL('receive_rate', 'Controller', 'Receive Rate', 'Hz', ['virtual']),
    CHANNEL('err_status', 'Error', 'Error Status', '', ['real']),
    CHANNEL('err_code', 'Error', 'Error Code', 'hex', ['real']),
    ...Array.from({ length: 6 }, (_, index) => CHANNEL(
        `err_servo_j${index + 1}`, 'Error', `Servo Error J${index + 1}`, 'hex', ['real']
    )),
    CHANNEL('estop_status', 'Error', 'E-Stop Status', '', ['real']),
    CHANNEL('system_time', 'System', 'System Time', '', ['real']),
    CHANNEL('fw_version', 'System', 'F/W Version', '', ['real']),
    CHANNEL('tool_number', 'Tool Number', 'Tool Number', '', ['real']),
    CHANNEL('wobj_number', 'Tool Number', 'Wobj Number', '', ['real']),
    CHANNEL('load_number', 'Tool Number', 'Load Number', '', ['real']),
    ...Array.from({ length: 11 }, (_, index) => CHANNEL(
        `b_var_${index}`, 'B Var', `B[${index}]`, '', ['real', 'olp']
    )),
    ...Array.from({ length: 11 }, (_, index) => CHANNEL(
        `r_var_${index}`, 'R Var', `R[${index}]`, '', ['real', 'olp']
    )),
    ...Array.from({ length: 11 }, (_, index) => CHANNEL(
        `d_var_${index}`, 'D Var', `D[${index}]`, '', ['real', 'olp']
    )),
    ...Array.from({ length: 16 }, (_, index) => CHANNEL(
        `di_${index}`, 'DI', `DI[${index}]`, 'ON/OFF', ['real', 'olp']
    )),
    ...Array.from({ length: 16 }, (_, index) => CHANNEL(
        `do_${index}`, 'DO', `DO[${index}]`, 'ON/OFF', ['real', 'olp']
    )),
    CHANNEL('olp_phase', 'OLP', 'OLP Phase', '', ['olp']),
    CHANNEL('olp_command', 'OLP', 'OLP Command', '', ['olp']),
    CHANNEL('olp_wait', 'OLP', 'OLP Wait', '', ['olp'])
]);

const CHANNEL_BY_ID = new Map(TRACE_CHANNELS.map((channel) => [channel.id, channel]));

export function getTraceChannel(channelId) {
    return CHANNEL_BY_ID.get(String(channelId || '')) || null;
}

export function createTraceChannelKey(robotId, channelId) {
    return `${String(robotId || '')}::${String(channelId || '')}`;
}

export function splitTraceChannelKey(key) {
    const raw = String(key || '');
    const separator = raw.indexOf('::');
    if (separator < 0) return { robotId: '', channelId: raw };
    return {
        robotId: raw.slice(0, separator),
        channelId: raw.slice(separator + 2)
    };
}

export function isTraceChannelAvailable(channelId, source) {
    const channel = getTraceChannel(channelId);
    return Boolean(channel && channel.sources.includes(String(source || '')));
}

export function escapeCsvCell(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeTraceCsv(points, channels) {
    const list = Array.isArray(points) ? points : [];
    const channelList = Array.isArray(channels) ? channels : [];
    const header = ['time', ...channelList.map((channel) => channel.exportKey || channel.key)];
    const rows = [header.map(escapeCsvCell).join(',')];
    list.forEach((point) => {
        rows.push([
            Number.isFinite(Number(point?.time)) ? Number(point.time) : '',
            ...channelList.map((channel) => {
                const value = point?.values?.[channel.key];
                return Number.isFinite(Number(value)) ? Number(value) : '';
            })
        ].map(escapeCsvCell).join(','));
    });
    return rows.join('\r\n');
}

function parseCsvLine(line) {
    const cells = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"') {
            if (quoted && line[index + 1] === '"') {
                current += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === ',' && !quoted) {
            cells.push(current);
            current = '';
        } else {
            current += character;
        }
    }
    cells.push(current);
    return cells;
}

export function parseTraceCsv(text) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.length > 0);
    if (!lines.length) return { headers: [], points: [] };
    const headers = parseCsvLine(lines[0]).map((value) => value.trim());
    const timeIndex = Math.max(0, headers.findIndex((header) => header.toLowerCase() === 'time'));
    const points = lines.slice(1).map((line) => {
        const cells = parseCsvLine(line);
        const values = {};
        headers.forEach((header, index) => {
            if (!header || index === timeIndex) return;
            const number = Number(cells[index]);
            if (Number.isFinite(number)) values[header] = number;
        });
        const time = Number(cells[timeIndex]);
        return { time: Number.isFinite(time) ? time : 0, values };
    }).filter((point) => Object.keys(point.values).length > 0 || point.time !== 0);
    return { headers, points };
}

export function normalizedTraceInterval(value, fallback = 4) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return TRACE_INTERVALS.includes(number) ? number : fallback;
}
