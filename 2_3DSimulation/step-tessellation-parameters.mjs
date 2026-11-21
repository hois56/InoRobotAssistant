const MEBIBYTE = 1024 * 1024;

export function getStepTessellationParameters(fileSizeBytes, qualityKey = 'auto') {
    if (qualityKey === 'lightweight') {
        return { linearDeflection: 0.004, angularDeflection: 1.0 };
    }
    if (qualityKey === 'standard') {
        return { linearDeflection: 0.001, angularDeflection: 0.5 };
    }
    if (qualityKey === 'high') {
        return { linearDeflection: 0.00025, angularDeflection: 0.25 };
    }
    if (fileSizeBytes >= 150 * MEBIBYTE) {
        return { linearDeflection: 0.003, angularDeflection: 0.85 };
    }
    if (fileSizeBytes >= 50 * MEBIBYTE) {
        return { linearDeflection: 0.004, angularDeflection: 0.9 };
    }
    if (fileSizeBytes >= 20 * MEBIBYTE) {
        return { linearDeflection: 0.003, angularDeflection: 0.75 };
    }
    return { linearDeflection: 0.001, angularDeflection: 0.5 };
}
