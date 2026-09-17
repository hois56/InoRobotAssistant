import {
    IO_SIMULATOR_DIRECTIONS,
    normalizeIoSimulatorDirection
} from './io-simulator-core.mjs';

export const IO_FUNCTION_MAPPING_SCHEMA_VERSION = 1;

export const IO_FUNCTION_MAPPING_ACTIONS = Object.freeze({
    GRIP_USE: 'GRIP_USE',
    GRIP_RELEASE: 'GRIP_RELEASE',
    VIEW: 'VIEW'
});

export const IO_FUNCTION_MAPPING_ADDRESS_RANGES = Object.freeze([
    Object.freeze({ start: 0, end: 64 }),
    Object.freeze({ start: 512, end: 2559 })
]);

const ACTION_VALUES = new Set(Object.values(IO_FUNCTION_MAPPING_ACTIONS));

export function isSupportedIoFunctionMappingAddress(value) {
    const address = Number(value);
    return Number.isSafeInteger(address)
        && IO_FUNCTION_MAPPING_ADDRESS_RANGES.some((range) => address >= range.start && address <= range.end);
}

export function normalizeIoFunctionMapping(value, index = 0) {
    const source = value && typeof value === 'object' ? value : {};
    const action = ACTION_VALUES.has(source.action)
        ? source.action
        : IO_FUNCTION_MAPPING_ACTIONS.GRIP_USE;
    const rawAddress = Number(source.address);
    const address = isSupportedIoFunctionMappingAddress(rawAddress)
        ? Math.trunc(rawAddress)
        : 0;
    const rawViewSlot = Number(source.viewSlot);
    const viewSlot = Number.isSafeInteger(rawViewSlot)
        ? Math.min(3, Math.max(0, Math.trunc(rawViewSlot)))
        : 0;
    return {
        id: String(source.id || `io-mapping-${index + 1}`),
        direction: normalizeIoSimulatorDirection(source.direction),
        address,
        triggerValue: Number(source.triggerValue) === 0 ? 0 : 1,
        action,
        gripObjectRef: String(source.gripObjectRef || '').trim(),
        viewSlot,
        enabled: source.enabled !== false
    };
}

export function normalizeIoFunctionMappings(value) {
    if (!Array.isArray(value)) return [];
    const usedIds = new Set();
    return value.map((entry, index) => {
        const mapping = normalizeIoFunctionMapping(entry, index);
        let id = mapping.id;
        let suffix = 2;
        while (usedIds.has(id)) id = `${mapping.id}-${suffix++}`;
        mapping.id = id;
        usedIds.add(id);
        return mapping;
    });
}

export function cloneIoFunctionMappings(value) {
    return normalizeIoFunctionMappings(value).map((mapping) => ({ ...mapping }));
}

export function isIoFunctionMappingAction(value) {
    return ACTION_VALUES.has(value);
}

export function getIoFunctionMappingAddressLabel(mapping) {
    const direction = normalizeIoSimulatorDirection(mapping?.direction) === IO_SIMULATOR_DIRECTIONS.OUTPUT
        ? 'Out'
        : 'In';
    return `${direction}[${Number(mapping?.address) || 0}]`;
}
