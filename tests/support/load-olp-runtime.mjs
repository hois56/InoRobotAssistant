import vm from 'node:vm';
import { runOlpFlow } from '../../2_3DSimulation/wasm/olp-flow.mjs';
import { evaluateOlpCondition, evaluateOlpExpression, olpPoseOffset } from '../../2_3DSimulation/wasm/engine.mjs';

// Keep each test's simulated clock and timer queue, and bind the same Rust
// expression evaluator that the normal ES module imports in the browser.
export function loadOlpRuntime(source, context) {
    context.runOlpFlow = runOlpFlow;
    context.evaluateOlpCondition = evaluateOlpCondition;
    context.evaluateOlpExpression = evaluateOlpExpression;
    context.olpPoseOffset = olpPoseOffset;
    const script = source.replace(/^import \{ [^\n]+ \} from '\.\/wasm\/engine\.mjs';$/m, '')
        .replace("import { runOlpFlow } from './wasm/olp-flow.mjs';", '')
        .replace(/\bexport\s+(?=(?:const|class|function))/g, '')
        .replace(/^export\s*\{[^}]+\};?\s*$/mg, '');
    return vm.runInContext(script + '\nOlpRuntime', context);
}
