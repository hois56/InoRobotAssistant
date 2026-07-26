const WORD_START = 32;
const WORD_COUNT = 128;
const BIT_START = 512;
const BIT_COUNT = WORD_COUNT * 16;
export const OLP_RUNTIME_BUILD = 'R28';

export class OlpRuntimeError extends Error {
    constructor(message, runtime = null) {
        const location = runtime?.currentFilePath
            ? `${runtime.currentFilePath}:${runtime.currentLineNumber || 0}`
            : 'OLP';
        const command = runtime?.currentCommand ? ` [${runtime.currentCommand}]` : '';
        super(`${location}: ${message}${command}`);
        this.name = 'OlpRuntimeError';
        this.filePath = runtime?.currentFilePath || null;
        this.lineNumber = runtime?.currentLineNumber || 0;
        this.command = runtime?.currentCommand || '';
    }
}

function stripOuterParentheses(value) {
    let source = String(value || '').trim();
    let changed = true;
    while (changed && source.startsWith('(') && source.endsWith(')')) {
        changed = false;
        let depth = 0;
        let quote = null;
        let closesAt = -1;
        for (let index = 0; index < source.length; index += 1) {
            const char = source[index];
            if (quote) {
                if (char === '\\') index += 1;
                else if (char === quote) quote = null;
                continue;
            }
            if (char === '"' || char === "'") { quote = char; continue; }
            if (char === '(') depth += 1;
            else if (char === ')') {
                depth -= 1;
                if (depth === 0) { closesAt = index; break; }
            }
        }
        if (closesAt === source.length - 1) {
            source = source.slice(1, -1).trim();
            changed = true;
        }
    }
    return source;
}

function splitTopLevelKeyword(value, keyword) {
    const source = String(value || '').trim();
    const parts = [];
    let start = 0;
    let depth = 0;
    let quote = null;
    const lowerKeyword = keyword.toLowerCase();
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (char === '\\') index += 1;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === "'") { quote = char; continue; }
        if (char === '(' || char === '[') { depth += 1; continue; }
        if (char === ')' || char === ']') { depth -= 1; continue; }
        if (depth !== 0 || source.slice(index, index + keyword.length).toLowerCase() !== lowerKeyword) continue;
        const before = source[index - 1] || ' ';
        const after = source[index + keyword.length] || ' ';
        if (/[A-Za-z0-9_]/.test(before) || /[A-Za-z0-9_]/.test(after)) continue;
        parts.push(source.slice(start, index).trim());
        start = index + keyword.length;
        index += keyword.length - 1;
    }
    if (parts.length) parts.push(source.slice(start).trim());
    return parts;
}

function findTopLevelComparison(value) {
    const source = String(value || '').trim();
    let depth = 0;
    let quote = null;
    const operators = ['==', '!=', '<>', '>=', '<=', '=', '>', '<'];
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (char === '\\') index += 1;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === "'") { quote = char; continue; }
        if (char === '(' || char === '[') { depth += 1; continue; }
        if (char === ')' || char === ']') { depth -= 1; continue; }
        if (depth !== 0) continue;
        const operator = operators.find((candidate) => source.startsWith(candidate, index));
        if (!operator) continue;
        return {
            left: source.slice(0, index).trim(),
            operator,
            right: source.slice(index + operator.length).trim()
        };
    }
    return null;
}

function clampWord(value) {
    return Math.max(0, Math.min(0xffff, Math.trunc(Number(value) || 0)));
}

function normalizeAddress(address, labels = {}) {
    if (address && typeof address === 'object') {
        const prefix = String(address.prefix || '').toUpperCase();
        const index = Number(address.index);
        if (['IN', 'OUT', 'INW', 'OUTW'].includes(prefix) && Number.isInteger(index) && index >= 0) {
            return { prefix, index };
        }
    }
    const raw = String(address || '').trim();
    const resolved = labels[raw]
        || Object.entries(labels).find(([label]) => label.toLowerCase() === raw.toLowerCase())?.[1]
        || raw;
    const match = resolved.match(/^(InW|OutW|In|Out)\s*\[\s*(\d+)\s*\]$/i);
    if (!match) return null;
    return { prefix: match[1].toUpperCase(), index: Number(match[2]) };
}

function getCaseInsensitive(map, key) {
    if (map.has(key)) return map.get(key);
    const matched = [...map.keys()].find((candidate) => String(candidate).toLowerCase() === String(key).toLowerCase());
    return matched === undefined ? undefined : map.get(matched);
}

function findTopLevelOperator(value, operators) {
    const source = String(value || '');
    let depth = 0;
    let quote = null;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (char === '\\') index += 1;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === "'") { quote = char; continue; }
        if (char === '(' || char === '[') depth += 1;
        else if (char === ')' || char === ']') depth -= 1;
        else if (depth === 0 && operators.includes(char)) return index;
    }
    return -1;
}

function normalizeRuntimeSymbol(value, runtime) {
    let source = String(value || '').trim();
    // Resolve dynamic array indexes (`P[B[1]]`, `PR[B_PR]`, `In[R[0]]`) from
    // the inside out.  A regular expression cannot see the outer `P[...]`
    // in P[B[1]], so match bracket pairs explicitly and replace the deepest
    // non-literal index one at a time.
    for (let pass = 0; pass < 16; pass += 1) {
        const stack = [];
        const pairs = [];
        for (let index = 0; index < source.length; index += 1) {
            if (source[index] === '[') stack.push(index);
            else if (source[index] === ']' && stack.length) {
                const open = stack.pop();
                pairs.push({ open, close: index, content: source.slice(open + 1, index).trim() });
            }
        }
        const dynamic = pairs
            .filter((pair) => !/^[-+]?\d+(?:\.0+)?$/.test(pair.content))
            .sort((left, right) => right.open - left.open)[0];
        if (!dynamic) break;
        const evaluated = Number(parseLiteral(dynamic.content, runtime));
        if (!Number.isFinite(evaluated)) break;
        source = `${source.slice(0, dynamic.open)}[${Math.trunc(evaluated)}]${source.slice(dynamic.close + 1)}`;
    }
    return source;
}

function readExpressionToken(source, start) {
    let index = start;
    if (!/[A-Za-z_]/.test(source[index] || '')) return null;
    index += 1;
    while (/[\w]/.test(source[index] || '')) index += 1;
    while (true) {
        if (source[index] === '[') {
            let depth = 1;
            index += 1;
            while (index < source.length && depth > 0) {
                if (source[index] === '[') depth += 1;
                else if (source[index] === ']') depth -= 1;
                index += 1;
            }
            continue;
        }
        if (source[index] === '.' && /[A-Za-z_]/.test(source[index + 1] || '')) {
            index += 2;
            while (/[\w]/.test(source[index] || '')) index += 1;
            continue;
        }
        break;
    }
    return { value: source.slice(start, index), end: index };
}

function tokenizeNumericExpression(value) {
    const source = String(value || '').trim();
    const tokens = [];
    let index = 0;
    while (index < source.length) {
        const char = source[index];
        if (/\s/.test(char)) { index += 1; continue; }
        const number = source.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
        if (number) {
            tokens.push({ type: 'number', value: Number(number[0]) });
            index += number[0].length;
            continue;
        }
        if ('+-*/(),'.includes(char)) {
            tokens.push({ type: char, value: char });
            index += 1;
            continue;
        }
        const symbol = readExpressionToken(source, index);
        if (symbol) {
            tokens.push({ type: 'symbol', value: symbol.value });
            index = symbol.end;
            continue;
        }
        return null;
    }
    return tokens;
}

function evaluateNumericExpression(value, runtime) {
    const tokens = tokenizeNumericExpression(value);
    if (!tokens?.length) return undefined;
    let cursor = 0;
    const peek = () => tokens[cursor];
    const consume = (type) => {
        if (peek()?.type !== type) return null;
        const token = tokens[cursor];
        cursor += 1;
        return token;
    };
    const parsePrimary = () => {
        const number = consume('number');
        if (number) return number.value;
        const symbol = consume('symbol');
        if (symbol) {
            const name = symbol.value.toUpperCase();
            if ((name === 'MAX' || name === 'MIN') && consume('(')) {
                const left = parseAdditive();
                if (!consume(',')) throw new Error('Expected function argument separator.');
                const right = parseAdditive();
                if (!consume(')')) throw new Error('Expected function closing parenthesis.');
                return name === 'MAX' ? Math.max(left, right) : Math.min(left, right);
            }
            if (/^(ON|TRUE)$/i.test(symbol.value)) return 1;
            if (/^(OFF|FALSE)$/i.test(symbol.value)) return 0;
            const resolved = Number(runtime.readSymbol(symbol.value));
            return Number.isFinite(resolved) ? resolved : 0;
        }
        if (consume('(')) {
            const result = parseAdditive();
            if (!consume(')')) throw new Error('Expected closing parenthesis.');
            return result;
        }
        throw new Error('Expected numeric expression.');
    };
    const parseUnary = () => {
        if (consume('+')) return parseUnary();
        if (consume('-')) return -parseUnary();
        return parsePrimary();
    };
    const parseMultiplicative = () => {
        let result = parseUnary();
        while (peek()?.type === '*' || peek()?.type === '/') {
            const operator = tokens[cursor].type;
            cursor += 1;
            const right = parseUnary();
            result = operator === '*' ? result * right : right === 0 ? 0 : result / right;
        }
        return result;
    };
    const parseAdditive = () => {
        let result = parseMultiplicative();
        while (peek()?.type === '+' || peek()?.type === '-') {
            const operator = tokens[cursor].type;
            cursor += 1;
            const right = parseMultiplicative();
            result = operator === '+' ? result + right : result - right;
        }
        return result;
    };
    try {
        const result = parseAdditive();
        return cursor === tokens.length && Number.isFinite(result) ? result : undefined;
    } catch { return undefined; }
}

function parseLiteral(value, runtime) {
    const raw = String(value || '').trim().replace(/[;,]$/, '');
    if (/^"(?:[^"\\]|\\.)*"$/.test(raw) || /^'(?:[^'\\]|\\.)*'$/.test(raw)) {
        return raw.slice(1, -1).replace(/\\([\\"'])/g, '$1');
    }
    if (/^(ON|TRUE)$/i.test(raw)) return 1;
    if (/^(OFF|FALSE)$/i.test(raw)) return 0;
    if (/^\[[^\]]+\]$/.test(raw)) return runtime.readSymbol(raw.slice(1, -1));
    if (/^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?$/.test(raw)) return Number(raw);
    const direct = runtime.readSymbol(raw);
    if (typeof direct === 'string') return direct;
    const numeric = evaluateNumericExpression(raw, runtime);
    if (numeric !== undefined) return numeric;
    return direct;
}

function stripComments(line) {
    return String(line || '').replace(/#.*$/, '').trim();
}

function normalizeLabel(label) {
    return String(label || '').replace(/\s+/g, '').replace(/;$/, '').toUpperCase();
}

function getLabelTarget(line) {
    const match = stripComments(line).match(/^((?:L\s*\[\s*\d+\s*\])|[A-Za-z_]\w*)\s*:/i);
    return match ? normalizeLabel(match[1]) : null;
}

function findMatching(lines, start, openName, closeName) {
    let depth = 0;
    for (let index = start; index < lines.length; index += 1) {
        const value = stripComments(lines[index]);
        if (new RegExp(`^${openName}\\b`, 'i').test(value)) depth += 1;
        if (new RegExp(`^${closeName}\\b`, 'i').test(value)) {
            depth -= 1;
            if (depth === 0) return index;
        }
    }
    return lines.length - 1;
}

function splitArguments(value) {
    const result = [];
    let start = 0;
    let depth = 0;
    String(value || '').split('').forEach((char, index) => {
        if (char === '(' || char === '[') depth += 1;
        else if (char === ')' || char === ']') depth -= 1;
        else if (char === ',' && depth === 0) {
            result.push(String(value).slice(start, index).trim());
            start = index + 1;
        }
    });
    const last = String(value || '').slice(start).trim();
    if (last) result.push(last);
    return result;
}

function parseFunctionParameters(value) {
    return splitArguments(value).map((parameter) => {
        const match = String(parameter || '').trim().match(/(?:(Bool|Byte|Int|DInt|Real|Float|Double|String)\s+)?([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*$/i);
        return match ? { name: match[2], type: match[1]?.toUpperCase() || null } : null;
    }).filter(Boolean);
}

function splitPlusExpressions(value) {
    const result = [];
    let start = 0;
    let depth = 0;
    let quote = null;
    const source = String(value || '');
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (char === '\\') index += 1;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === "'") { quote = char; continue; }
        if (char === '(' || char === '[') depth += 1;
        else if (char === ')' || char === ']') depth -= 1;
        else if (char === '+' && depth === 0) {
            result.push(source.slice(start, index).trim());
            start = index + 1;
        }
    }
    result.push(source.slice(start).trim());
    return result.filter(Boolean);
}

function formatPrintExpression(expression, runtime) {
    const parts = splitPlusExpressions(expression);
    const values = parts.map((part) => {
        const raw = part.trim();
        if (/^"(?:[^"\\]|\\.)*"$/.test(raw) || /^'(?:[^'\\]|\\.)*'$/.test(raw)) return parseLiteral(raw, runtime);
        if (runtime.variables.has(raw)) return runtime.variables.get(raw);
        const address = normalizeAddress(raw, runtime.project?.labels || {});
        if (address) return runtime.adapter.readAddress?.(address) ?? 0;
        if (/^[-+]?\d*\.?\d+$/.test(raw)) return Number(raw);
        return runtime.readSymbol(raw);
    });
    return values.map((value) => String(value ?? '')).join('');
}

function timerMilliseconds(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    return Math.max(1, seconds * 1000);
}

function zeroPose(length = 6) {
    return Array.from({ length }, () => 0);
}

function normalizePose(values, length = 6) {
    const next = zeroPose(length);
    (Array.isArray(values) ? values : []).forEach((value, index) => {
        if (index < length && Number.isFinite(Number(value))) next[index] = Number(value);
    });
    return next;
}

function addPose(left, right) {
    const length = Math.max(Array.isArray(left) ? left.length : 0, Array.isArray(right) ? right.length : 0, 6);
    return Array.from({ length }, (_, index) => Number(left?.[index] || 0) + Number(right?.[index] || 0));
}

function subtractPose(left, right) {
    const length = Math.max(Array.isArray(left) ? left.length : 0, Array.isArray(right) ? right.length : 0, 6);
    return Array.from({ length }, (_, index) => Number(left?.[index] || 0) - Number(right?.[index] || 0));
}

function splitTopLevel(value, operators = ['+', '-']) {
    const source = String(value || '').trim();
    let depth = 0;
    let quote = null;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (char === '\\') index += 1;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === "'") { quote = char; continue; }
        if (char === '(' || char === '[') depth += 1;
        else if (char === ')' || char === ']') depth -= 1;
        else if (depth === 0 && operators.includes(char)) {
            // Keep the leading sign in a numeric literal (for example X[-10]).
            if (index === 0 || /[,(]/.test(source[index - 1])) continue;
            return { left: source.slice(0, index).trim(), operator: char, right: source.slice(index + 1).trim() };
        }
    }
    return null;
}

function getPositionSymbol(value, runtime) {
    const normalized = normalizeRuntimeSymbol(value, runtime);
    const match = normalized.match(/^(JP|LP|P|PR|LPR)\s*\[\s*(-?\d+)\s*\]$/i);
    if (!match) return null;
    return { kind: match[1].toUpperCase(), index: Number(match[2]), key: `${match[1].toUpperCase()}[${Number(match[2])}]` };
}

function parseTuple(value, runtime) {
    const raw = String(value || '').trim();
    if (!raw.startsWith('(') || !raw.endsWith(')')) return null;
    const argumentsList = splitArguments(raw.slice(1, -1));
    if (!argumentsList.length) return null;
    return normalizePose(argumentsList.map((entry) => parseLiteral(entry, runtime)));
}

export class OlpRuntime {
    constructor(project, adapter = {}) {
        this.project = project;
        this.adapter = adapter;
        this.variables = new Map();
        this.variableTypes = new Map();
        this.running = false;
        this.paused = false;
        this.cancelled = false;
        this.callStack = [];
        this.positionVariables = new Map();
        this.ioGroups = new Map();
        this.pallets = new Map();
        this.stopwatches = new Map();
        this.pulseTimers = new Set();
        this.pendingMotions = new Set();
        this.motionSettings = {
            acceleration: null,
            accelerationRamp: null,
            rapidMove: null,
            slvsMode: 'OFF',
            tool: null,
            wobj: null,
            gripLoad: null
        };
        this.lastReturnValue = undefined;
        this.lastAlarm = null;
        this.lastError = null;
        this.currentFilePath = null;
        this.currentLineNumber = 0;
        this.currentLineText = '';
        this.currentCommand = '';
        this.phase = 'ready';
        this.waitCondition = '';
        this.breakRequested = false;
        this.stepMode = false;
        this.stepPermit = 0;
        this.lastProcessGateTrace = '';
        this.velocityRate = 100;
        // `Velset Rate[n]` is the controller-wide override.  `Velset [n]`
        // separately replaces V[n] on following motion commands until OFF.
        this.velocitySet = null;
        this.programs = new Map((project?.programs || []).map((program) => [program.path, program.text]));
        this.programLines = new Map([...this.programs.entries()]
            .map(([path, text]) => [path, String(text || '').split(/\r?\n/)]));
        this.functionCache = new Map();
        this.instructionCount = 0;
        this.sliceStartedAt = performance.now();
        this.activePointFile = project?.pointFiles?.find((file) => file.path?.toLowerCase().endsWith('/p.pts') || file.path?.toLowerCase() === 'p.pts')?.path
            || project?.pointFiles?.[0]?.path
            || null;
    }

    getSnapshot() {
        return {
            phase: this.phase,
            running: this.running,
            paused: this.paused,
            filePath: this.currentFilePath,
            lineNumber: this.currentLineNumber,
            lineText: this.currentLineText,
            command: this.currentCommand,
            waitCondition: this.waitCondition,
            velocityRate: this.velocityRate,
            velocitySet: this.velocitySet,
            callStack: [...this.callStack],
            error: this.lastError
        };
    }

    getLiveVelocityRate() {
        const labels = this.project?.labels || {};
        const overrideLabel = Object.keys(labels).find((label) => /^xw_?set_?speed$/i.test(label))
            || Object.keys(labels).find((label) => /(?:override|set).*speed/i.test(label));
        const overrideValue = overrideLabel ? Number(this.readSymbol(overrideLabel)) : 0;
        if (Number.isFinite(overrideValue) && overrideValue > 0) {
            return Math.max(1, Math.min(100, overrideValue));
        }
        return this.velocityRate;
    }

    getEffectiveMotionSpeed(requestedSpeed, speedMode = 'percent') {
        const requested = speedMode === 'percent' && Number.isFinite(this.velocitySet)
            ? this.velocitySet
            : Number(requestedSpeed) || 100;
        return Math.max(0.01, requested * this.getLiveVelocityRate() / 100);
    }

    notifyCursor() {
        this.adapter.cursor?.(this.getSnapshot());
    }

    async yieldExecutionSlice() {
        this.instructionCount += 1;
        if (this.instructionCount % 256 !== 0 && performance.now() - this.sliceStartedAt < 4) return;
        this.sliceStartedAt = performance.now();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    async run(entryPath = null, { singleStep = false } = {}) {
        if (this.running) return;
        const entry = entryPath || this.project?.programPath || this.project?.programFiles?.find((path) => /(^|\/)main\.pro$/i.test(path)) || this.project?.programFiles?.[0];
        if (!entry) throw new Error('The project does not contain a .pro program.');
        this.running = true;
        this.cancelled = false;
        this.paused = false;
        this.stepMode = Boolean(singleStep);
        this.stepPermit = this.stepMode ? 1 : 0;
        this.instructionCount = 0;
        this.sliceStartedAt = performance.now();
        this.phase = 'running';
        this.lastError = null;
        this.notifyCursor();
        try {
            await this.executeFile(entry, true);
            if (this.pendingMotions.size) {
                this.phase = 'draining';
                this.adapter.status?.('OLP draining pending NWait motions');
                this.notifyCursor();
                await this.awaitPendingMotions();
            }
            if (this.cancelled) return;
            this.phase = 'completed';
            this.adapter.status?.('OLP cycle completed');
        } catch (error) {
            const runtimeError = error instanceof OlpRuntimeError ? error : this.runtimeError(error?.message || 'OLP execution failed.');
            this.lastError = runtimeError.message;
            this.phase = this.cancelled ? 'stopped' : 'error';
            this.adapter.status?.(runtimeError.message);
            this.adapter.log?.(`OLP error: ${runtimeError.message}`);
            throw runtimeError;
        } finally {
            if (this.cancelled) this.phase = 'stopped';
            this.notifyCursor();
            this.running = false;
            this.paused = false;
            this.adapter.onStopped?.(this.getSnapshot());
            this.stepMode = false;
            this.stepPermit = 0;
        }
    }

    stepOnce(entryPath = null) {
        if (this.running) {
            if (!this.stepMode) {
                // A normally paused RUN can be converted into single-step
                // mode without restarting the program.
                if (!this.paused) return false;
                this.stepMode = true;
            }
            this.stepPermit += 1;
            this.paused = false;
            this.phase = 'running';
            this.notifyCursor();
            return true;
        }
        return this.run(entryPath, { singleStep: true });
    }

    stop() {
        this.cancelled = true;
        this.paused = false;
        this.stepPermit = 0;
        this.phase = 'stopping';
        this.pulseTimers.forEach((timer) => clearTimeout(timer));
        this.pulseTimers.clear();
        this.adapter.stopMotion?.(this);
        this.notifyCursor();
    }

    togglePause() {
        if (this.stepMode && this.paused) {
            // Pause/Resume from a stepped program switches back to continuous
            // execution, matching a controller's resume behavior.
            this.stepMode = false;
            this.stepPermit = 0;
            this.paused = false;
            this.phase = 'running';
            this.notifyCursor();
            this.adapter.status?.('OLP running');
            return;
        }
        this.paused = !this.paused;
        this.phase = this.paused ? 'paused' : 'running';
        this.notifyCursor();
        this.adapter.status?.(this.paused ? 'OLP paused' : 'OLP running');
    }

    async waitIfPaused() {
        while (this.paused && !this.cancelled) await new Promise((resolve) => setTimeout(resolve, 50));
        if (this.cancelled) throw new Error('OLP stopped');
    }

    async waitForExecutionPermit() {
        if (!this.stepMode) {
            await this.waitIfPaused();
            return;
        }
        while (this.stepPermit <= 0 && !this.cancelled) {
            this.paused = true;
            this.phase = 'paused';
            this.notifyCursor();
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        if (this.cancelled) throw new Error('OLP stopped');
        this.stepPermit -= 1;
        this.paused = false;
        this.phase = 'running';
        this.notifyCursor();
    }

    async waitForCondition(condition, timeoutValue = null) {
        const timeout = timeoutValue === null ? 0 : timerMilliseconds(parseLiteral(timeoutValue, this));
        const startedAt = performance.now();
        this.phase = 'waiting';
        this.waitCondition = condition;
        this.notifyCursor();
        this.adapter.log?.(`OLP waiting: ${condition}${timeout ? ` (timeout ${timeout / 1000}s)` : ''}`);
        while (!this.evaluate(condition)) {
            await this.waitForExecutionPermit();
            if (timeout && performance.now() - startedAt >= timeout) return false;
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        this.phase = 'running';
        this.waitCondition = '';
        this.notifyCursor();
        this.adapter.log?.(`OLP condition satisfied: ${condition}`);
        return true;
    }

    coerceVariableValue(symbol, value) {
        const type = getCaseInsensitive(this.variableTypes, symbol);
        if (!type) return value;
        if (String(type).toUpperCase() === 'STRING') return String(value ?? '');
        const numeric = Number(value) || 0;
        switch (String(type).toUpperCase()) {
            case 'BOOL': return numeric ? 1 : 0;
            case 'BYTE': return ((Math.trunc(numeric) % 256) + 256) % 256;
            // InoRobotLab's Int is a signed 32-bit integer, not a 16-bit word.
            case 'INT': return Math.max(-2147483648, Math.min(2147483647, Math.trunc(numeric)));
            case 'DINT': return Math.trunc(numeric);
            case 'FLOAT': return Math.fround(numeric);
            case 'REAL':
            case 'DOUBLE': return numeric;
            default: return value;
        }
    }

    declareVariable(symbol, type, initialValue = undefined) {
        const raw = normalizeRuntimeSymbol(symbol, this);
        if (!raw) return;
        this.variableTypes.set(raw, String(type || '').toUpperCase());
        if (initialValue !== undefined) this.writeSymbol(raw, initialValue);
    }

    readSymbol(symbol) {
        const source = String(symbol || '').trim();
        if (!source) return 0;
        const raw = normalizeRuntimeSymbol(source, this);
        const group = getCaseInsensitive(this.ioGroups, raw);
        if (group?.direction === 'IN') {
            return group.addresses.reduce((result, address, index) => (
                result | ((Number(this.readSymbol(address)) ? 1 : 0) << index)
            ), 0);
        }
        const direct = getCaseInsensitive(this.variables, raw) ?? getCaseInsensitive(this.variables, source);
        if (direct !== undefined) return direct;
        const typed = raw.match(/^(.+?)\.(Byte|Int|DInt|Double|Real|Float|Bool)$/i);
        if (typed) {
            const base = Number(this.readSymbol(typed[1])) || 0;
            const type = typed[2].toLowerCase();
            if (type === 'bool') return base ? 1 : 0;
            if (type === 'byte') return base & 0xff;
            if (type === 'int' || type === 'dint') return Math.trunc(base);
            return base;
        }
        const address = normalizeAddress(raw, this.project?.labels || {});
        if (address) return this.adapter.readAddress?.(address) ?? 0;
        return 0;
    }

    writeSymbol(symbol, value) {
        const source = String(symbol || '').trim();
        if (!source) return;
        const raw = normalizeRuntimeSymbol(source, this);
        const position = getPositionSymbol(raw, this);
        if (position) {
            const pose = Array.isArray(value) ? value : this.readPositionExpression(value);
            if (pose) this.positionVariables.set(position.key, normalizePose(pose, position.kind === 'JP' ? Math.max(6, pose.length) : 6));
            return;
        }
        const group = getCaseInsensitive(this.ioGroups, raw);
        if (group?.direction === 'OUT') {
            const numeric = Number(value) || 0;
            group.addresses.forEach((address, index) => this.writeSymbol(address, (numeric >> index) & 1));
            return;
        }
        const address = normalizeAddress(raw, this.project?.labels || {});
        if (address) {
            this.adapter.writeAddress?.(address, value);
            return;
        }
        this.variables.set(raw, this.coerceVariableValue(raw, value));
    }

    readPositionSymbol(symbol) {
        const position = getPositionSymbol(symbol, this);
        if (!position) return null;
        const saved = getCaseInsensitive(this.positionVariables, position.key);
        if (saved) return [...saved];
        if (position.kind === 'PR' || position.kind === 'LPR') return zeroPose();
        const kind = position.kind === 'JP' ? 'jointPoint' : 'point';
        const point = this.project?.pointRecords?.find((entry) => (
            entry.kind === kind
            && Number(entry.index) === position.index
            && (!entry.sourceSymbol || entry.sourceSymbol === position.kind)
        ));
        return point?.values ? [...point.values] : null;
    }

    findProjectPoint(expression) {
        const raw = normalizeRuntimeSymbol(String(expression || '').trim().replace(/[;,]$/, ''), this);
        const direct = this.readPositionSymbol(raw);
        if (direct) {
            const position = getPositionSymbol(raw, this);
            return { kind: position?.kind === 'JP' ? 'jointPoint' : 'point', values: direct, name: raw };
        }
        const normalized = raw.replace(/^(?:LP|JP|P)\[/i, (prefix) => prefix.slice(0, -1)).replace(/\]$/, '');
        const point = this.project?.pointRecords?.find((entry) => (
            String(entry.name || '').toLowerCase() === raw.toLowerCase()
            || String(entry.name || '').toLowerCase() === normalized.toLowerCase()
        ));
        return point?.values ? { kind: point.kind, values: [...point.values], name: point.name } : null;
    }

    readPositionExpression(expression) {
        const raw = String(expression || '').trim().replace(/[;,]$/, '');
        if (!raw) return null;
        const tuple = parseTuple(raw, this);
        if (tuple) return tuple;
        const offset = raw.match(/^Offset\s*\((.*)\)$/i);
        if (offset) {
            const argumentsList = splitArguments(offset[1]);
            const base = this.readPositionExpression(argumentsList.shift());
            if (!base) return null;
            const offsetPose = zeroPose();
            if (argumentsList.length === 1) {
                const positionOffset = this.readPositionExpression(argumentsList[0]);
                if (positionOffset) return addPose(base, positionOffset);
            }
            argumentsList.forEach((argument, index) => {
                const axis = String(argument).match(/^([XYZABC])\s*\[\s*(.+)\]$/i);
                if (axis) {
                    const axisIndex = 'XYZABC'.indexOf(axis[1].toUpperCase());
                    offsetPose[axisIndex] = Number(parseLiteral(axis[2], this)) || 0;
                } else if (index < offsetPose.length) {
                    offsetPose[index] = Number(parseLiteral(argument, this)) || 0;
                }
            });
            return addPose(base, offsetPose);
        }
        const combined = splitTopLevel(raw);
        if (combined) {
            const left = this.readPositionExpression(combined.left);
            const right = this.readPositionExpression(combined.right);
            if (left && right) return combined.operator === '+' ? addPose(left, right) : subtractPose(left, right);
        }
        return this.findProjectPoint(raw)?.values || this.readPositionSymbol(raw);
    }

    getMotionTarget(expression) {
        const raw = String(expression || '').trim();
        const point = this.findProjectPoint(raw);
        const values = this.readPositionExpression(raw);
        if (!values) return null;
        return {
            kind: point?.kind || (getPositionSymbol(raw, this)?.kind === 'JP' ? 'jointPoint' : 'point'),
            values,
            name: point?.name || raw
        };
    }

    runtimeError(message) {
        return new OlpRuntimeError(String(message || 'OLP execution failed.'), this);
    }

    evaluate(expression) {
        let value = String(expression || '').trim().replace(/[;]$/, '');
        value = value.replace(/\bThen\b\s*$/i, '').trim();
        if (!value) throw this.runtimeError('Empty condition.');
        const parenthesized = stripOuterParentheses(value);
        if (parenthesized !== value) return this.evaluate(parenthesized);
        const orParts = splitTopLevelKeyword(value, 'Or');
        if (orParts.length) return orParts.some((part) => this.evaluate(part));
        const andParts = splitTopLevelKeyword(value, 'And');
        if (andParts.length) return andParts.every((part) => this.evaluate(part));
        const not = value.match(/^Not\s+(.+)$/i) || value.match(/^!\s*(.+)$/);
        if (not) return !this.evaluate(not[1]);
        const comparison = findTopLevelComparison(value);
        if (comparison) {
            if (!comparison.left || !comparison.right) throw this.runtimeError(`Invalid comparison: ${value}`);
            const left = parseLiteral(comparison.left, this);
            const right = parseLiteral(comparison.right, this);
            switch (comparison.operator) {
                case '==':
                case '=': return left === right;
                case '!=':
                case '<>': return left !== right;
                case '>=': return left >= right;
                case '<=': return left <= right;
                case '>': return left > right;
                case '<': return left < right;
            }
        }
        return Boolean(parseLiteral(value, this));
    }

    traceProcessGate(branches, selected) {
        if (!branches?.some((branch) => /\bxwProcess_(?:work|wait)_pos\b/i.test(branch.condition || ''))) return;
        const work = this.readSymbol('xwProcess_work_pos');
        const wait = this.readSymbol('xwProcess_wait_pos');
        const active = selected?.condition || 'idle';
        const signature = `${work}:${wait}:${active}`;
        if (signature === this.lastProcessGateTrace) return;
        this.lastProcessGateTrace = signature;
        this.adapter.log?.(`OLP process gate: InW work=${work}, wait=${wait}; branch=${active}`);
    }

    findFunctions(path) {
        if (this.functionCache.has(path)) return this.functionCache.get(path);
        const lines = this.programLines.get(path) || [];
        const functions = new Map();
        lines.forEach((line, index) => {
            const match = stripComments(line).match(/^Func\s+([\w.]+)\s*\((.*)\)\s*;?$/i);
            if (!match) return;
            const end = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && /^\s*EndFunc\b/i.test(candidate));
            functions.set(match[1], {
                lines,
                start: index + 1,
                end: end >= 0 ? end : lines.length,
                parameters: parseFunctionParameters(match[2])
            });
        });
        this.functionCache.set(path, functions);
        return functions;
    }

    async executeProgramBlock(lines, start, end, path) {
        const labels = new Map();
        for (let labelIndex = start; labelIndex < end; labelIndex += 1) {
            const label = getLabelTarget(lines[labelIndex]);
            if (label) labels.set(label, labelIndex);
        }
        let cursor = start;
        let jumps = 0;
        while (cursor < end) {
            const result = await this.executeLines(lines, cursor, end, labels, path);
            if (result?.type !== 'goto') return result;
            const target = labels.get(normalizeLabel(result.target));
            if (target === undefined) {
                throw this.runtimeError(`Goto target not found: ${result.target}`);
            }
            if (jumps++ > 100000) throw new Error('OLP Goto iteration limit exceeded.');
            cursor = target;
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        return null;
    }

    async executeFile(path, startBlock = false) {
        if (!this.programLines.has(path)) throw this.runtimeError(`Program file not found: ${path}`);
        const functions = this.findFunctions(path);
        const lines = this.programLines.get(path) || [];
        const previousFilePath = this.currentFilePath;
        this.currentFilePath = path;
        try {
            if (!startBlock) {
                await this.executeProgramBlock(lines, 0, lines.length, path);
                return;
            }
            const startIndex = lines.findIndex((line) => /^\s*Start\s*;?/i.test(stripComments(line)));
            const endIndex = lines.findIndex((line, index) => index > startIndex && /^\s*End\s*;?\s*$/i.test(stripComments(line)));
            if (startIndex >= 0) await this.executeProgramBlock(lines, startIndex + 1, endIndex >= 0 ? endIndex : lines.length, path);
            else if (functions.has('main')) await this.executeFunction(path, 'main');
            else await this.executeProgramBlock(lines, 0, lines.length, path);
        } finally {
            this.currentFilePath = previousFilePath;
        }
    }

    async executeFunction(path, functionName, argumentsList = []) {
        const functions = this.findFunctions(path);
        const requested = String(functionName || '').toLowerCase();
        const entry = functions.get(functionName)
            || functions.get(functionName.split('.').at(-1))
            || [...functions.entries()].find(([name]) => String(name).toLowerCase() === requested || String(name).split('.').at(-1).toLowerCase() === requested)?.[1];
        if (!entry) throw this.runtimeError(`Function not found: ${fileName(path)}.${functionName}`);
        this.callStack.push(`${path}:${functionName}`);
        if (this.callStack.length > 32) throw new Error('OLP function call depth exceeded.');
        const parameterState = (entry.parameters || []).map((definition, index) => ({
            parameter: definition.name,
            type: definition.type,
            hadValue: this.variables.has(definition.name),
            previousValue: this.variables.get(definition.name),
            hadType: this.variableTypes.has(definition.name),
            previousType: this.variableTypes.get(definition.name),
            value: argumentsList[index] ?? 0
        }));
        parameterState.forEach(({ parameter, type, value }) => {
            if (type) this.declareVariable(parameter, type);
            this.writeSymbol(parameter, value);
        });
        this.adapter.log?.(`OLP call: ${fileName(path)}.${functionName}(${argumentsList.map((value) => String(value)).join(', ')})`);
        // Some generated projects expose a global process busy word in main.pro,
        // while the position subprogram checks its own yP{n}_{mode}_pos_busy bit.
        // Mirror that controller-side handoff so the imported project follows the
        // same path and reaches its completion branch in OLP.
        let positionBusyAddress = null;
        const positionFunction = String(functionName).split('.').at(-1).match(/^P(\d+)_pos$/i);
        if (positionFunction) {
            const mode = this.readSymbol('xwProcess_work_pos') > 0
                ? 'work'
                : this.readSymbol('xwProcess_wait_pos') > 0 ? 'wait' : null;
            if (mode) {
                const symbol = `yP${positionFunction[1]}_${mode}_pos_busy`;
                positionBusyAddress = normalizeAddress(symbol, this.project?.labels || {});
                if (positionBusyAddress) {
                    this.adapter.writeAddress?.(positionBusyAddress, 1);
                    this.adapter.log?.(`OLP process busy: ${symbol}=ON`);
                }
            }
        }
        const previousFilePath = this.currentFilePath;
        this.currentFilePath = path;
        let returnValue;
        try {
            const result = await this.executeProgramBlock(entry.lines, entry.start, entry.end, path);
            if (result?.type === 'return') returnValue = result.value;
            await this.awaitPendingMotions();
        }
        finally {
            if (positionBusyAddress) {
                // This is a runtime status output only.  Virtual Bus input
                // state remains owned by the Communication Tester.
                this.adapter.writeAddress?.(positionBusyAddress, 0);
            }
            parameterState.forEach(({ parameter, hadValue, previousValue, hadType, previousType }) => {
                if (hadValue) this.variables.set(parameter, previousValue);
                else this.variables.delete(parameter);
                if (hadType) this.variableTypes.set(parameter, previousType);
                else this.variableTypes.delete(parameter);
            });
            this.currentFilePath = previousFilePath;
            this.callStack.pop();
        }
        this.lastReturnValue = returnValue;
        return returnValue;
    }

    async awaitPendingMotions() {
        if (!this.pendingMotions.size) return;
        const pending = [...this.pendingMotions];
        await Promise.all(pending);
    }

    startMotion(motionPromise, { nwait = false } = {}) {
        const pending = Promise.resolve(motionPromise);
        if (!nwait) return pending;
        this.pendingMotions.add(pending);
        pending.then(
            () => this.pendingMotions.delete(pending),
            () => this.pendingMotions.delete(pending)
        );
        this.adapter.log?.('OLP motion started with Nwait.');
        return null;
    }

    async executeLines(lines, start, end, inheritedLabels = null, sourcePath = this.currentFilePath) {
        const labels = inheritedLabels || new Map();
        if (!inheritedLabels) {
            for (let labelIndex = start; labelIndex < end; labelIndex += 1) {
                const label = getLabelTarget(lines[labelIndex]);
                if (label) labels.set(label, labelIndex);
            }
        }

        let index = start;
        while (index < end) {
            await this.waitForExecutionPermit();
            await this.yieldExecutionSlice();
            const line = stripComments(lines[index]);
            this.currentFilePath = sourcePath || this.currentFilePath;
            this.currentLineNumber = index + 1;
            this.currentLineText = String(lines[index] || '').trim();
            this.currentCommand = line;
            this.notifyCursor();
            if (!line || /^ProgramInfo|^EndProgramInfo|^Func\b|^EndFunc\b/i.test(line)) { index += 1; continue; }
            if (/^(?:EndFor|EndWhile|EndIf|EndSwitch|ElseIf|Else|Case|Default)\b/i.test(line)) { index += 1; continue; }
            if (getLabelTarget(line)) { index += 1; continue; }

            if (/^If\b/i.test(line)) {
                const close = findMatching(lines.slice(index, end), 0, 'If', 'EndIf') + index;
                const branches = [];
                let branchStart = index + 1;
                let branchCondition = line.replace(/^If\b/i, '').trim();
                let depth = 0;
                for (let cursor = index + 1; cursor < close; cursor += 1) {
                    const candidate = stripComments(lines[cursor]);
                    if (/^If\b/i.test(candidate)) depth += 1;
                    else if (/^EndIf\b/i.test(candidate)) depth -= 1;
                    if (depth === 0 && /^ElseIf\b/i.test(candidate)) {
                        branches.push({ condition: branchCondition, start: branchStart, end: cursor });
                        branchCondition = candidate.replace(/^ElseIf\b/i, '').trim();
                        branchStart = cursor + 1;
                    } else if (depth === 0 && /^Else\b/i.test(candidate)) {
                        branches.push({ condition: branchCondition, start: branchStart, end: cursor });
                        branchCondition = null;
                        branchStart = cursor + 1;
                    }
                }
                branches.push({ condition: branchCondition, start: branchStart, end: close });
                const selected = branches.find((branch) => branch.condition === null || this.evaluate(branch.condition));
                this.traceProcessGate(branches, selected);
                const result = selected ? await this.executeLines(lines, selected.start, selected.end, labels, sourcePath) : null;
                if (result) return result;
                index = close + 1;
                continue;
            }

            if (/^For\b/i.test(line)) {
                const close = findMatching(lines.slice(index, end), 0, 'For', 'EndFor') + index;
                const argumentsList = splitArguments(line.replace(/^For\b/i, '').replace(/;$/, ''));
                const init = argumentsList[0] || '';
                const condition = argumentsList[1] || 'OFF';
                const stepMatch = String(argumentsList[2] || '').match(/^Step\s*\[\s*(.+)\s*\]$/i);
                const step = Number(parseLiteral(stepMatch?.[1] || '1', this)) || 1;
                const initMatch = init.match(/^(.+?)\s*(?:=|:=)\s*(.+)$/);
                const counter = initMatch?.[1] ? normalizeRuntimeSymbol(initMatch[1], this) : null;
                if (initMatch) this.writeSymbol(initMatch[1], parseLiteral(initMatch[2], this));
                let guard = 0;
                while (this.evaluate(condition)) {
                    if (guard++ > 100000) throw new Error('OLP For loop iteration limit exceeded.');
                    const result = await this.executeLines(lines, index + 1, close, labels, sourcePath);
                    if (result?.type === 'return') return result;
                    if (result?.type === 'goto') return result;
                    if (result?.type === 'break') break;
                    if (counter) this.writeSymbol(counter, Number(this.readSymbol(counter)) + step);
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
                index = close + 1;
                continue;
            }

            if (/^While\b/i.test(line)) {
                const close = findMatching(lines.slice(index, end), 0, 'While', 'EndWhile') + index;
                const condition = line.replace(/^While\b/i, '').replace(/;$/, '').trim();
                let guard = 0;
                while (this.evaluate(condition)) {
                    if (guard++ > 100000) throw new Error('OLP While loop iteration limit exceeded.');
                    const result = await this.executeLines(lines, index + 1, close, labels, sourcePath);
                    if (result?.type === 'return') return result;
                    if (result?.type === 'goto') return result;
                    if (result?.type === 'break') break;
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
                index = close + 1;
                continue;
            }

            if (/^Switch\b/i.test(line)) {
                const close = findMatching(lines.slice(index, end), 0, 'Switch', 'EndSwitch') + index;
                const switchValue = parseLiteral(line.replace(/^Switch\b/i, '').replace(/;$/, ''), this);
                const segments = [];
                let nested = 0;
                let activeHeader = null;
                let segmentStart = index + 1;
                for (let cursor = index + 1; cursor < close; cursor += 1) {
                    const candidate = stripComments(lines[cursor]);
                    if (/^Switch\b/i.test(candidate)) { nested += 1; continue; }
                    if (/^EndSwitch\b/i.test(candidate)) { nested -= 1; continue; }
                    if (nested !== 0) continue;
                    const caseMatch = candidate.match(/^Case\s+(.+?)\s*:?\s*$/i);
                    const isDefault = /^Default\s*:?\s*$/i.test(candidate);
                    if (!caseMatch && !isDefault) continue;
                    if (activeHeader) segments.push({ ...activeHeader, start: segmentStart, end: cursor });
                    activeHeader = caseMatch ? { type: 'case', expression: caseMatch[1] } : { type: 'default', expression: null };
                    segmentStart = cursor + 1;
                }
                if (activeHeader) segments.push({ ...activeHeader, start: segmentStart, end: close });
                const matchedIndex = segments.findIndex((segment) => {
                    if (segment.type !== 'case') return false;
                    const range = segment.expression.match(/^(.+?)\s+To\s+(.+)$/i);
                    return range
                        ? switchValue >= parseLiteral(range[1], this) && switchValue <= parseLiteral(range[2], this)
                        : parseLiteral(segment.expression, this) === switchValue;
                });
                const defaultIndex = segments.findIndex((segment) => segment.type === 'default');
                const startIndex = matchedIndex >= 0 ? matchedIndex : defaultIndex;
                if (startIndex >= 0) {
                    for (let segmentIndex = startIndex; segmentIndex < segments.length; segmentIndex += 1) {
                        const segment = segments[segmentIndex];
                        if (matchedIndex >= 0 && segment.type === 'default') break;
                        const result = await this.executeLines(lines, segment.start, segment.end, labels, sourcePath);
                        if (result?.type === 'break') break;
                        if (result) return result;
                    }
                }
                index = close + 1;
                continue;
            }

            const action = await this.executeLine(line);
            if (action?.type === 'return' || action?.type === 'break' || action?.type === 'continue') return action;
            if (action?.type === 'wait') {
                const satisfied = await this.waitForCondition(action.condition, action.timeout);
                if (!satisfied && action.target) {
                    const target = labels.get(normalizeLabel(action.target));
                    if (target !== undefined) {
                        // A timeout in a nested block may target a label outside of
                        // that block.  Bubble it up to executeProgramBlock so the
                        // destination is executed once, rather than falling through
                        // the caller's next instruction.
                        if (target < start || target >= end) return { type: 'goto', target: action.target };
                        index = target;
                        continue;
                    }
                    throw this.runtimeError(`Wait timeout target not found: ${action.target}`);
                }
                index += 1;
                continue;
            }
            if (action?.type === 'goto') {
                const target = labels.get(normalizeLabel(action.target));
                if (target !== undefined) {
                    // `Goto` in an If/For/While/Switch body can target a label in
                    // its parent program block.  Returning the action preserves the
                    // jump instead of resuming after the nested construct.
                    if (target < start || target >= end) return action;
                    index = target;
                    // A generated robot program commonly contains a permanent scan loop.
                    // Yield on every jump so the browser remains responsive and Stop/Pause
                    // can be handled without starving the event loop.
                    await new Promise((resolve) => setTimeout(resolve, 0));
                    continue;
                }
                throw this.runtimeError(`Goto target not found: ${action.target}`);
            }
            index += 1;
        }
        return null;
    }

    async executeFunctionCall(target, argumentsList) {
        const parts = String(target || '').split('.');
        if (parts.length >= 2) {
            const requested = parts[0].toLowerCase();
            const file = this.project?.programFiles?.find((path) => fileName(path).replace(/\.pro$/i, '').toLowerCase() === requested);
            if (file) return this.executeFunction(file, parts.slice(1).join('.'), argumentsList);
            throw this.runtimeError(`Program module not found: ${target}`);
        }
        if (!this.currentFilePath) throw this.runtimeError(`Function call has no active program: ${target}`);
        return this.executeFunction(this.currentFilePath, target, argumentsList);
    }

    parseOutEvent(value) {
        const match = String(value || '').match(/^Out\s*\((.*)\)$/i);
        if (!match) return null;
        const argumentsList = splitArguments(match[1]);
        if (argumentsList.length < 2) return null;
        const event = {
            address: argumentsList[0],
            value: Number(parseLiteral(argumentsList[1], this)) ? 1 : 0,
            mode: 'start',
            threshold: 0,
            fired: false
        };
        const trigger = argumentsList[2] || '';
        const timer = String(trigger).match(/^T\s*\[\s*([^\]]+)\s*\]$/i);
        const distanceRate = String(trigger).match(/^Ds\s*\[\s*([^\]]+)\s*\]$/i);
        const distance = String(trigger).match(/^S\s*\[\s*([^\]]+)\s*\]$/i);
        if (timer) { event.mode = 'time'; event.threshold = Number(parseLiteral(timer[1], this)) || 0; }
        else if (distanceRate) { event.mode = 'ratio'; event.threshold = Number(parseLiteral(distanceRate[1], this)) || 0; }
        else if (distance) { event.mode = 'distance'; event.threshold = Number(parseLiteral(distance[1], this)) || 0; }
        return event;
    }

    handleMotionProgress(options, { progress = 0, elapsedSeconds = 0, durationSeconds = 0, distance = 0 } = {}) {
        (options?.outEvents || []).forEach((event) => {
            if (event.fired) return;
            const threshold = Math.abs(Number(event.threshold) || 0);
            const remainingSeconds = Math.max(0, Number(durationSeconds) - Number(elapsedSeconds));
            const remainingDistance = Math.max(0, Number(distance) * (1 - Number(progress)));
            const shouldFire = event.mode === 'start'
                || (event.mode === 'time' && (event.threshold >= 0
                    ? elapsedSeconds >= threshold
                    : durationSeconds > 0 ? remainingSeconds <= threshold : progress >= 1))
                || (event.mode === 'ratio' && progress >= (event.threshold >= 0 ? threshold / 100 : 1 - threshold / 100))
                || (event.mode === 'distance' && (event.threshold >= 0
                    ? Number(distance) * Number(progress) >= threshold
                    : remainingDistance <= threshold));
            if (shouldFire) {
                this.writeSymbol(event.address, event.value);
                event.fired = true;
                this.adapter.log?.(`OLP motion Out: ${event.address}=${event.value}`);
            }
        });
    }

    parseMotion(value) {
        const match = String(value || '').match(/^(MovAbsJ|MovJ|MovL|MovC|JumpL|Jump)\s+(.+?)\s*;?$/i);
        if (!match) return null;
        const motion = match[1].toUpperCase();
        const argumentsList = splitArguments(match[2]);
        const targets = [];
        const options = {
            nwait: false,
            until: '',
            outEvents: [],
            zone: null,
            zoneRate: null,
            acceleration: null,
            deceleration: null,
            tool: null,
            wobj: null,
            vibrationMode: null,
            pallet: null,
            jumpHeight: null,
            rawArguments: [...argumentsList]
        };
        let speed = 100;
        options.speedMode = 'percent';
        argumentsList.forEach((argument) => {
            const raw = String(argument || '').trim();
            const velocity = raw.match(/^V\s*\[\s*([^\]]+)\s*\]$/i);
            const absoluteSpeed = raw.match(/^Speed\s*\[\s*([^\]]+)\s*\]$/i);
            const zone = raw.match(/^Z\s*\[\s*([^\]]+)\s*\]$/i);
            const zoneRate = raw.match(/^Zr\s*\[\s*([^\]]+)\s*\]$/i);
            const acceleration = raw.match(/^Acc\s*\[\s*([^\]]+)\s*\]$/i);
            const deceleration = raw.match(/^Dec\s*\[\s*([^\]]+)\s*\]$/i);
            const tool = raw.match(/^Tool\s*\[\s*([^\]]+)\s*\]$/i);
            const wobj = raw.match(/^Wobj\s*\[\s*([^\]]+)\s*\]$/i);
            const until = raw.match(/^Until\s+(.+)$/i);
            const pallet = raw.match(/^Pallet\s*\((.*)\)$/i);
            const jumpHeight = raw.match(/^(?:H|Height|Lift)\s*\[\s*([^\]]+)\s*\]$/i);
            const outEvent = this.parseOutEvent(raw);
            if (velocity) {
                speed = Number(parseLiteral(velocity[1], this)) || speed;
                options.speedMode = 'percent';
            }
            else if (absoluteSpeed) {
                speed = Number(parseLiteral(absoluteSpeed[1], this)) || speed;
                options.speedMode = 'absolute';
            }
            else if (zone) options.zone = zone[1].trim().toUpperCase();
            else if (zoneRate) options.zoneRate = Number(parseLiteral(zoneRate[1], this)) || 0;
            else if (acceleration) options.acceleration = Number(parseLiteral(acceleration[1], this)) || 0;
            else if (deceleration) options.deceleration = Number(parseLiteral(deceleration[1], this)) || 0;
            else if (tool) options.tool = Number(parseLiteral(tool[1], this)) || 0;
            else if (wobj) options.wobj = Number(parseLiteral(wobj[1], this)) || 0;
            else if (until) options.until = until[1].trim();
            else if (/^Nwait$/i.test(raw)) options.nwait = true;
            else if (/^SL(?:On|Off|Reset)$/i.test(raw)) options.vibrationMode = raw.toUpperCase();
            else if (outEvent) options.outEvents.push(outEvent);
            else if (pallet) options.pallet = splitArguments(pallet[1]);
            else if (jumpHeight) options.jumpHeight = Number(parseLiteral(jumpHeight[1], this)) || 0;
            else targets.push(raw);
        });
        if (motion === 'MOVC' && targets.length < 3) return null;
        if (motion !== 'MOVC' && !targets.length && !options.pallet) return null;
        if ((motion === 'MOVJ' || motion === 'MOVABSJ' || motion === 'JUMP') && options.speedMode === 'absolute') {
            throw new Error(`${motion} does not support Speed[n]; use V[n].`);
        }
        if ((motion === 'JUMP' || motion === 'JUMPL') && options.jumpHeight === null) {
            const legacyHeight = options.zone !== null ? Number(parseLiteral(options.zone, this)) : 0;
            options.jumpHeight = Number.isFinite(legacyHeight) && legacyHeight > 0 ? legacyHeight : 100;
        }
        if (options.pallet) {
            const palletTarget = this.resolvePalletTarget(options.pallet);
            if (palletTarget) options.targetOverride = palletTarget;
        }
        if (motion === 'MOVC') {
            options.arcTargets = targets.map((target) => ({ expression: target, targetOverride: this.getMotionTarget(target) }));
            if (options.arcTargets.some((entry) => !entry.targetOverride)) {
                throw this.runtimeError('MOVC requires three valid point targets; a true circular path was not created.');
            }
        } else if (!options.targetOverride) {
            options.targetOverride = this.getMotionTarget(targets[0]);
        }
        if (!options.targetOverride && !options.pallet) throw this.runtimeError(`Point target not found: ${targets[0] || motion}`);
        if (motion === 'MOVABSJ' && options.targetOverride && options.targetOverride.kind !== 'jointPoint') {
            // MovAbsJ also accepts an explicit joint tuple.  A cartesian P point
            // is rejected because it would silently take a different path.
            if (/^\s*\(/.test(targets[0] || '')) options.targetOverride.kind = 'jointPoint';
            else throw new Error('MovAbsJ requires JP[n] or an explicit joint tuple.');
        }
        return { motion, pointExpression: targets[0] || `Pallet(${options.pallet?.join(',') || ''})`, speed, options };
    }

    async executeMotion(command) {
        const { motion, pointExpression, speed, options } = command;
        if (!options.nwait) await this.awaitPendingMotions();
        const [globalAcceleration, globalDeceleration] = this.motionSettings.acceleration || [];
        const effectiveOptions = {
            ...options,
            acceleration: options.acceleration ?? globalAcceleration ?? null,
            deceleration: options.deceleration ?? globalDeceleration ?? null,
            accelerationRamp: this.motionSettings.accelerationRamp,
            rapidMove: this.motionSettings.rapidMove,
            slvsMode: this.motionSettings.slvsMode,
            gripLoad: this.motionSettings.gripLoad
        };
        const invoke = motion === 'JUMP' || motion === 'JUMPL'
            ? this.adapter.jump?.(motion, pointExpression, speed, this.project, this, effectiveOptions)
            : this.adapter.move?.(motion, pointExpression, speed, this.project, this, effectiveOptions);
        const started = this.startMotion(invoke, effectiveOptions);
        if (started) await started;
    }

    resolvePalletTarget(argumentsList) {
        const [noValue, rowValue, columnValue, layerValue] = argumentsList || [];
        const key = String(Math.trunc(Number(parseLiteral(noValue, this)) || 0));
        const pallet = this.pallets.get(key);
        if (!pallet) return null;
        const base = this.readPositionExpression(pallet.origin);
        const row = this.readPositionExpression(pallet.rowPoint);
        const column = this.readPositionExpression(pallet.columnPoint);
        if (!base || !row || !column) return null;
        const rowIndex = Math.max(1, Math.trunc(Number(parseLiteral(rowValue, this)) || 1));
        const columnIndex = Math.max(1, Math.trunc(Number(parseLiteral(columnValue, this)) || 1));
        const layerIndex = Math.max(1, Math.trunc(Number(parseLiteral(layerValue, this)) || 1));
        const rowSpan = Math.max(1, Number(pallet.rows) - 1);
        const columnSpan = Math.max(1, Number(pallet.columns) - 1);
        const rowDelta = subtractPose(row, base).map((entry) => entry / rowSpan);
        const columnDelta = subtractPose(column, base).map((entry) => entry / columnSpan);
        const target = addPose(addPose(base, rowDelta.map((entry) => entry * (rowIndex - 1))), columnDelta.map((entry) => entry * (columnIndex - 1)));
        target[2] += (layerIndex - 1) * Number(pallet.layerHeight || 0);
        return { kind: 'point', values: target, name: `Pallet[${key}](${rowIndex},${columnIndex},${layerIndex})` };
    }

    async executeAssignment(target, expression) {
        const variable = normalizeRuntimeSymbol(target, this);
        const rawExpression = String(expression || '').trim().replace(/;$/, '');
        const currentPosition = getPositionSymbol(variable, this);
        const currentPoseMatch = rawExpression.match(/^GetCur(J)?Pos\s*\(.*\)$/i);
        if (currentPosition && currentPoseMatch) {
            const kind = currentPoseMatch[1] ? 'jointPoint' : 'point';
            const pose = await this.adapter.getCurrentPosition?.(kind, this);
            if (pose) this.writeSymbol(variable, pose);
            return;
        }
        const distance = rawExpression.match(/^Dist\s*\((.*)\)$/i);
        if (distance) {
            const argumentsList = splitArguments(distance[1]);
            const first = this.readPositionExpression(argumentsList[0]);
            const second = this.readPositionExpression(argumentsList[1]);
            const value = first && second ? Math.hypot(...[0, 1, 2].map((index) => Number(first[index] || 0) - Number(second[index] || 0))) : 0;
            this.writeSymbol(variable, value);
            return;
        }
        const pose = currentPosition ? this.readPositionExpression(rawExpression) : null;
        if (currentPosition && pose) {
            this.writeSymbol(variable, pose);
            return;
        }
        const call = rawExpression.match(/^([\w.]+)\s*\((.*)\)$/);
        if (call && !/^(Max|Min|Offset|Dist|GetCurPos|GetCurJPos)$/i.test(call[1])) {
            const result = await this.executeFunctionCall(call[1], splitArguments(call[2]).map((argument) => parseLiteral(argument, this)));
            this.writeSymbol(variable, result ?? 0);
            return;
        }
        this.writeSymbol(variable, parseLiteral(rawExpression, this));
    }

    async executeLine(line) {
        const value = stripComments(line);
        if (!value || /^ElseIf|^Else|^EndIf|^Case|^Default|^EndSwitch|^End\s*;?\s*$/i.test(value)) return;
        const goto = value.match(/^Goto\s+(.+?)\s*;?$/i);
        if (goto) return { type: 'goto', target: goto[1] };
        const wait = value.match(/^Wait\s+(.+?)(?:,\s*T\s*\[\s*([^\]]+)\s*\])?(?:,\s*Goto\s+(.+?))?\s*;?$/i);
        if (wait) return { type: 'wait', condition: wait[1].trim(), timeout: wait[2]?.trim() || null, target: wait[3]?.trim() || null };
        if (/^Ret\s*;?\s*$/i.test(value)) return { type: 'return', value: undefined };
        const returnMatch = value.match(/^Return\s+(.+?)\s*;?$/i);
        if (returnMatch) return { type: 'return', value: parseLiteral(returnMatch[1], this) };
        if (/^Break\s*;?/i.test(value)) return { type: 'break' };
        if (/^Continue\s*;?/i.test(value)) return { type: 'continue' };

        const loadPoints = value.match(/^LoadPoints\s*\(\s*["']?([^"')]+?)["']?\s*\)\s*;?$/i);
        if (loadPoints) {
            const requested = loadPoints[1].trim();
            const matched = this.project?.pointFiles?.find((file) => fileName(file.path).toLowerCase() === fileName(requested).toLowerCase());
            if (!matched) throw this.runtimeError(`Point file not found: ${requested}`);
            this.activePointFile = matched?.path || requested;
            this.adapter.log?.(`OLP point file selected: ${fileName(this.activePointFile)}`);
            return;
        }
        const include = value.match(/^Include\s+["']?([^"';]+)["']?\s*;?$/i);
        if (include) {
            const requested = include[1].trim();
            const present = this.project?.programFiles?.some((path) => fileName(path).toLowerCase() === fileName(requested).toLowerCase());
            if (!present) throw this.runtimeError(`Included program file not found: ${requested}`);
            this.adapter.log?.(`OLP module included: ${fileName(requested)}`);
            return;
        }
        if (/^Open\s+Socket\b/i.test(value)) {
            if (!this.adapter.openSocket) throw this.runtimeError(`Unsupported OLP command without socket adapter: ${value}`);
            const resultVariable = value.match(/,\s*([A-Za-z_]\w*(?:\s*\[[^\]]+\])?)\s*\)\s*;?$/i)?.[1];
            await this.adapter.openSocket(value, this);
            if (resultVariable) this.writeSymbol(resultVariable, 1);
            return;
        }
        if (/^(?:Close\s+Socket|Send\s+|SetPortBuf|WaitInPos\s*\()/i.test(value)) {
            if (!this.adapter.socketCommand) throw this.runtimeError(`Unsupported OLP socket command: ${value}`);
            await this.adapter.socketCommand(value, this);
            return;
        }
        const print = value.match(/^Print\s+(.+?)\s*;?$/i);
        if (print) {
            this.adapter.log?.(`PRINT: ${formatPrintExpression(print[1], this)}`);
            return;
        }

        const clear = value.match(/^Clear\s+(.+?)\s*;?$/i);
        if (clear) {
            if (/^All$/i.test(clear[1])) {
                this.variables.clear();
                this.variableTypes.clear();
                this.positionVariables.clear();
                this.ioGroups.clear();
                this.pallets.clear();
                this.stopwatches.clear();
                this.motionSettings.acceleration = null;
                this.motionSettings.accelerationRamp = null;
                this.motionSettings.rapidMove = null;
                this.motionSettings.slvsMode = 'OFF';
                this.motionSettings.gripLoad = null;
        this.velocitySet = null;
            }
            this.adapter.log?.(`OLP clear: ${clear[1]}`);
            return;
        }
        const group = value.match(/^Group\s+(.+?)\s*;?$/i);
        if (group) {
            const argumentsList = splitArguments(group[1]);
            const definition = String(argumentsList.shift() || '').match(/^([IO])G\s*\[\s*([^\]]+)\s*\]$/i);
            if (!definition) throw this.runtimeError(`Unsupported Group declaration: ${value}`);
            const direction = definition[1].toUpperCase() === 'I' ? 'IN' : 'OUT';
            const index = Math.trunc(Number(parseLiteral(definition[2], this)) || 0);
            const addresses = argumentsList.slice(0, 8).map((entry) => `${direction === 'IN' ? 'In' : 'Out'}[${Math.trunc(Number(parseLiteral(entry, this)) || 0)}]`);
            this.ioGroups.set(`${direction === 'IN' ? 'IG' : 'OG'}[${index}]`, { direction, addresses });
            this.adapter.log?.(`OLP group ${direction === 'IN' ? 'IG' : 'OG'}[${index}] configured.`);
            return;
        }
        const get = value.match(/^Get\s+(.+?)\s*;?$/i);
        if (get) {
            const argumentsList = splitArguments(get[1]);
            if (argumentsList.length >= 2) this.writeSymbol(argumentsList[1], this.readSymbol(argumentsList[0]));
            return;
        }
        const pulse = value.match(/^Pulse\s+(.+?)\s*;?$/i);
        if (pulse) {
            const argumentsList = splitArguments(pulse[1]);
            const target = argumentsList[0];
            const durationMatch = String(argumentsList[1] || '').match(/^T\s*\[\s*([^\]]+)\s*\]$/i);
            const duration = timerMilliseconds(parseLiteral(durationMatch?.[1] || argumentsList[1] || '0.1', this));
            const high = /^High$/i.test(String(argumentsList[2] || ''));
            const previous = Number(this.readSymbol(target)) ? 1 : 0;
            this.writeSymbol(target, high ? 1 : (previous ? 0 : 1));
            const timer = setTimeout(() => {
                this.pulseTimers.delete(timer);
                if (!this.cancelled) this.writeSymbol(target, high ? 0 : previous);
            }, duration);
            this.pulseTimers.add(timer);
            return;
        }
        const set = value.match(/^(Set|Reset)\s+(.+?)\s*;?$/i);
        if (set) {
            const reset = /^Reset$/i.test(set[1]);
            const argumentsList = splitArguments(set[2]);
            let target = argumentsList[0] || '';
            let nextValue = reset ? 0 : 1;
            if (!reset && argumentsList.length > 1) nextValue = parseLiteral(argumentsList[1], this);
            else if (!reset) {
                const inline = target.match(/^(.+?)\s+(ON|OFF|TRUE|FALSE|1|0)$/i);
                if (inline) { target = inline[1]; nextValue = parseLiteral(inline[2], this); }
            }
            this.writeSymbol(target, nextValue);
            return;
        }

        const setAccRamp = value.match(/^SetAccRamp\s*\((.*)\)\s*;?$/i);
        if (setAccRamp) {
            const argumentsList = splitArguments(setAccRamp[1]);
            this.motionSettings.accelerationRamp = argumentsList.map((argument) => Number(parseLiteral(argument, this)) || 0);
            return;
        }
        const setAcc = value.match(/^SetAcc\s*(?:\((.*)\)|\s+(OFF))\s*;?$/i);
        if (setAcc) {
            this.motionSettings.acceleration = setAcc[2] ? null : splitArguments(setAcc[1]).map((argument) => Number(parseLiteral(argument, this)) || 0);
            return;
        }
        const rapid = value.match(/^RapidMove\s*\((.*)\)\s*;?$/i);
        if (rapid) {
            this.motionSettings.rapidMove = splitArguments(rapid[1]).map((argument) => String(argument).trim());
            return;
        }
        const slvs = value.match(/^SLVSMode\s+(.+?)\s*;?$/i);
        if (slvs) {
            this.motionSettings.slvsMode = slvs[1].trim().toUpperCase();
            return;
        }
        const velsetRate = value.match(/^Velset\s+Rate\s*\[\s*([^\]]+)\s*\]\s*;?$/i);
        const velsetValue = value.match(/^Velset\s*(?:\[\s*([^\]]+)\s*\]|([-+]?\d*\.?\d+))\s*;?$/i);
        if (velsetRate || velsetValue || /^Velset\s+OFF\s*;?$/i.test(value)) {
            if (velsetRate) {
                this.velocityRate = Math.max(1, Math.min(100, Number(parseLiteral(velsetRate[1], this)) || 100));
                this.adapter.log?.(`OLP velocity rate: ${this.velocityRate}% (${value})`);
            } else if (velsetValue) {
                this.velocitySet = Math.max(1, Math.min(100, Number(parseLiteral(velsetValue[1] || velsetValue[2], this)) || 100));
                this.adapter.log?.(`OLP V override: ${this.velocitySet}% (${value})`);
            } else {
                this.velocitySet = null;
                this.adapter.log?.('OLP V override cleared (Velset OFF).');
            }
            this.notifyCursor();
            return;
        }
        const gripLoad = value.match(/^GripLoad\s+(.+?)\s*;?$/i);
        if (gripLoad) {
            this.motionSettings.gripLoad = parseLiteral(gripLoad[1], this);
            return;
        }
        const timeStart = value.match(/^TimeStart\s*\(\s*([^\)]+)\)\s*;?$/i);
        if (timeStart) {
            this.stopwatches.set(Math.trunc(Number(parseLiteral(timeStart[1], this)) || 0), performance.now());
            return;
        }
        const timeOut = value.match(/^TimeOut\s*\(\s*([^,]+)\s*,\s*([^\)]+)\)\s*;?$/i);
        if (timeOut) {
            const index = Math.trunc(Number(parseLiteral(timeOut[1], this)) || 0);
            const elapsed = this.stopwatches.has(index) ? (performance.now() - this.stopwatches.get(index)) / 1000 : 0;
            this.writeSymbol(timeOut[2], elapsed);
            this.stopwatches.delete(index);
            return;
        }
        const alarm = value.match(/^Alarm\s*\[\s*([^\]]+)\s*\]\s*(?:,\s*(EasyGo))?\s*;?$/i);
        if (alarm) {
            const code = Math.trunc(Number(parseLiteral(alarm[1], this)) || 0);
            const easyGo = Boolean(alarm[2]);
            this.lastAlarm = { code, easyGo };
            this.adapter.alarm?.(code, easyGo, this);
            this.adapter.log?.(`OLP alarm ${code}${easyGo ? ' (EasyGo)' : ''}.`);
            if (!easyGo) throw new Error(`OLP Alarm[${code}]`);
            return;
        }
        if (/^Pause\s*;?$/i.test(value)) {
            this.paused = true;
            this.phase = 'paused';
            this.notifyCursor();
            return;
        }

        const pallet = value.match(/^Pallet\s+(.+?)\s*;?$/i);
        if (pallet) {
            const argumentsList = splitArguments(pallet[1]);
            if (argumentsList.length >= 8) {
                const key = String(Math.trunc(Number(parseLiteral(argumentsList[0], this)) || 0));
                this.pallets.set(key, {
                    origin: argumentsList[1], rowPoint: argumentsList[2], columnPoint: argumentsList[3],
                    rows: Number(parseLiteral(argumentsList[4], this)) || 1,
                    columns: Number(parseLiteral(argumentsList[5], this)) || 1,
                    layers: Number(parseLiteral(argumentsList[6], this)) || 1,
                    layerHeight: Number(parseLiteral(argumentsList[7], this)) || 0
                });
                this.adapter.log?.(`OLP pallet ${key} configured.`);
            }
            return;
        }
        const home = value.match(/^Home\s*\[\s*([^\]]+)\s*\]\s*(?:,\s*V\s*\[\s*([^\]]+)\s*\])?.*;?$/i);
        if (home) {
            await this.awaitPendingMotions();
            const homeIndex = Number(parseLiteral(home[1], this)) || 0;
            const speed = Number(parseLiteral(home[2] || '100', this)) || 100;
            if (this.adapter.home) await this.adapter.home(homeIndex, speed, this.project, this);
            else throw this.runtimeError(`Unsupported Home command: ${value}`);
            return;
        }

        const motion = this.parseMotion(value);
        if (motion) {
            await this.executeMotion(motion);
            return;
        }
        const increment = value.match(/^(Incr|Decr)\s+(.+?)\s*;?$/i);
        if (increment) {
            const delta = /^Incr$/i.test(increment[1]) ? 1 : -1;
            this.writeSymbol(increment[2], Number(this.readSymbol(increment[2])) + delta);
            return;
        }
        const declaration = value.match(/^(?:(?:Global|Local)\s+)?(Int|Real|Float|Bool|String|Byte|DInt|Double)\s+([^=;]+?)\s*;?$/i);
        if (declaration) {
            const initial = /^String$/i.test(declaration[1]) ? '' : 0;
            splitArguments(declaration[2]).forEach((target) => this.declareVariable(target, declaration[1], initial));
            return;
        }
        const assignment = value.match(/^(?:(?:Global|Local)\s+)?(?:(Int|Real|Float|Bool|String|Byte|DInt|Double)\s+)?(.+?)\s*(?:=|:=)\s*(.+?)\s*;?$/i);
        if (assignment && !/^If|^ElseIf|^Switch/i.test(value)) {
            if (assignment[1]) this.declareVariable(assignment[2], assignment[1]);
            await this.executeAssignment(assignment[2], assignment[3]);
            return;
        }
        const call = value.match(/^([\w.]+)\s*\((.*)\)\s*;?$/);
        if (call) {
            await this.executeFunctionCall(call[1], splitArguments(call[2]).map((argument) => parseLiteral(argument, this)));
            return;
        }
        const delay = value.match(/^Delay\s+(?:T\s*\[\s*([^\]]+)\s*\]|\[?\s*([^\]\s]+)\s*\]?)\s*;?$/i);
        if (delay) {
            await this.adapter.delay?.(timerMilliseconds(parseLiteral(delay[1] || delay[2], this)));
            return;
        }
        if (/^(?:SetTool|SetWobj|SetFrame|SetPayload)\b/i.test(value)) {
            throw this.runtimeError(`Unsupported configuration command: ${value}`);
        }
        throw this.runtimeError(`Unsupported OLP command: ${value}`);
    }
}

function fileName(path) {
    return String(path || '').split('/').at(-1) || '';
}

export { BIT_COUNT, BIT_START, WORD_COUNT, WORD_START, clampWord, normalizeAddress };
