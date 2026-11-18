import { engine } from './engine.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
// These operations are suspension points of the per-robot Rust interpreter.
const CURSOR = 1, COMMAND = 2, CONDITION = 3, INIT_FOR = 4, STEP_FOR = 5,
    LOOP_YIELD = 6, SWITCH_VALUE = 7, CASE_VALUE = 8, LIMIT = 9;

function updateSource(task, lines) {
    const bytes = encoder.encode(lines.join('\n'));
    const address = engine.flow_input(task, bytes.length);
    new Uint8Array(engine.memory.buffer, address, bytes.length).set(bytes);
    engine.flow_set_source(task);
}

export async function runOlpFlow(runtime, lines, start, end, labels, sourcePath, syntax) {
    const { stripComments, splitArguments, normalizeLabel, normalizeRuntimeSymbol, parseLiteral } = syntax;
    const literal = source => parseLiteral(source, runtime);
    const task = engine.flow_new(start, end, runtime.maxLoopIterations);
    const text = () => decoder.decode(new Uint8Array(engine.memory.buffer, engine.flow_text(task), engine.flow_len(task)));
    const counters = [];
    let source = runtime.programs.get(sourcePath);
    let action, switchValue, status = 0, destination = 0;
    try {
        updateSource(task, lines);
        for (;;) {
            const op = engine.flow_poll(task, status, destination);
            status = 0;
            if (op <= 0) return op === 0 ? null : action;
            const index = engine.flow_index(task);
            switch (op) {
                case CURSOR: {
                    await runtime.waitForExecutionPermit();
                    await runtime.yieldExecutionSlice();
                    const changed = runtime.refreshProgramSources();
                    const current = runtime.programs.get(sourcePath);
                    if (current !== source) {
                        updateSource(task, lines);
                        source = current;
                    }
                    const command = stripComments(lines[index]);
                    runtime.currentFilePath = sourcePath || runtime.currentFilePath;
                    runtime.currentLineNumber = index + 1;
                    runtime.currentLineText = String(lines[index] || '').trim();
                    runtime.currentCommand = command;
                    runtime.notifyCursor();
                    if (runtime.stopMoveQueue && (changed || (command
                        && !runtime.canContinueStopMoveQueue(runtime.stopMoveQueueCandidate(command))))) {
                        await runtime.drainStopMoveQueue();
                    }
                    break;
                }
                case COMMAND: {
                    action = await runtime.executeLine(text());
                    let timedOut = false;
                    if (action?.type === 'wait') {
                        const satisfied = await runtime.waitForCondition(action.condition, action.timeout);
                        timedOut = !satisfied && Boolean(action.target);
                        action = timedOut ? { type: 'goto', target: action.target } : null;
                    }
                    if (action?.type === 'goto') {
                        destination = labels.get(normalizeLabel(action.target));
                        if (destination === undefined) throw runtime.runtimeError(
                            (timedOut ? 'Wait timeout target not found: ' : 'Goto target not found: ') + action.target);
                        status = 4;
                    } else if (action?.type === 'return') status = 3;
                    else if (action?.type === 'continue') status = 2;
                    else if (action?.type === 'break') status = 1;
                    break;
                }
                case CONDITION:
                    status = Number(runtime.evaluate(index ? counters[index - 1].condition : text()));
                    break;
                case INIT_FOR: {
                    const [initial = '', condition = 'OFF', increment = ''] = splitArguments(text());
                    const stepExpression = increment.match(/^Step\s*\[\s*(.+)\s*\]$/i)?.[1];
                    const step = Number(literal(stepExpression || '1')) || 1;
                    const assign = initial.match(/^(.+?)\s*(?:=|:=)\s*(.+)$/);
                    const counter = assign ? normalizeRuntimeSymbol(assign[1], runtime) : null;
                    if (assign) runtime.writeSymbol(assign[1], literal(assign[2]));
                    counters[index] = { counter, step, condition: condition || 'OFF' };
                    break;
                }
                case STEP_FOR: {
                    const { counter, step } = counters[index];
                    if (counter) runtime.writeSymbol(counter, Number(runtime.readSymbol(counter)) + step);
                    break;
                }
                case LOOP_YIELD:
                    await runtime.waitIfPaused();
                    await runtime.yieldExecutionSlice();
                    break;
                case SWITCH_VALUE: switchValue = literal(text()); break;
                case CASE_VALUE: {
                    const expression = text();
                    const range = expression.match(/^(.+?)\s+To\s+(.+)$/i);
                    status = Number(range ? switchValue >= literal(range[1]) && switchValue <= literal(range[2])
                        : literal(expression) === switchValue);
                    break;
                }
                case LIMIT: {
                    const name = text() === 'FOR' ? 'For' : 'While';
                    throw new Error('OLP configured ' + name + ' loop iteration limit exceeded.');
                }
                default: throw new Error('Unknown OLP control operation ' + op);
            }
        }
    } finally {
        engine.flow_drop(task);
    }
}
