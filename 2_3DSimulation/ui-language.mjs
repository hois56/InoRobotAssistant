export function uiText(value) {
    const source = String(value);
    return globalThis.InoRobotI18n?.translate(source) ?? source;
}

export function uiFormat(source, values = {}) {
    return uiText(source).replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => (
        Object.hasOwn(values, key) ? String(values[key]) : match
    ));
}
