// Register lookups and robot builtins belong to the active OLP task. Their
// return values can be strings, numbers or position records.
const calls = [];
const active = () => calls[calls.length - 1];
const sourcePart = (start, end) => active().source.slice(start, end);

function save(value) {
    return active().values.push(value) - 1;
}

// Let Rust release its temporary tokens and argument arrays even when a robot
// builtin throws. Re-throw the original exception after the synchronous return.
function attempt(work, fallback = 0) {
    const call = active();
    if (call.failed) return fallback;
    try { return work(); }
    catch (error) { call.failed = true; call.error = error; return fallback; }
}

export const olpImports = {
    boolean_literal: (a, b) => attempt(() => Boolean(active().parse(sourcePart(a, b)))),
    compare_literals(op, a, b, c, d) {
        return attempt(() => {
            const left = active().parse(sourcePart(a, b));
            const right = active().parse(sourcePart(c, d));
            switch (op) {
                case 0: return left === right;
                case 1: return left !== right;
                case 2: return left >= right;
                case 3: return left <= right;
                case 4: return left > right;
                case 5: return left < right;
            }
        });
    },
    condition_error(kind, a, b) {
        attempt(() => { throw active().runtime.runtimeError(kind === 0 ? 'Empty condition.' : 'Invalid comparison: ' + sourcePart(a, b)); });
    },
    numeric: save,
    numeric_value: id => attempt(() => Number(active().values[id]), NaN),
    literal(start, end, quoted) {
        const text = sourcePart(start, end);
        return save(quoted ? text.slice(1, -1).replace(/\\([\s\S])/g, '$1') : Number(text));
    },
    symbol: (start, end) => attempt(() => save(active().runtime.readSymbol(sourcePart(start, end)))),
    builtin(start, end, pointer, count) {
        return attempt(() => {
            const { values, engine, runtime, unknown } = active();
            const arguments_ = new Uint32Array(engine.memory.buffer, pointer, count * 3);
            const args = [], raw = [];
            for (let i = 0; i < arguments_.length; i += 3) {
                args.push(values[arguments_[i]]);
                raw.push(sourcePart(arguments_[i+1], arguments_[i+2]));
            }
            const name = sourcePart(start, end);
            const result = runtime.callBuiltinSync(name, args, raw);
            if (result === unknown) throw runtime.runtimeError('Unknown or asynchronous function in expression: ' + name);
            return save(result);
        });
    },
    string_operand: (a, b) => typeof active().values[a] === 'string' || typeof active().values[b] === 'string',
    concatenate: (a, b) => attempt(() => save(String(active().values[a]) + String(active().values[b])))
};

const errors = ['Expected expression value.', 'Expected closing parenthesis.',
    'Expected function closing parenthesis.', 'Division by zero.'];

function writeSource(engine, source) {
    const address = engine.olp_source(source.length);
    const units = new Uint16Array(engine.memory.buffer, address, source.length);
    for (let i = 0; i < source.length; i++) units[i] = source.charCodeAt(i);
}

export function conditionWithEngine(engine, value, runtime, parse) {
    const source = String(value || '');
    writeSource(engine, source);
    const call = { source, runtime, parse, failed: false };
    calls.push(call);
    try {
        const value = Boolean(engine.olp_condition());
        if (call.failed) throw call.error;
        return value;
    } finally { calls.pop(); }
}

export function evaluateWithEngine(engine, value, runtime, unknown) {
    const source = String(value || '').trim();
    writeSource(engine, source);
    const call = { engine, source, runtime, unknown, values: [undefined], failed: false };
    calls.push(call);
    try {
        const status = engine.olp_eval();
        if (call.failed) throw call.error;
        if (status < 0) throw runtime.runtimeError(errors[-status-1]);
        const result = call.values[status];
        if (typeof result === 'number' && !Number.isFinite(result)) throw runtime.runtimeError('Non-finite expression: ' + source);
        return result;
    } finally { calls.pop(); }
}
