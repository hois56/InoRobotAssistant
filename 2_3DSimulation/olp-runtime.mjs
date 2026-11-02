const WORD_START = 32;
const WORD_COUNT = 128;
const BIT_START = 512;
const BIT_COUNT = WORD_COUNT * 16;
export const OLP_RUNTIME_BUILD = 'R34';

export function createOlpGlobalMemory() {
    return {variables:new Map(),variableTypes:new Map(),arrayDeclarations:new Map(),positionVariables:new Map(),
        ioGroups:new Map(),pallets:new Map(),initializedDeclarations:new Set()};
}
const DECLARATION_TYPES='Int|Real|Float|Bool|String|Byte|DInt|Double';
const NO_BUILTIN=Symbol('not a native builtin');
const isModuleLocal=symbol=>/^(?:LB|LR|LD|LP|LPR|LStr)\s*\[/i.test(symbol);
const arrayBase=symbol=>String(symbol).match(/^([A-Za-z_]\w*)\s*\[/)?.[1]??null;

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
        if (['IN', 'OUT', 'INB', 'OUTB', 'INW', 'OUTW'].includes(prefix) && Number.isInteger(index) && index >= 0) {
            return { prefix, index };
        }
    }
    const raw = String(address || '').trim();
    const resolved = labels[raw]
        || Object.entries(labels).find(([label]) => label.toLowerCase() === raw.toLowerCase())?.[1]
        || raw;
    const match = resolved.match(/^(InB|OutB|InW|OutW|In|Out)\s*\[\s*(\d+)\s*\]$/i);
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
    const source=String(value||'').trim(),tokens=[];
    for(let index=0;index<source.length;) {
        const char=source[index];if(/\s/.test(char)){index++;continue;}
        const start=index;
        const number=source.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
        if(number){index+=number[0].length;tokens.push({type:'number',value:Number(number[0]),start,end:index});continue;}
        if(char==='"'||char==="'") {
            const quote=char;index++;let value='';
            while(index<source.length&&source[index]!==quote){if(source[index]==='\\'&&index+1<source.length)index++;value+=source[index++];}
            if(source[index]!==quote)return null;index++;tokens.push({type:'string',value,start,end:index});continue;
        }
        if('+-*/(),'.includes(char)){index++;tokens.push({type:char,value:char,start,end:index});continue;}
        const symbol=readExpressionToken(source,index);
        if(symbol){index=symbol.end;tokens.push({type:'symbol',value:symbol.value,start,end:index});continue;}
        return null;
    }
    return tokens;
}

function evaluateNumericExpression(value,runtime) {
    const source=String(value||'').trim(),tokens=tokenizeNumericExpression(source);
    if(!tokens?.length)return undefined;
    let cursor=0;
    const peek=()=>tokens[cursor];
    const consume=type=>{if(peek()?.type!==type)return null;return tokens[cursor++];};
    const primary=()=>{
        const literal=consume('number')||consume('string');if(literal)return literal.value;
        const symbol=consume('symbol');
        if(symbol){
            if(consume('(')) {
                const args=[],raw=[];
                if(peek()?.type!==')')do{
                    const start=tokens[cursor]?.start;
                    args.push(additive());
                    raw.push(source.slice(start,tokens[cursor-1]?.end));
                }while(consume(','));
                if(!consume(')'))throw runtime.runtimeError('Expected function closing parenthesis.');
                const result=runtime.callBuiltinSync(symbol.value,args,raw);
                if(result===NO_BUILTIN)throw runtime.runtimeError(`Unknown or asynchronous function in expression: ${symbol.value}`);
                return result;
            }
            if(/^(ON|TRUE)$/i.test(symbol.value))return 1;
            if(/^(OFF|FALSE)$/i.test(symbol.value))return 0;
            return runtime.readSymbol(symbol.value);
        }
        if(consume('(')){const result=additive();if(!consume(')'))throw runtime.runtimeError('Expected closing parenthesis.');return result;}
        throw runtime.runtimeError('Expected expression value.');
    };
    const unary=()=>consume('+')?Number(unary()):consume('-')?-Number(unary()):primary();
    const multiply=()=>{
        let result=unary();
        while(peek()?.type==='*'||peek()?.type==='/'){
            const op=tokens[cursor++].type,right=Number(unary());
            if(op==='/'&&right===0)throw runtime.runtimeError('Division by zero.');
            result=op==='*'?Number(result)*right:Number(result)/right;
        }
        return result;
    };
    const additive=()=>{
        let result=multiply();
        while(peek()?.type==='+'||peek()?.type==='-'){
            const op=tokens[cursor++].type,right=multiply();
            result=op==='+'?(typeof result==='string'||typeof right==='string'?String(result)+String(right):Number(result)+Number(right)):Number(result)-Number(right);
        }
        return result;
    };
    const result=additive();
    if(cursor!==tokens.length)return undefined;
    if(typeof result==='number'&&!Number.isFinite(result))throw runtime.runtimeError(`Non-finite expression: ${source}`);
    return result;
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
    const source=String(value||''),result=[];
    let start=0,depth=0,quote=null;
    for(let index=0;index<source.length;index++) {
        const char=source[index];
        if(quote){if(char==='\\')index++;else if(char===quote)quote=null;continue;}
        if(char==='"'||char==="'"){quote=char;continue;}
        if('([{'.includes(char))depth++;
        else if(')]}'.includes(char))depth--;
        else if(char===','&&depth===0){result.push(source.slice(start,index).trim());start=index+1;}
    }
    const last=source.slice(start).trim();if(last)result.push(last);
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
        if (address) return runtime.adapter.readAddress?.(address, runtime) ?? 0;
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

// Public robot poses use [X,Y,Z,A(yaw Z),B(pitch Y),C(roll X)] in degrees.
// Offset is rigid orientation composition; PR arithmetic remains a separate
// language operation and must not be substituted for it.
export function composeOlpOffset(base,offset,frame='WOBJ') {
    const rad=Math.PI/180;
    const rotation=pose=>{
        const [a,b,c]=pose.slice(3,6).map(value=>Number(value||0)*rad);
        const ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),cc=Math.cos(c),sc=Math.sin(c);
        return [ca*cb,ca*sb*sc-sa*cc,ca*sb*cc+sa*sc,
            sa*cb,sa*sb*sc+ca*cc,sa*sb*cc-ca*sc,-sb,cb*sc,cb*cc];
    };
    const multiply=(a,b)=>Array.from({length:9},(_,index)=>{
        const row=Math.floor(index/3),column=index%3;
        return a[row*3]*b[column]+a[row*3+1]*b[column+3]+a[row*3+2]*b[column+6];
    });
    const rb=rotation(base),ro=rotation(offset),tool=String(frame).toUpperCase()==='TOOL';
    const matrix=tool?multiply(rb,ro):multiply(ro,rb);
    // Preserve the original MatrixToEuler singular branch, including its
    // component-wise 1e-5 threshold and A=0 convention.
    const singular=Math.abs(matrix[0])<1e-5&&Math.abs(matrix[3])<1e-5;
    const negativePitch=Math.abs(matrix[6]-1)<1e-5;
    const pitch=singular?(negativePitch?-Math.PI/2:Math.PI/2):Math.atan2(-matrix[6],Math.hypot(matrix[0],matrix[3]));
    const yaw=singular?0:Math.atan2(matrix[3],matrix[0]);
    const roll=singular?Math.atan2((negativePitch?-1:1)*matrix[1],matrix[4]):Math.atan2(matrix[7],matrix[8]);
    const xyz=tool?[0,1,2].map(i=>Number(base[i]||0)+rb[i*3]*Number(offset[0]||0)+rb[i*3+1]*Number(offset[1]||0)+rb[i*3+2]*Number(offset[2]||0))
        :[0,1,2].map(i=>Number(base[i]||0)+Number(offset[i]||0));
    return [...xyz,yaw/rad,pitch/rad,roll/rad];
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
        // Optional offline debug guard. Native generated programs include
        // permanent scan loops; normal execution has no iteration count cap.
        if (adapter.maxLoopIterations !== undefined && adapter.maxLoopIterations !== Infinity
            && (!Number.isInteger(adapter.maxLoopIterations) || adapter.maxLoopIterations <= 0)) {
            throw new TypeError('maxLoopIterations must be a positive integer or Infinity.');
        }
        this.maxLoopIterations = adapter.maxLoopIterations ?? Infinity;
        this.globalMemory = adapter.globalMemory || adapter.memory || createOlpGlobalMemory();
        for (const name of ['variables','variableTypes','arrayDeclarations','positionVariables','ioGroups','pallets'])
            this.globalMemory[name] ||= new Map();
        this.globalMemory.initializedDeclarations ||= new Set();
        this.variables = this.globalMemory.variables;
        this.variableTypes = this.globalMemory.variableTypes;
        this.arrayDeclarations = this.globalMemory.arrayDeclarations;
        this.localsByModule = new Map();
        this.functionScopes = [];
        this.running = false;
        this.paused = false;
        this.cancelled = false;
        this.abortController = new AbortController();
        this.callStack = [];
        this.positionVariables = this.globalMemory.positionVariables;
        this.ioGroups = this.globalMemory.ioGroups;
        this.pallets = this.globalMemory.pallets;
        this.stopwatches = new Map();
        this.pulseTimers = new Set();
        this.pendingMotions = new Set();
        this.stopMoveQueue = null;
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
        // Main's interpolation adapters mark work that can resume in place.
        // A STEP resumes that current movement, rather than also granting
        // the following queued movement a second physical dispatch.
        this.activeInterpolatedMotions = 0;
        this.globalMemory.velocityRate ??= 100;
        // `Velset Rate[n]` is the controller-wide override.  `Velset [n]`
        // separately replaces V[n] on following motion commands until OFF.
        this.velocitySet = null;
        this.programs = new Map((project?.programs || []).map((program) => [program.path, program.text]));
        this.programLines = new Map([...this.programs.entries()]
            .map(([path, text]) => [path, String(text || '').split(/\r?\n/)]));
        this.functionCache = new Map();
        this.instructionCount = 0;
        this.sliceStartedAt = performance.now();
        this.globalMemory.activePointFile ??= project?.pointFiles?.find((file) => file.path?.toLowerCase().endsWith('/p.pts') || file.path?.toLowerCase() === 'p.pts')?.path
            || project?.pointFiles?.[0]?.path
            || null;
        this.globalMemory.currentPointsFileName ??= fileName(this.activePointFile || '');
    }

    get activePointFile() {return this.globalMemory.activePointFile??null;}
    set activePointFile(path) {this.globalMemory.activePointFile=path;}

    refreshProgramSources() {
        const nextPrograms = new Map((this.project?.programs || [])
            .filter((program) => program?.path)
            .map((program) => [program.path, String(program.text || '')]));
        let changed = nextPrograms.size !== this.programs.size;
        nextPrograms.forEach((text, path) => {
            if (this.programs.get(path) === text) return;
            this.programs.set(path, text);
            const lines = text.split(/\r?\n/);
            const currentLines = this.programLines.get(path);
            if (currentLines) currentLines.splice(0, currentLines.length, ...lines);
            else this.programLines.set(path, lines);
            changed = true;
        });
        [...this.programs.keys()].forEach((path) => {
            if (nextPrograms.has(path)) return;
            this.programs.delete(path);
            this.programLines.delete(path);
            changed = true;
        });
        if (changed) this.functionCache.clear();
        return changed;
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

    get velocityRate() {return this.globalMemory.velocityRate??100;}
    set velocityRate(value) {this.globalMemory.velocityRate=value;}

    scanRemoteVelocityInput() {
        // Native input function 8296 is a changed-word trigger in Remote IO
        // automatic mode. Labels do not select controller functions.
        const mapping=this.project?.remoteIoMapping?.find(entry=>entry?.ioType===0&&entry?.funcId===8296
            &&entry?.mapped!==false&&entry?.length===16&&Number.isInteger(entry?.memAddr)
            &&entry.memAddr>=0&&entry.memAddr%16===0);
        if(!mapping||!this.adapter.getControllerExecutionMode||!this.adapter.readAddress)return;
        const key=String(mapping.memAddr);
        let cached=this.globalMemory.remoteVelocityInput;
        if(!cached||cached.key!==key)cached=this.globalMemory.remoteVelocityInput={
            key,previousWord:0,changed:false,controlMode:null,remoteManual:false};
        const mode=this.adapter.getControllerExecutionMode(this);
        const controlMode=mode?.controlMode??null,remoteManual=Boolean(mode?.remoteManual);
        const enteredRemote=controlMode===3&&cached.controlMode!==3;
        cached.controlMode=controlMode;cached.remoteManual=remoteManual;
        // No implicit controller mode is inferred from project labels or maps.
        if(controlMode!==3||remoteManual)return;
        const value=Number(this.adapter.readAddress({prefix:'INW',index:mapping.memAddr/16},this));
        if(!Number.isFinite(value))return;
        const word=Math.trunc(value)&0xffff;
        const changed=word!==cached.previousWord;
        const trigger=changed||cached.changed&&enteredRemote;
        cached.previousWord=word;
        if(changed)cached.changed=true;
        // BusInst_VelSet rejects invalid mapped words; it does not clamp them.
        if(trigger&&word>=1&&word<=100)this.velocityRate=word;
    }

    getLiveVelocityRate() {
        this.scanRemoteVelocityInput();
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
        // A scheduler wait is not CPU work in the next slice. In particular,
        // a coarse Windows zero-delay timer must not trigger another yield.
        this.sliceStartedAt = performance.now();
    }

    async run(entryPath = null, { singleStep = false } = {}) {
        if (this.running) return;
        const entry = entryPath || this.project?.programPath || this.project?.programFiles?.find((path) => /(^|\/)main\.pro$/i.test(path)) || this.project?.programFiles?.[0];
        if (!entry) throw new Error('The project does not contain a .pro program.');
        this.running = true;
        this.cancelled = false;
        this.abortController = new AbortController();
        this.paused = false;
        this.stepMode = Boolean(singleStep);
        this.stepPermit = this.stepMode ? 1 : 0;
        this.instructionCount = 0;
        this.sliceStartedAt = performance.now();
        this.phase = 'running';
        this.lastError = null;
        this.notifyCursor();
        try {
            await this.initializeDeclarations();
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
            if (!this.cancelled && !/^OLP stopped/i.test(runtimeError.message)) {
                this.adapter.log?.(`OLP error: ${runtimeError.message}`);
            }
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
            const resumesCurrentMotion = this.paused && this.activeInterpolatedMotions > 0;
            if (!this.stepMode) {
                // A normally paused RUN can be converted into single-step
                // mode without restarting the program.
                if (!this.paused) return false;
                this.stepMode = true;
            }
            if (!resumesCurrentMotion) this.stepPermit += 1;
            this.paused = false;
            this.phase = 'running';
            this.notifyCursor();
            return true;
        }
        return this.run(entryPath, { singleStep: true });
    }

    stop() {
        this.abortController.abort();
        this.cancelled = true;
        if (this.stopMoveQueue) this.stopMoveQueue.cancelled = true;
        this.paused = false;
        this.stepPermit = 0;
        this.phase = 'stopping';
        this.pulseTimers.forEach((timer) => clearTimeout(timer));
        this.pulseTimers.clear();
        this.adapter.stopMotion?.(this);
        this.notifyCursor();
    }

    togglePause() {
        if (this.stopMoveQueue) this.stopMoveQueue.resetClockAfterPause = true;
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

    async awaitKnownWait(pending) {
        // Invoke external services before entering here, so their synchronous
        // work remains part of the CPU budget. Only the awaited interval is
        // excluded from the next cooperative slice; wall-clock timers retain it.
        const started = performance.now();
        try { return await pending; }
        finally {
            const finished = performance.now();
            if (finished - started >= 4) this.sliceStartedAt = finished;
        }
    }

    async waitIfPaused() {
        while (this.paused && !this.cancelled) await this.awaitKnownWait(new Promise((resolve) => setTimeout(resolve, 50)));
        if (this.cancelled) throw new Error('OLP stopped');
    }

    async waitForExecutionPermit({ queuedMotion = false } = {}) {
        if (this.paused && this.stopMoveQueue) this.stopMoveQueue.resetClockAfterPause = true;
        if (!this.stepMode) {
            await this.waitIfPaused();
            if (!this.stepMode) return;
        }
        // Already scanned physical tasks own the permits before new source lines.
        if (!queuedMotion && this.stopMoveQueue) await this.drainStopMoveQueue();
        while (this.stepMode && this.stepPermit <= 0 && !this.cancelled) {
            this.paused = true;
            this.phase = 'paused';
            this.notifyCursor();
            await this.awaitKnownWait(new Promise((resolve) => setTimeout(resolve, 50)));
        }
        if (this.cancelled) throw new Error('OLP stopped');
        if (this.stepMode) this.stepPermit -= 1;
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
        while (!this.evaluate(condition)) {
            // A Wait is one instruction. Polling an unfinished instruction
            // must not consume additional STEP permits.
            await this.waitIfPaused();
            if (timeout && performance.now() - startedAt >= timeout) return false;
            await this.awaitKnownWait(new Promise((resolve) => setTimeout(resolve, 20)));
        }
        this.phase = 'running';
        this.waitCondition = '';
        this.notifyCursor();
        return true;
    }

    async waitForDelay(milliseconds) {
        const duration=Number(milliseconds);
        if(!Number.isFinite(duration)||duration<0)throw this.runtimeError('Delay requires a nonnegative finite duration.');
        if(this.cancelled)throw this.runtimeError('OLP stopped');
        if(this.adapter.delay) {
            const signal=this.abortController.signal;
            let abort;
            const cancelled=new Promise((_,reject)=>{
                abort=()=>reject(this.runtimeError('OLP stopped'));
                signal.addEventListener('abort',abort,{once:true});
            });
            try {await this.awaitKnownWait(Promise.race([Promise.resolve(this.adapter.delay(duration,this,{signal})),cancelled]));}
            finally {signal.removeEventListener('abort',abort);}
        } else {
            const end=performance.now()+duration;
            do {
                await this.waitIfPaused();
                const remaining=end-performance.now();if(remaining<=0)break;
                await this.awaitKnownWait(new Promise(resolve=>setTimeout(resolve,Math.min(20,remaining))));
            } while(true);
        }
        if(this.cancelled)throw this.runtimeError('OLP stopped');
    }


    moduleBank(path=this.currentFilePath || this.project?.programPath || this.project?.programFiles?.[0] || '') {
        if (!this.localsByModule.has(path)) this.localsByModule.set(path,{variables:new Map(),variableTypes:new Map(),arrayDeclarations:new Map(),positionVariables:new Map()});
        return this.localsByModule.get(path);
    }

    resolveAlias(symbol) {
        let value=String(symbol||'').trim();
        for(let i=0;i<16;i++) {
            const key=Object.keys(this.project?.labels||{}).find(key=>key.toLowerCase()===value.toLowerCase());
            const next=key?this.project.labels[key]:null;
            if(typeof next!=='string'||next.toLowerCase()===value.toLowerCase())break;
            value=next;
        }
        return normalizeRuntimeSymbol(value,this);
    }

    variableBank(symbol) {
        const base=arrayBase(symbol);
        const scope=this.functionScopes.at(-1);
        if(scope&&(getCaseInsensitive(scope.variableTypes,symbol)!==undefined||(base&&getCaseInsensitive(scope.arrayDeclarations,base))))return scope;
        if(isModuleLocal(symbol))return this.moduleBank();
        const local=this.moduleBank();
        if(getCaseInsensitive(local.variableTypes,symbol)!==undefined||(base&&getCaseInsensitive(local.arrayDeclarations,base)))return local;
        return this.globalMemory;
    }

    coerceVariableValue(symbol,value,bank=this.variableBank(symbol)) {
        const type=getCaseInsensitive(bank.variableTypes,symbol)||getCaseInsensitive(bank.arrayDeclarations,arrayBase(symbol))?.type;
        if(!type)return value;
        if(type==='STRING')return String(value??'');
        const numeric=Number(value)||0;
        switch(type) {
            case 'BOOL':return numeric?1:0;
            case 'BYTE':return ((Math.trunc(numeric)%256)+256)%256;
            case 'INT':return Math.max(-2147483648,Math.min(2147483647,Math.trunc(numeric)));
            case 'DINT':return Math.trunc(numeric);
            case 'FLOAT':return Math.fround(numeric);
            default:return numeric;
        }
    }

    declareVariable(symbol,type,initialValue=undefined,storage=null) {
        const raw=this.resolveAlias(symbol),name=String(type||'').toUpperCase();
        const bank=storage==='GLOBAL'?this.globalMemory:this.functionScopes.at(-1)||this.moduleBank();
        const dimensions=[...raw.matchAll(/\[\s*(\d+)\s*\]/g)].map(match=>Number(match[1]));
        if(dimensions.length) {
            const base=arrayBase(raw);
            if(!base||dimensions.some(n=>!Number.isInteger(n)||n<0))throw this.runtimeError(`Invalid array declaration: ${raw}`);
            const total=dimensions.reduce((product,n)=>product*n,1);
            if(total>1_000_000)throw this.runtimeError('Declared array exceeds the offline runtime memory limit.');
            bank.arrayDeclarations.set(base,{type:name,dimensions});
            const flatten=value=>Array.isArray(value)?value.flatMap(flatten):[value];
            const values=initialValue===undefined?[]:flatten(initialValue);
            if(values.length>total)throw this.runtimeError(`Too many array initializer values: ${raw}`);
            for(let i=0;i<total;i++) {
                let remainder=i;
                const indexes=dimensions.map((n,index)=>{
                    const stride=dimensions.slice(index+1).reduce((a,b)=>a*b,1);
                    const coordinate=Math.floor(remainder/stride);remainder%=stride;return coordinate;
                });
                const key=base+indexes.map(i=>`[${i}]`).join('');
                bank.variables.set(key,this.coerceVariableValue(key,values[i]??(name==='STRING'?'':0),bank));
            }
        } else {
            bank.variableTypes.set(raw,name);
            bank.variables.set(raw,this.coerceVariableValue(raw,initialValue??(name==='STRING'?'':0),bank));
        }
    }

    parseDeclaration(line) {
        const match=String(line).match(new RegExp(`^(?:(Global|Local)\\s+)?(${DECLARATION_TYPES})\\s+(.+?)\\s*;?$`,'i'));
        if(!match)return null;
        return {storage:match[1]?.toUpperCase()||null,type:match[2],entries:splitArguments(match[3].replace(/;$/,''))};
    }

    async executeDeclaration(definition) {
        for(const entry of definition.entries) {
            const equal=findTopLevelOperator(entry,['=']);
            const target=(equal<0?entry:entry.slice(0,equal)).trim();
            const expression=equal<0?null:entry.slice(equal+1).trim();
            if(!/^[A-Za-z_]\w*(?:\s*\[[^\]]+\])*$/i.test(target))throw this.runtimeError(`Invalid declaration: ${target}`);
            const raw=normalizeRuntimeSymbol(target,this);
            const parseInitializer=text=>{
                const source=String(text).trim();
                return source.startsWith('{')&&source.endsWith('}')?splitArguments(source.slice(1,-1)).map(parseInitializer):parseLiteral(source,this);
            };
            let initial;
            if(expression?.startsWith('{'))initial=parseInitializer(expression);
            else if(expression!==null)initial=await this.evaluateAssignmentValue(expression);
            this.declareVariable(raw,definition.type,initial,definition.storage);
        }
    }

    async initializeDeclarations() {
        const previous=this.currentFilePath;
        try {
            for(const [path,lines]of this.programLines) {
                this.currentFilePath=path;
                let inFunction=false,inProgram=false,inInfo=false;
                for(let index=0;index<lines.length;index++) {
                    const line=stripComments(lines[index]);
                    if(/^ProgramInfo\b/i.test(line)){inInfo=true;continue;}
                    if(/^EndProgramInfo\b/i.test(line)){inInfo=false;continue;}
                    if(/^Func\b/i.test(line)){inFunction=true;continue;}
                    if(/^EndFunc\b/i.test(line)){inFunction=false;continue;}
                    if(/^Start\b/i.test(line)){inProgram=true;continue;}
                    if(/^End\s*;?$/i.test(line)){inProgram=false;continue;}
                    if(inFunction||inProgram||inInfo)continue;
                    const declaration=this.parseDeclaration(line);
                    if(!declaration)continue;
                    const key=`${path}:${index}:${line}`;
                    if(declaration.storage==='GLOBAL'&&this.globalMemory.initializedDeclarations.has(key))continue;
                    await this.executeDeclaration(declaration);
                    if(declaration.storage==='GLOBAL')this.globalMemory.initializedDeclarations.add(key);
                }
            }
        } finally {this.currentFilePath=previous;}
    }

    typedIo(symbol) {
        const match=String(symbol).match(/^(.+?)\.(Byte|Int|DInt|Double|Real|Float|Bool)$/i);
        if(!match)return null;
        const address=normalizeAddress(this.resolveAlias(match[1]),this.project?.labels||{});
        return address?{address,type:match[2].toUpperCase()}:null;
    }

    readTypedIo({address,type}) {
        const widths={BYTE:1,BOOL:1,INT:4,DINT:4,FLOAT:4,REAL:8,DOUBLE:8};
        const width=widths[type],buffer=new ArrayBuffer(8),data=new DataView(buffer);
        if(!/W$/.test(address.prefix))throw this.runtimeError('Typed I/O views require a word address.');
        for(let offset=0;offset<width;offset+=2)data.setUint16(offset,Number(this.adapter.readAddress?.({...address,index:address.index+offset/2},this)??0)&0xffff,true);
        switch(type) {
            case 'BYTE':return data.getUint8(0);
            case 'BOOL':return data.getUint8(0)?1:0;
            case 'INT':case 'DINT':return data.getInt32(0,true);
            case 'FLOAT':return data.getFloat32(0,true);
            default:return data.getFloat64(0,true);
        }
    }

    readSymbol(symbol) {
        const source=String(symbol||'').trim();if(!source)return 0;
        const raw=this.resolveAlias(source),typed=this.typedIo(raw);
        if(typed)return this.readTypedIo(typed);
        const group=getCaseInsensitive(this.ioGroups,raw);
        if(group?.direction==='IN')return group.addresses.reduce((result,address,index)=>result|((Number(this.readSymbol(address))?1:0)<<index),0);
        const bank=this.variableBank(raw),direct=getCaseInsensitive(bank.variables,raw);
        if(direct!==undefined)return direct;
        const field=raw.match(/^(.+)\.([XYZABC])$/i);
        if(field){const pose=this.readPositionSymbol(field[1]);if(pose)return pose['XYZABC'.indexOf(field[2].toUpperCase())]??0;}
        const cast=raw.match(/^(.+?)\.(Byte|Int|DInt|Double|Real|Float|Bool)$/i);
        if(cast){const number=Number(this.readSymbol(cast[1]))||0;return /bool/i.test(cast[2])?Number(Boolean(number)):/byte/i.test(cast[2])?number&255:/int/i.test(cast[2])?Math.trunc(number):number;}
        const address=normalizeAddress(raw,this.project?.labels||{});
        if(address)return this.adapter.readAddress?.(address,this)??0;
        return 0;
    }

    writeSymbol(symbol,value) {
        const source=String(symbol||'').trim();if(!source)return;
        const raw=this.resolveAlias(source),position=this.resolvePositionReference(raw);
        if(position) {
            const pose=Array.isArray(value)?value:this.readPositionExpression(value);
            if(!pose)throw this.runtimeError(`Invalid position value: ${raw}`);
            const positions=isModuleLocal(position.key)?this.moduleBank().positionVariables:this.positionVariables;
            positions.set(position.key,normalizePose(pose,position.kind==='JP'?Math.max(6,pose.length):6));return;
        }
        const typed=this.typedIo(raw);
        if(typed) {
            const {address,type}=typed,buffer=new ArrayBuffer(8),data=new DataView(buffer);
            if(!/W$/.test(address.prefix))throw this.runtimeError('Typed I/O views require a word address.');
            const width=/^(BYTE|BOOL)$/.test(type)?1:/^(INT|DINT|FLOAT)$/.test(type)?4:8;
            if(width===1)data.setUint8(0,type==='BOOL'?Number(Boolean(value)):Number(value));
            else if(type==='INT'||type==='DINT')data.setInt32(0,Number(value),true);
            else if(type==='FLOAT')data.setFloat32(0,Number(value),true);else data.setFloat64(0,Number(value),true);
            for(let offset=0;offset<width;offset+=2){let word=data.getUint16(offset,true);if(width===1)word=(Number(this.adapter.readAddress?.(address,this)??0)&0xff00)|data.getUint8(0);this.adapter.writeAddress?.({...address,index:address.index+offset/2},word,this);}return;
        }
        const group=getCaseInsensitive(this.ioGroups,raw);
        if(group?.direction==='OUT'){group.addresses.forEach((address,index)=>this.writeSymbol(address,((Number(value)||0)>>index)&1));return;}
        const address=normalizeAddress(raw,this.project?.labels||{});
        if(address){this.adapter.writeAddress?.(address,value,this);return;}
        const bank=this.variableBank(raw);bank.variables.set(raw,this.coerceVariableValue(raw,value,bank));
    }

    getToolOverrides(index) {
        const prefix = `TOOL[${index}].`;
        const fields = new Map();
        for (const [symbol, value] of this.variables) {
            const key = String(symbol).replace(/\s+/g, '').toUpperCase();
            if (key.startsWith(prefix)) fields.set(key.slice(prefix.length), value);
        }
        const read = (field) => {
            if (!fields.has(field)) return undefined;
            const number = Number(fields.get(field));
            if (!Number.isFinite(number)) throw this.runtimeError(`Invalid Tool[${index}].${field}`);
            return number;
        };
        const frame = {position: ['X','Y','Z'].map(axis => read(`TFRAME.${axis}`)),
            rotation: ['C','B','A'].map(axis => read(`TFRAME.${axis}`))};
        const load = {mass: read('TLOAD.MASS'),
            cog: [0,1,2].map(axis => read(`TLOAD.COG[${axis}]`)),
            inertia: [0,1,2].map(axis => read(`TLOAD.INERTIA[${axis}]`))};
        return [...frame.position, ...frame.rotation, load.mass, ...load.cog, ...load.inertia]
            .some(value => value !== undefined) ? {frame, load} : null;
    }

    getPointRecordsForActiveFile() {
        const activePointFileName = this.activePointFile ? fileName(this.activePointFile).toLowerCase() : '';
        const activePointRecords = activePointFileName
            ? this.project?.pointFiles?.find((file) => fileName(file.path).toLowerCase() === activePointFileName)?.records || []
            : [];
        return [
            ...activePointRecords,
            ...(this.project?.pointRecords || []).filter((entry) => !activePointRecords.includes(entry))
        ];
    }


    resolvePositionReference(symbol) {
        const raw=this.resolveAlias(symbol),direct=getPositionSymbol(raw,this);
        if(direct)return direct;
        const record=(this.project?.pointRecords||[]).find(record=>String(record.name||'').toLowerCase()===raw.toLowerCase());
        if(!record)return null;
        const kind=record.sourceSymbol||(record.kind==='jointPoint'?'JP':'P');
        return {kind,index:Number(record.index),key:`${kind}[${Number(record.index)}]`};
    }

    readPositionSymbol(symbol) {
        const position=this.resolvePositionReference(symbol);if(!position)return null;
        const positions=isModuleLocal(position.key)?this.moduleBank().positionVariables:this.positionVariables;
        const saved=getCaseInsensitive(positions,position.key);if(saved)return [...saved];
        if(position.kind==='PR'||position.kind==='LPR')return zeroPose();
        const kind=position.kind==='JP'?'jointPoint':'point';
        const point=this.getPointRecordsForActiveFile().find(entry=>entry.kind===kind&&Number(entry.index)===position.index&&(!entry.sourceSymbol||entry.sourceSymbol===position.kind));
        return point?.values?[...point.values]:null;
    }

    findProjectPoint(expression) {
        const raw = normalizeRuntimeSymbol(String(expression || '').trim().replace(/[;,]$/, ''), this);
        const offsetMatch = raw.match(/^Offset\s*\(\s*([^,]+?)(?:\s*,\s*[^\)]+)?\s*\)$/i);
        if (offsetMatch) {
            const basePoint = this.findProjectPoint(offsetMatch[1]);
            return basePoint ? { ...basePoint, name: raw } : null;
        }
        const records = this.getPointRecordsForActiveFile();
        const direct = this.readPositionSymbol(raw);
        if (direct) {
            const position = this.resolvePositionReference(raw);
            const kind = position?.kind === 'JP' ? 'jointPoint' : 'point';
            const record = position
                ? records.find((entry) => entry.kind === kind
                    && Number(entry.index) === position.index
                    && (!entry.sourceSymbol || entry.sourceSymbol === position.kind))
                : null;
            return { ...(record || {}), kind, values: direct, name: record?.name || raw };
        }
        const normalized = raw.replace(/^(?:LP|JP|P)\[/i, (prefix) => prefix.slice(0, -1)).replace(/\]$/, '');
        const point = records.find((entry) => (
            String(entry.name || '').toLowerCase() === raw.toLowerCase()
            || String(entry.name || '').toLowerCase() === normalized.toLowerCase()
        ));
        return point?.values ? { ...point, values: [...point.values], name: point.name } : null;
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
            if (argumentsList.length >= 1) {
                const positionOffset = this.readPositionExpression(argumentsList[0]);
                if (positionOffset) {
                    const frame=String(argumentsList[1]||'WOBJ').trim().toUpperCase();
                    if(!['WOBJ','TOOL'].includes(frame))throw this.runtimeError(`Unsupported Offset frame: ${frame}`);
                    return composeOlpOffset(base,positionOffset,frame);
                }
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
            return composeOlpOffset(base,offsetPose);
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
            ...(point || {}),
            kind: point?.kind || (getPositionSymbol(raw, this)?.kind === 'JP' ? 'jointPoint' : 'point'),
            values,
            name: point?.name || raw
        };
    }

    peekNextMotion() {
        const lines = this.programLines.get(this.currentFilePath) || [];
        // currentLineNumber is one-based, so it is also the next line's array index.
        for (let index = this.currentLineNumber; index < lines.length; index += 1) {
            const rawLine = String(lines[index] || '').trim();
            if (!rawLine || rawLine.startsWith('//')) continue;
            const line = stripComments(rawLine).trim();
            if (!line) continue;
            return this.parseMotion(line);
        }
        return null;
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

    findFunctions(path) {
        if (this.functionCache.has(path)) return this.functionCache.get(path);
        const lines = this.programLines.get(path) || [];
        const functions = new Map();
        lines.forEach((line, index) => {
            const match = stripComments(line).match(/^Func\s+(?:(Int|Real|Float|Bool|String|Byte|DInt|Double)\s+)?([\w.]+)\s*\((.*)\)\s*;?$/i);
            if (!match) return;
            const end = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && /^\s*EndFunc\b/i.test(candidate));
            functions.set(match[2], {
                lines,
                start: index + 1,
                end: end >= 0 ? end : lines.length,
                returnType: match[1]?.toUpperCase() || null, parameters: parseFunctionParameters(match[3])
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
            if (jumps++ >= this.maxLoopIterations) throw new Error('OLP configured Goto iteration limit exceeded.');
            cursor = target;
            // executeLines budgets each destination instruction; do not add a
            // wall-clock delay for the jump itself.
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
        const scope={variables:new Map(),variableTypes:new Map(),arrayDeclarations:new Map(),positionVariables:new Map()};
        this.functionScopes.push(scope);
        for(const [index,definition]of (entry.parameters||[]).entries())
            this.declareVariable(definition.name,definition.type||'Double',argumentsList[index]??0);
        const previousFilePath = this.currentFilePath;
        this.currentFilePath = path;
        let returnValue;
        try {
            const result = await this.executeProgramBlock(entry.lines, entry.start, entry.end, path);
            if (result?.type === 'return') returnValue = entry.returnType
                ? this.coerceVariableValue('$return',result.value,{variableTypes:new Map([['$return',entry.returnType]]),arrayDeclarations:new Map()})
                : result.value;
            await this.awaitPendingMotions();
        }
        finally {
            this.functionScopes.pop();
            this.currentFilePath = previousFilePath;
            this.callStack.pop();
        }
        this.lastReturnValue = returnValue;
        return returnValue;
    }

    isStopMoveQueueCommand(command) {
        const options = command?.options;
        return this.adapter.queueStopMoves === true && !this.stepMode
            && this.motionSettings.rapidMove?.ptp === true
            && ['MOVJ', 'MOVABSJ'].includes(command?.motion)
            && options?.zone !== null && options?.zone !== undefined
            && String(options.zone).trim() !== '' && Number(options.zone) === 0
            && !options.nwait && !options.until && !options.outEvents?.length
            && options.vibrationMode == null && options.zoneRate == null;
    }

    stopMoveQueueKey(command) {
        return JSON.stringify([command.options.tool ?? this.motionSettings.tool, command.options.wobj ?? this.motionSettings.wobj]);
    }

    stopMoveQueueCandidate(line) {
        try { return this.parseMotion(line); } catch { return null; }
    }

    canContinueStopMoveQueue(command) {
        return this.isStopMoveQueueCommand(command)
            && (!this.stopMoveQueue || this.stopMoveQueue.key === this.stopMoveQueueKey(command));
    }

    async drainStopMoveQueue() {
        const group = this.stopMoveQueue;
        if (!group) return;
        const waitStarted = performance.now();
        try {
            await group.tail;
            if (group.error) throw group.error;
        } finally {
            if (performance.now() - waitStarted >= 4) this.sliceStartedAt = performance.now();
            if (this.stopMoveQueue === group) this.stopMoveQueue = null;
        }
    }

    async enqueueStopMove(command, effectiveOptions) {
        let group = this.stopMoveQueue;
        if (!group) {
            group = { tail: null, timing: { nextStartAt: NaN }, tasks: new Set(),
                key: this.stopMoveQueueKey(command), error: null, cancelled: false,
                resetClockAfterPause: false, runningContext: null };
            this.stopMoveQueue = group;
        }
        const context = { currentFilePath: this.currentFilePath, currentLineNumber: this.currentLineNumber,
            currentCommand: this.currentCommand };
        const invoke = async () => {
            if (this.paused) {
                group.resetClockAfterPause = true;
                await this.waitIfPaused();
            }
            // A queued RUN movement still needs its own STEP permit.
            if (this.stepMode) {
                group.resetClockAfterPause = true;
                await this.waitForExecutionPermit({ queuedMotion: true });
            }
            if (group.resetClockAfterPause) {
                group.timing.nextStartAt = NaN;
                group.resetClockAfterPause = false;
            }
            if (this.cancelled || group.cancelled) throw new Error('OLP stopped');
            group.runningContext = context;
            try {
                return await this.adapter.move?.(command.motion, command.pointExpression, command.speed,
                    this.project, this, { ...effectiveOptions, motionQueueTiming: group.timing });
            } catch (error) {
                const motionError = new OlpRuntimeError(error?.message || 'Queued motion failed', context);
                motionError.cause = error;
                throw motionError;
            } finally {
                if (group.runningContext === context) group.runningContext = null;
            }
        };
        const task = group.tail ? group.tail.then(invoke) : invoke();
        group.tail = task;
        group.tasks.add(task);
        this.pendingMotions.add(task);
        const settled = error => {
            if (error) group.error ||= error;
            group.tasks.delete(task);
            this.pendingMotions.delete(task);
        };
        task.then(() => settled(null), error => settled(error));
        let next = null;
        try { next = this.peekNextMotion(); } catch { /* Parse the next line after this barrier. */ }
        if (!this.canContinueStopMoveQueue(next)) {
            await this.drainStopMoveQueue();
        } else if (group.tasks.size >= 3) {
            // Implementation backpressure, not a claim about controller queue capacity.
            const waitStarted = performance.now();
            await Promise.race([...group.tasks]);
            if (performance.now() - waitStarted >= 4) this.sliceStartedAt = performance.now();
            if (group.error) throw group.error;
        }
    }

    async awaitPendingMotions() {
        await this.awaitKnownWait(this.drainStopMoveQueue());
        if (!this.pendingMotions.size) return;
        const pending = [...this.pendingMotions];
        await this.awaitKnownWait(Promise.all(pending));
    }

    async waitForInPosition() {
        if (!this.pendingMotions.size) return;
        this.phase = 'waiting';
        this.waitCondition = 'InPos';
        this.notifyCursor();
        try {
            await this.awaitPendingMotions();
            await this.waitIfPaused();
        } finally {
            this.waitCondition = '';
            if (!this.cancelled) this.phase = this.paused ? 'paused' : 'running';
            this.notifyCursor();
        }
    }

    startMotion(motionPromise, { nwait = false } = {}) {
        const pending = Promise.resolve(motionPromise);
        if (!nwait) return pending;
        this.pendingMotions.add(pending);
        pending.then(
            () => this.pendingMotions.delete(pending),
            () => this.pendingMotions.delete(pending)
        );
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
            // The editor updates the shared project while OLP is running. Refresh
            // the current program line immediately before dispatching it so a
            // completed command is never changed, while the next command uses
            // the latest source.
            const sourcesChanged = this.refreshProgramSources();
            const line = stripComments(lines[index]);
            this.currentFilePath = sourcePath || this.currentFilePath;
            this.currentLineNumber = index + 1;
            this.currentLineText = String(lines[index] || '').trim();
            this.currentCommand = line;
            this.notifyCursor();
            if (this.stopMoveQueue && (sourcesChanged
                || (line && !this.canContinueStopMoveQueue(this.stopMoveQueueCandidate(line))))) {
                await this.drainStopMoveQueue();
            }
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
                    if (guard++ >= this.maxLoopIterations) throw new Error('OLP configured For loop iteration limit exceeded.');
                    const result = await this.executeLines(lines, index + 1, close, labels, sourcePath);
                    if (result?.type === 'return') return result;
                    if (result?.type === 'goto') return result;
                    if (result?.type === 'break') break;
                    if (counter) this.writeSymbol(counter, Number(this.readSymbol(counter)) + step);
                    // The loop condition/back edge is interpreter work even
                    // for an empty body. Keep bounded cooperative execution
                    // without a separate timer on every iteration.
                    await this.waitIfPaused();
                    await this.yieldExecutionSlice();
                }
                index = close + 1;
                continue;
            }

            if (/^While\b/i.test(line)) {
                const close = findMatching(lines.slice(index, end), 0, 'While', 'EndWhile') + index;
                const condition = line.replace(/^While\b/i, '').replace(/;$/, '').trim();
                let guard = 0;
                while (this.evaluate(condition)) {
                    if (guard++ >= this.maxLoopIterations) throw new Error('OLP configured While loop iteration limit exceeded.');
                    const result = await this.executeLines(lines, index + 1, close, labels, sourcePath);
                    if (result?.type === 'return') return result;
                    if (result?.type === 'goto') return result;
                    if (result?.type === 'break') break;
                    // The loop condition/back edge is interpreter work even
                    // for an empty body. Keep bounded cooperative execution
                    // without a separate timer on every iteration.
                    await this.waitIfPaused();
                    await this.yieldExecutionSlice();
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
                    // The next dispatch already observes Pause/Stop and the
                    // cooperative instruction/CPU budget. No extra Goto timer.
                    continue;
                }
                throw this.runtimeError(`Goto target not found: ${action.target}`);
            }
            index += 1;
        }
        return null;
    }


    callBuiltinSync(target,args=[],rawArguments=[]) {
        const name=String(target).toUpperCase();
        const number=index=>{const value=Number(args[index]);if(!Number.isFinite(value))throw this.runtimeError(`Invalid ${target} numeric argument`);return value;};
        switch(name) {
            case 'ABS':return Math.abs(number(0));
            case 'MAX':return Math.max(...args.map(Number));
            case 'MIN':return Math.min(...args.map(Number));
            case 'GETTORQUE': {
                const axis=Math.trunc(number(0));
                if(axis<1||axis>16)throw this.runtimeError('GetTorque axis must be positive and within the robot axis range.');
                if(!this.adapter.getTorque)throw this.runtimeError('GetTorque requires a robot torque provider.');
                const value=this.adapter.getTorque(axis,this);
                if(!Number.isFinite(value))throw this.runtimeError('Robot torque provider must return a finite synchronous value.');
                return value;
            }
            case 'GETCURPOINTSFILENAME':return this.globalMemory.currentPointsFileName??fileName(this.activePointFile||'');
            case 'STRREPLACE':return String(args[0]??'').split(String(args[1]??'')).join(String(args[2]??''));
            case 'STRTOR': {
                const source=String(args[0]??'');
                const prefix=source.slice(0,2).toLowerCase(),base=prefix==='0x'?16:prefix==='0b'?2:prefix==='0d'?10:10;
                const text=['0x','0b','0d'].includes(prefix)?source.slice(2):source;
                const pattern=base===16?/^\s*([+-]?[0-9a-f]+)/i:base===2?/^\s*([+-]?[01]+)/:/^\s*([+-]?\d+)/;
                const match=text.match(pattern);return match?Number.parseInt(match[1],base)|0:0;
            }
            case 'STRGETDATA': {
                const source=String(args[0]??''),delimiter=String(args[1]??'');
                if(!delimiter)throw this.runtimeError('StrGetData delimiter must not be empty.');
                const reference=this.resolveAlias(rawArguments[2]||'');
                const target=reference.match(/^(LD|D)\s*\[\s*(\d+)\s*\]$/i);
                if(!target)throw this.runtimeError('StrGetData requires a numeric D/LD output array reference.');
                const values=source?source.split(delimiter):[];
                if(source.endsWith(delimiter))values.pop();
                values.forEach((value,index)=>{
                    const number=Number.parseFloat(value);
                    this.writeSymbol(`${target[1]}[${Number(target[2])+index}]`,Number.isNaN(number)?0:number);
                });
                return values.length;
            }
            case 'STRCMP': {
                const a=new TextEncoder().encode(String(args[0]??'')),b=new TextEncoder().encode(String(args[1]??''));
                for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]??0)-(b[i]??0);if(d)return d;}return 0;
            }
            case 'STRLEN':return new TextEncoder().encode(String(args[0]??'')).length;
            case 'GETPORTSTATE': {
                if(!this.adapter.socket?.getState)throw this.runtimeError('GetPortState requires a socket service.');
                return this.adapter.socket.getState(Math.trunc(number(0)),this);
            }
            case 'GETPORTBUF': {
                if(!this.adapter.socket?.getBuffer)throw this.runtimeError('GetPortbuf requires a socket service.');
                return this.adapter.socket.getBuffer(Math.trunc(number(0)),Math.trunc(number(1)),Math.trunc(number(2)),this);
            }
            case 'DIST': {
                const first=this.readPositionExpression(rawArguments[0]),second=this.readPositionExpression(rawArguments[1]);
                if(!first||!second)throw this.runtimeError('Dist requires two valid position values.');
                return Math.hypot(...[0,1,2].map(i=>Number(first[i]||0)-Number(second[i]||0)));
            }
            default:return NO_BUILTIN;
        }
    }

    async executeFunctionCall(target,argumentsList,rawArguments=[]) {
        const builtin=this.callBuiltinSync(target,argumentsList,rawArguments);
        if(builtin!==NO_BUILTIN)return builtin;
        const parts=String(target||'').split('.');
        if(parts.length>=2) {
            const requested=parts[0].toLowerCase();
            const file=this.project?.programFiles?.find(path=>fileName(path).replace(/\.pro$/i,'').toLowerCase()===requested);
            if(file)return this.executeFunction(file,parts.slice(1).join('.'),argumentsList);
            throw this.runtimeError(`Program module not found: ${target}`);
        }
        if(!this.currentFilePath)throw this.runtimeError(`Function call has no active program: ${target}`);
        return this.executeFunction(this.currentFilePath,target,argumentsList);
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
            jumpLiftHeight: null,
            jumpMiddleHeight: null,
            jumpReturnHeight: null,
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
            const jumpLiftHeight = raw.match(/^LH\s*\[\s*([^\]]+)\s*\]$/i);
            const jumpMiddleHeight = raw.match(/^MH\s*\[\s*([^\]]+)\s*\]$/i);
            const jumpReturnHeight = raw.match(/^RH\s*\[\s*([^\]]+)\s*\]$/i);
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
            else if (jumpLiftHeight) options.jumpLiftHeight = Number(parseLiteral(jumpLiftHeight[1], this)) || 0;
            else if (jumpMiddleHeight) options.jumpMiddleHeight = Number(parseLiteral(jumpMiddleHeight[1], this));
            else if (jumpReturnHeight) options.jumpReturnHeight = Number(parseLiteral(jumpReturnHeight[1], this)) || 0;
            else targets.push(raw);
        });
        if (motion === 'MOVC' && targets.length < 3) return null;
        if (motion !== 'MOVC' && !targets.length && !options.pallet) return null;
        if ((motion === 'MOVJ' || motion === 'MOVABSJ' || motion === 'JUMP') && options.speedMode === 'absolute') {
            throw new Error(`${motion} does not support Speed[n]; use V[n].`);
        }
        const hasJumpProfile = [options.jumpLiftHeight, options.jumpMiddleHeight, options.jumpReturnHeight]
            .some((value) => value !== null);
        if ((motion === 'JUMP' || motion === 'JUMPL') && options.jumpHeight === null && !hasJumpProfile) {
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
        const queuedStop = this.isStopMoveQueueCommand(command);
        if (this.stopMoveQueue && !this.canContinueStopMoveQueue(command)) await this.drainStopMoveQueue();
        if (!options.nwait && (!queuedStop || !this.stopMoveQueue)) await this.awaitPendingMotions();
        const [globalAcceleration, globalDeceleration] = this.motionSettings.acceleration || [];
        if(options.tool!==null&&options.tool!==undefined)this.motionSettings.tool=options.tool;
        if(options.wobj!==null&&options.wobj!==undefined)this.motionSettings.wobj=options.wobj;
        const effectiveOptions = {
            ...options,
            tool: options.tool ?? this.motionSettings.tool,
            wobj: options.wobj ?? this.motionSettings.wobj,
            acceleration: globalAcceleration > 0 ? globalAcceleration : options.acceleration,
            deceleration: globalDeceleration > 0 ? globalDeceleration : options.deceleration,
            accelerationRamp: this.motionSettings.accelerationRamp,
            rapidMove: this.motionSettings.rapidMove,
            slvsMode: this.motionSettings.slvsMode,
            gripLoad: this.motionSettings.gripLoad
        };
        if (queuedStop) {
            await this.enqueueStopMove(command, effectiveOptions);
            return;
        }
        if ((motion === 'JUMP' || motion === 'JUMPL') ? !this.adapter.jump : !this.adapter.move) throw this.runtimeError(`No motion adapter for ${motion}`);
        const invoke = motion === 'JUMP' || motion === 'JUMPL'
            ? this.adapter.jump?.(motion, pointExpression, speed, this.project, this, effectiveOptions)
            : this.adapter.move?.(motion, pointExpression, speed, this.project, this, effectiveOptions);
        const started = this.startMotion(invoke, effectiveOptions);
        if (started) {
            const waitStarted = performance.now();
            await started;
            if (performance.now() - waitStarted >= 4) this.sliceStartedAt = performance.now();
        }
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



    async savePoints() {
        const file=this.project?.pointFiles?.find(file=>fileName(file.path).toLowerCase()===fileName(this.activePointFile).toLowerCase());
        if(!file)throw this.runtimeError('SavePoints requires an active point file.');
        const values=new Map();
        for(const record of file.records||[]) {
            const kind=record.sourceSymbol||(record.kind==='jointPoint'?'JP':'P'),key=`${kind}[${record.index}]`;
            const bank=isModuleLocal(key)?this.moduleBank().positionVariables:this.positionVariables;
            const pose=getCaseInsensitive(bank,key);
            if(!pose)continue;
            record.values=[...pose];values.set(key.toUpperCase(),pose);
        }
        const record=this.project?.files?.get(file.path);
        let text=record?.text??file.text;
        if(typeof text==='string') {
            text=text.replace(/\b(JP|LP|P)\s*\[\s*(\d+)\s*\]\s*=\s*([^;\r\n]+)/gi,(original,kind,index)=>{
                const pose=values.get(`${kind.toUpperCase()}[${Number(index)}]`);
                return pose?`${kind}[${index}] = ${pose.map(Number).join(', ')}`:original;
            });
            if(record)record.text=text;file.text=text;
        }
        await this.adapter.savePoints?.({path:file.path,text,records:file.records},this);
    }

    async evaluateAssignmentValue(expression) {
        const source=String(expression||'').trim();
        const current=source.match(/^GetCur(J)?Pos\s*\(.*\)$/i);
        if(current) {
            if(!this.adapter.getCurrentPosition)throw this.runtimeError('GetCurPos requires a robot position provider.');
            const pose=await this.adapter.getCurrentPosition(current[1]?'jointPoint':'point',this);
            if(!Array.isArray(pose))throw this.runtimeError('Robot position provider did not return a position.');
            return pose;
        }
        const call=source.match(/^([\w.]+)\s*\((.*)\)$/);
        if(call&&!/^(Offset)$/i.test(call[1])) {
            const raw=splitArguments(call[2]);
            return this.executeFunctionCall(call[1],raw.map(arg=>parseLiteral(arg,this)),raw);
        }
        return parseLiteral(source,this);
    }

    async executeAssignment(target,expression) {
        const variable=this.resolveAlias(target),rawExpression=String(expression||'').trim().replace(/;$/,'');
        const currentPosition=this.resolvePositionReference(variable);
        const pose=currentPosition&&!/^GetCur(J)?Pos\s*\(/i.test(rawExpression)?this.readPositionExpression(rawExpression):null;
        if(currentPosition&&pose){this.writeSymbol(variable,pose);return;}
        this.writeSymbol(variable,await this.evaluateAssignmentValue(rawExpression));
    }

    async executeLine(line) {
        this.scanRemoteVelocityInput();
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
            if(Number(this.adapter.taskId||0)!==0)throw this.runtimeError('LoadPoints is available only in the main motion task.');
            await this.waitForInPosition();
            this.activePointFile = matched.path;
            this.globalMemory.currentPointsFileName = requested;
            for (const record of matched.records || []) {
                const kind=record.sourceSymbol||(record.kind==='jointPoint'?'JP':'P');
                this.writeSymbol(`${kind}[${record.index}]`,record.values);
            }
            return;
        }
        const include = value.match(/^Include\s+["']?([^"';]+)["']?\s*;?$/i);
        if (include) {
            const requested = include[1].trim();
            const present = this.project?.programFiles?.some((path) => fileName(path).toLowerCase() === fileName(requested).toLowerCase());
            if (!present) throw this.runtimeError(`Included program file not found: ${requested}`);
            return;
        }

        if (/^Open\s+Socket\b/i.test(value)) {
            const match=value.match(/^Open\s+Socket\s*\((.*)\)\s*;?$/i);
            if(!match)throw this.runtimeError(`Invalid socket open: ${value}`);
            const args=splitArguments(match[1]);
            const config={host:String(parseLiteral(args[0],this)),port:Number(parseLiteral(args[1],this)),channel:Math.trunc(Number(parseLiteral(args[2],this))),mode:String(args[3]||'Single').trim()};
            let result;
            if(this.adapter.socket?.open)result=await this.adapter.socket.open(config,this);
            else if(this.adapter.openSocket)result=await this.adapter.openSocket(value,this,config);
            else throw this.runtimeError('Open Socket requires a socket service.');
            if(result!==0&&result!==1)throw this.runtimeError('Socket open service must return native success 1 or failure 0.');
            if(args[4])this.writeSymbol(args[4],result);
            return;
        }
        const waitInPos=value.match(/^WaitInPos(?:\s*\(\s*[-+]?(?:\d+(?:\.\d*)?|\.\d+)\s*\))?\s*;?$/i);
        if(waitInPos){await this.waitForInPosition();return;}
        const closeSocket=value.match(/^Close\s+Socket\s*,\s*(.+?)\s*;?$/i);
        const sendPort=value.match(/^Send\s+Port\s*\[([^\]]+)\]\s*,\s*(.+?)\s*;?$/i);
        const getPort=value.match(/^Get\s+Port\s*\[([^\]]+)\](?:\s*,\s*T\s*\[([^\]]+)\])?(?:\s*,\s*Goto\s+(.+?))?\s*;?$/i);
        if(closeSocket||sendPort||getPort) {
            const channel=Math.trunc(Number(parseLiteral((closeSocket||sendPort||getPort)[1],this)));
            const operation=closeSocket?'close':sendPort?'send':'receive';
            const options={operation,channel};
            if(sendPort)options.data=String(parseLiteral(sendPort[2],this));
            if(getPort)options.timeoutSeconds=getPort[2]?Number(parseLiteral(getPort[2],this)):null;
            let result;
            if(this.adapter.socket?.[operation]) {
                const pending=this.adapter.socket[operation](channel,operation==='send'?options.data:operation==='receive'?options.timeoutSeconds:this,this);
                result=operation==='receive'?await this.awaitKnownWait(pending):await pending;
            } else if(this.adapter.socketCommand) {
                const pending=this.adapter.socketCommand(value,this,options);
                result=operation==='receive'?await this.awaitKnownWait(pending):await pending;
            }
            else throw this.runtimeError(`${operation} requires a socket service.`);
            if(getPort&&result===false&&getPort[3])return {type:'goto',target:getPort[3].trim()};
            if(getPort&&typeof result!=='boolean')throw this.runtimeError('Socket receive service must return a boolean completion result.');
            return;
        }
        if(/^SetPortBuf\b/i.test(value))throw this.runtimeError('SetPortBuf is not emitted by the supported project generator.');
        if(/^SavePoints\s*;?$/i.test(value)){await this.savePoints();return;}
        const print = value.match(/^Print\s+(.+?)\s*;?$/i);
        if (print) {
            this.adapter.log?.(`PRINT: ${formatPrintExpression(print[1], this)}`);
            return;
        }


        const clear=value.match(/^Clear\s+(.+?)\s*;?$/i);
        if(clear) {
            const args=splitArguments(clear[1].replace(/;$/,''));
            if(/^All$/i.test(args[0])) {
                for(const bank of [this.globalMemory,...this.localsByModule.values(),...this.functionScopes])
                    for(const key of ['variables','variableTypes','arrayDeclarations','positionVariables'])bank[key]?.clear();
                this.ioGroups.clear();this.pallets.clear();this.stopwatches.clear();
                Object.assign(this.motionSettings,{acceleration:null,accelerationRamp:null,rapidMove:null,slvsMode:'OFF',gripLoad:null});
                this.velocitySet=null;return;
            }
            const port=args[0]?.match(/^Port\s*\[(.+)\]$/i);
            if(port) {
                if(!this.adapter.socket?.clear)throw this.runtimeError('Clear Port requires a socket service.');
                await this.adapter.socket.clear(Math.trunc(Number(parseLiteral(port[1],this))),this);return;
            }
            const target=this.resolveAlias(args[0]),range=target.match(/^(.*)\[\s*(-?\d+)\s*\]$/);
            const count=args[1]===undefined?1:Math.trunc(Number(parseLiteral(args[1],this)));
            if(!Number.isInteger(count)||count<=0||count>1_000_000)throw this.runtimeError('Invalid Clear count.');
            if(!range&&count!==1)throw this.runtimeError('Clear range requires an indexed target.');
            const address=normalizeAddress(target,this.project?.labels||{});
            const boundedCount=address?.prefix==='OUT'?Math.max(0,Math.min(count,13824-address.index)):count;
            for(let i=0;i<boundedCount;i++)this.writeSymbol(range?`${range[1]}[${Number(range[2])+i}]`:target,/^(L?Str)/i.test(target)?'':0);
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
            const [mode, state] = splitArguments(rapid[1]).map((argument) => String(argument).trim().replace(/^['"]|['"]$/g, '').toUpperCase());
            if (!['CP', 'PTP', 'ALL'].includes(mode) || !['ON', 'OFF'].includes(state)) {
                throw this.runtimeError('RapidMove requires CP/PTP/ALL and ON/OFF.');
            }
            const previous = this.motionSettings.rapidMove || {};
            this.motionSettings.rapidMove = {
                ...previous,
                ...(mode === 'CP' || mode === 'ALL' ? {cp: state === 'ON'} : {}),
                ...(mode === 'PTP' || mode === 'ALL' ? {ptp: state === 'ON'} : {})
            };
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
            } else if (velsetValue) {
                this.velocitySet = Math.max(1, Math.min(100, Number(parseLiteral(velsetValue[1] || velsetValue[2], this)) || 100));
            } else {
                this.velocitySet = null;
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
        const declaration=this.parseDeclaration(value);
        if(declaration){await this.executeDeclaration(declaration);return;}
        const assignment = value.match(/^(?:(?:Global|Local)\s+)?(?:(Int|Real|Float|Bool|String|Byte|DInt|Double)\s+)?(.+?)\s*(?:=|:=)\s*(.+?)\s*;?$/i);
        if (assignment && !/^If|^ElseIf|^Switch/i.test(value)) {
            if (assignment[1]) this.declareVariable(assignment[2], assignment[1]);
            await this.executeAssignment(assignment[2], assignment[3]);
            return;
        }
        const call = value.match(/^([\w.]+)\s*\((.*)\)\s*;?$/);
        if (call) {
            await this.executeFunctionCall(call[1], splitArguments(call[2]).map((argument) => parseLiteral(argument, this)),splitArguments(call[2]));
            return;
        }
        const delay = value.match(/^Delay\s+(?:T\s*\[\s*([^\]]+)\s*\]|\[?\s*([^\]\s]+)\s*\]?)\s*;?$/i);
        if (delay) {
            await this.waitForDelay(timerMilliseconds(parseLiteral(delay[1] || delay[2], this)));
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
