export const EQUIPMENT_TYPES = Object.freeze(['CYLINDER', 'LINEAR_AXIS', 'ROTARY_AXIS', 'GRIPPER', 'FILM_PEEL', 'VACUUM', 'OBJECT']);
export const EQUIPMENT_IO_TYPES = Object.freeze(EQUIPMENT_TYPES.filter(type => type !== 'OBJECT'));
export const EQUIPMENT_COMMANDS = Object.freeze(['FORWARD', 'REVERSE', 'STOP', 'RESET', 'RELEASE']);
export const EQUIPMENT_LABELS = Object.freeze({
    CYLINDER: '실린더', LINEAR_AXIS: '직선 외부 축', ROTARY_AXIS: '회전 외부 축',
    GRIPPER: '그리퍼', FILM_PEEL: '필름 박리', VACUUM: '진공', OBJECT: '오브젝트'
});

export function equipmentCommandOptions(type) {
    if (type === 'OBJECT') return [];
    if (type === 'VACUUM') return [['FORWARD','흡착'],['REVERSE','파기']];
    const actions=type === 'GRIPPER' ? [['FORWARD','닫기'],['REVERSE','열기']] : type === 'FILM_PEEL' ? [['FORWARD','박리']] : [['FORWARD','전진'],['REVERSE','후진']];
    return [...actions,['STOP','정지'],['RESET','원위치'],...(type === 'FILM_PEEL' ? [['RELEASE','필름 놓기']] : [])];
}

export function stepEquipmentPosition(current, target, speed, seconds) {
    if (![current, target, speed, seconds].every(Number.isFinite) || speed <= 0 || seconds <= 0) return current;
    const distance = target - current;
    return current + Math.sign(distance) * Math.min(Math.abs(distance), speed * seconds);
}

export function resolveEquipmentCommand(commands) {
    if (commands.includes('RESET')) return { command: 'RESET', error: '' };
    if (commands.includes('STOP')) return { command: 'STOP', error: '' };
    if (commands.includes('RELEASE')) return { command: 'RELEASE', error: commands.includes('FORWARD') || commands.includes('REVERSE') ? '해제 명령과 이동 명령이 동시에 입력되었습니다.' : '' };
    if (commands.includes('FORWARD') && commands.includes('REVERSE')) return { command: 'STOP', error: '전진과 후진 명령이 동시에 입력되었습니다.' };
    return { command: commands.includes('FORWARD') ? 'FORWARD' : commands.includes('REVERSE') ? 'REVERSE' : 'STOP', error: '' };
}

export function equipmentFeedback(position, travel, tolerance = 0.01) {
    return { home: Math.abs(position) <= tolerance, end: Math.abs(position - travel) <= tolerance };
}

function number(value, fallback, min, max, label) {
    const result = Number(value === undefined || value === '' ? fallback : value);
    if (!Number.isFinite(result) || result < min || result > max) throw new RangeError(`${label}: ${min}~${max} 범위의 숫자를 입력하세요.`);
    return result;
}

// Keep the first reference for older workspaces and integrations using singular fields.
export function equipmentReferences(source, key = 'movingRef') {
    const values = Array.isArray(source[`${key}s`]) ? source[`${key}s`].map(String).filter(Boolean) : [];
    if (source[key] && values[0] !== source[key]) {
        if (values.length) values[0] = String(source[key]);
        else values.push(String(source[key]));
    }
    return [...new Set(values)];
}

export function equipmentMotionGroups(def) {
    if (['VACUUM', 'OBJECT'].includes(def.type)) return [];
    return [
        ...equipmentReferences(def).map(ref => [ref, 1]),
        ...(def.type === 'GRIPPER' ? equipmentReferences(def, 'secondRef').map(ref => [ref, -1]) : []),
        ...(['LINEAR_AXIS', 'ROTARY_AXIS'].includes(def.type) ? equipmentReferences(def, 'carriedRef').map(ref => [ref, 1]) : [])
    ];
}

export function normalizeEquipmentDefinition(source) {
    if (!source || !EQUIPMENT_TYPES.includes(source.type)) throw new Error('지원하지 않는 설비 종류입니다.');
    if (['VACUUM', 'OBJECT'].includes(source.type)) {
        const movingRefs = equipmentReferences(source);
        if (!source.id || !movingRefs.length) throw new Error('동작 ID와 대상 모델 또는 부품을 선택하세요.');
        return { id: String(source.id), name: String(source.name || EQUIPMENT_LABELS[source.type]), type: source.type,
            movingRefs, movingRef: movingRefs[0], bodyRef: '', secondRef: '', secondRefs: [], carriedRef: '', carriedRefs: [],
            robotRef: '', pullerRef: '', axis: 'X', travel: 0, speed: 0, reverseSpeed: 0, externalAxis: 0,
            feedbackHome: null, feedbackEnd: null, feedbackGrip: source.type === 'VACUUM' ? sensor(source.feedbackGrip) : null, enabled: source.enabled !== false,
            origins: source.type === 'OBJECT' && source.origins && typeof source.origins === 'object' ? JSON.parse(JSON.stringify(source.origins)) : {}, runtime: source.runtime ? JSON.parse(JSON.stringify(source.runtime)) : { position: 0, heldRef: '', heldLocal: null } };
    }
    const rotary = source.type === 'ROTARY_AXIS';
    const def = {
        id: String(source.id || ''), name: String(source.name || EQUIPMENT_LABELS[source.type]), type: source.type,
        bodyRef: String(source.bodyRef || ''), movingRef: String(source.movingRef || ''),
        secondRef: String(source.secondRef || ''), carriedRef: String(source.carriedRef || ''),
        robotRef: String(source.robotRef || ''), pullerRef: String(source.pullerRef || ''),
        filmGripRef: String(source.filmGripRef || ''),
        filmGripRefs: equipmentReferences(source, 'filmGripRef'),
        filmGripSide: ['X-', 'X+', 'Y-', 'Y+'].includes(source.filmGripSide) ? source.filmGripSide : 'X-',
        filmGripOffset: number(source.filmGripOffset, 50, 0, 100, '필름 손잡이 위치'),
        filmGripWidth: number(source.filmGripWidth, 20, 0.1, 10000, '필름 파지 폭'),
        axis: ['X', 'Y', 'Z', '-X', '-Y', '-Z'].includes(source.axis) ? source.axis : 'X',
        travel: number(source.travel, rotary ? 90 : 100, 0.1, rotary ? 3600 : 100000, '행정'),
        speed: number(source.speed, 100, 0.1, 10000, '속도'),
        reverseSpeed: number(['CYLINDER', 'GRIPPER'].includes(source.type) ? source.speed : source.reverseSpeed, source.speed || 100, 0.1, 10000, '속도'),
        openWidth: number(source.openWidth, 80, 0.1, 10000, '열림 폭'),
        closedWidth: number(source.closedWidth, 0, 0, 10000, '닫힘 폭'),
        gripDepth: number(source.gripDepth, 80, 1, 10000, '파지 영역 길이'),
        gripHeight: number(source.gripHeight, 80, 1, 10000, '파지 영역 높이'),
        filmLength: number(source.filmLength, 300, 10, 10000, '필름 길이'),
        filmWidth: number(source.filmWidth, 100, 1, 5000, '필름 폭'),
        filmStiffness: number(source.filmStiffness, 0.05, 0, 1, '굽힘 강성'),
        filmDamping: number(source.filmDamping, 0.96, 0.1, 1, '감쇠'),
        externalAxis: number(source.externalAxis, 0, 0, 6, 'E축 번호'),
        pivot: Array.from({ length: 3 }, (_, index) => number(source.pivot?.[index], 0, -1000000, 1000000, '회전 중심')),
        gripCenter: Array.from({ length: 3 }, (_, index) => number(source.gripCenter?.[index], index === 2 ? Number(source.gripHeight || 80) / 2 : 0, -1000000, 1000000, '파지 영역 중심')),
        feedbackHome: sensor(source.feedbackHome), feedbackEnd: sensor(source.feedbackEnd), feedbackGrip: sensor(source.feedbackGrip),
        enabled: source.enabled !== false,
        origins: source.origins && typeof source.origins === 'object' ? JSON.parse(JSON.stringify(source.origins)) : {},
        runtime: source.runtime && typeof source.runtime === 'object' ? JSON.parse(JSON.stringify(source.runtime)) : { position: 0, heldRef: '', heldLocal: null }
    };
    if (def.type === 'FILM_PEEL') {
        def.travel = def.filmGripSide.startsWith('Y') ? def.filmWidth : def.filmLength;
        def.filmGripRef = def.filmGripRefs[0] || '';
    }
    for (const key of ['movingRef', 'secondRef', 'carriedRef']) {
        def[`${key}s`] = equipmentReferences(source, key);
        if (key === 'secondRef' && def.type !== 'GRIPPER' || key === 'carriedRef' && !['LINEAR_AXIS', 'ROTARY_AXIS'].includes(def.type)) def[`${key}s`] = [];
        def[key] = def[`${key}s`][0] || '';
    }
    if (!def.id || !def.movingRef) throw new Error('설비 ID와 가동부를 선택하세요.');
    const controlled = equipmentMotionGroups(def).map(([ref]) => ref);
    if (def.bodyRef && controlled.includes(def.bodyRef)) throw new Error('고정부와 가동부는 달라야 합니다.');
    if (new Set(controlled).size !== controlled.length) throw new Error('동일한 부품을 여러 이동 그룹에 지정할 수 없습니다.');
    if (def.type === 'FILM_PEEL' && def.movingRefs.length !== 1) throw new Error('변형할 필름은 설비마다 하나씩 지정하세요.');
    if (def.type === 'GRIPPER' && (!def.secondRef || def.secondRef === def.movingRef || def.openWidth <= def.closedWidth)) throw new Error('서로 다른 손가락 2개와 올바른 개구폭을 설정하세요.');
    if (!Number.isInteger(def.externalAxis)) throw new Error('E축 번호는 0~6의 정수여야 합니다.');
    if (def.externalAxis && (!['LINEAR_AXIS', 'ROTARY_AXIS'].includes(def.type) || !def.robotRef)) throw new Error('E축 연결에는 외부 축 종류와 로봇이 필요합니다.');
    const sensors = [def.feedbackHome, def.feedbackEnd, def.feedbackGrip].filter(value => value !== null);
    if (new Set(sensors).size !== sensors.length) throw new Error('완료 센서 주소는 서로 달라야 합니다.');
    def.runtime.position = Math.max(0, Math.min(def.travel, Number(def.runtime.position) || 0));
    return def;
}

function sensor(value) {
    if (value === undefined || value === null || value === '') return null;
    const result = Number(value);
    if (!Number.isInteger(result) || !(result >= 0 && result <= 64 || result >= 512 && result <= 2559)) throw new Error('센서 주소는 0~64 또는 512~2559의 정수여야 합니다.');
    return result;
}

export function normalizeEquipmentBindings(source) {
    const forward = sensor(source.forward), reverse = sensor(source.reverse);
    if (forward !== null && forward === reverse) throw new Error('전진과 후진에는 서로 다른 IO 번호를 지정하세요.');
    return { direction: 'OUT', triggerValue: Number(source.triggerValue) === 0 ? 0 : 1, forward, reverse };
}

export function validateEquipmentDefinitions(definitions) {
    const ids = new Set(); const writers = new Set(); const movers = new Set(); const axes = new Set();
    for (const raw of definitions) {
        const def = normalizeEquipmentDefinition(raw);
        if (ids.has(def.id)) throw new Error('설비 ID가 중복됩니다.'); ids.add(def.id);
        const controls = [...equipmentMotionGroups(def), ...(def.type === 'FILM_PEEL' ? def.filmGripRefs.map(ref => [ref, 1]) : [])];
        for (const [ref] of controls) {
            if (movers.has(ref)) throw new Error('동일한 가동부를 여러 설비에서 제어할 수 없습니다.'); movers.add(ref);
        }
        if (def.externalAxis) {
            const key = `${def.robotRef}:${def.externalAxis}`;
            if (axes.has(key)) throw new Error('동일한 E축 연결이 중복됩니다.'); axes.add(key);
        }
        for (const address of [def.feedbackHome, def.feedbackEnd, def.feedbackGrip].filter(value => value !== null)) {
            if (writers.has(address)) throw new Error('센서 입력 주소가 다른 설비와 중복됩니다.'); writers.add(address);
        }
    }
}
