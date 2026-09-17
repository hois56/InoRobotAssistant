const LOW_BIT_START = 0;
const LOW_BIT_END = 64;
const WORD_BIT_START = 512;
const WORD_COUNT = 128;
const BITS_PER_WORD = 16;
const WORD_BIT_END = WORD_BIT_START + WORD_COUNT * BITS_PER_WORD - 1;

export const IO_SIMULATOR_DIRECTIONS = Object.freeze({
    INPUT: 'IN',
    OUTPUT: 'OUT'
});

export const IO_SIMULATOR_DISPLAY_MODES = Object.freeze({
    BIT: 'bit',
    BYTE: 'byte',
    WORD: 'word'
});

const DISPLAY_WIDTHS = Object.freeze({
    [IO_SIMULATOR_DISPLAY_MODES.BIT]: 1,
    [IO_SIMULATOR_DISPLAY_MODES.BYTE]: 8,
    [IO_SIMULATOR_DISPLAY_MODES.WORD]: 16
});

const IO_RANGES = Object.freeze([
    { id: 'low', bitStart: LOW_BIT_START, bitEnd: LOW_BIT_END },
    { id: 'word-area', bitStart: WORD_BIT_START, bitEnd: WORD_BIT_END }
]);

export const IO_SIMULATOR_RANGES = IO_RANGES;

export function normalizeIoSimulatorDirection(value) {
    return String(value || '').trim().toUpperCase() === IO_SIMULATOR_DIRECTIONS.OUTPUT
        ? IO_SIMULATOR_DIRECTIONS.OUTPUT
        : IO_SIMULATOR_DIRECTIONS.INPUT;
}

export function normalizeIoSimulatorMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(DISPLAY_WIDTHS, mode)
        ? mode
        : IO_SIMULATOR_DISPLAY_MODES.BIT;
}

function getModePrefix(direction, mode) {
    const displayDirection = direction === IO_SIMULATOR_DIRECTIONS.OUTPUT ? 'Out' : 'In';
    if (mode === IO_SIMULATOR_DISPLAY_MODES.BIT) return displayDirection;
    return displayDirection + (mode === IO_SIMULATOR_DISPLAY_MODES.BYTE ? 'B' : 'W');
}

export function getIoSimulatorEntries(directionValue, modeValue) {
    const direction = normalizeIoSimulatorDirection(directionValue);
    const mode = normalizeIoSimulatorMode(modeValue);
    const fullWidth = DISPLAY_WIDTHS[mode];
    const prefix = getModePrefix(direction, mode);
    const entries = [];

    IO_RANGES.forEach((range) => {
        for (let bitStart = range.bitStart; bitStart <= range.bitEnd; bitStart += fullWidth) {
            const bitWidth = Math.min(fullWidth, range.bitEnd - bitStart + 1);
            const address = mode === IO_SIMULATOR_DISPLAY_MODES.BIT
                ? bitStart
                : Math.floor(bitStart / fullWidth);
            entries.push({
                id: `${direction}:${mode}:${bitStart}`,
                rangeId: range.id,
                direction,
                mode,
                prefix,
                address,
                label: `${prefix}[${address}]`,
                bitStart,
                bitWidth,
                bitEnd: bitStart + bitWidth - 1,
                fullWidth,
                runtimeAddress: `${prefix}[${address}]`
            });
        }
    });
    return entries;
}

export function readIoSimulatorEntry(entry, readBit) {
    if (!entry || typeof readBit !== 'function') return 0;
    let value = 0;
    for (let offset = 0; offset < entry.bitWidth; offset += 1) {
        if (readBit(entry.bitStart + offset)) value |= (1 << offset);
    }
    return value;
}

export function writeIoSimulatorEntry(entry, value, writeBit) {
    if (!entry || typeof writeBit !== 'function') return 0;
    const maxValue = (2 ** entry.bitWidth) - 1;
    const numeric = Math.max(0, Math.min(maxValue, Math.trunc(Number(value) || 0)));
    for (let offset = 0; offset < entry.bitWidth; offset += 1) {
        writeBit(entry.bitStart + offset, ((numeric >> offset) & 1) === 1);
    }
    return numeric;
}

export function formatIoSimulatorValue(value, mode) {
    const normalizedMode = normalizeIoSimulatorMode(mode);
    if (normalizedMode === IO_SIMULATOR_DISPLAY_MODES.BIT) return value ? 'ON' : 'OFF';
    return String(Number(value) || 0);
}
