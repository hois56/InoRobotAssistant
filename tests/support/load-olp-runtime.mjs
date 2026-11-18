import vm from 'node:vm';
import { evaluateOlpExpression, olpPoseOffset } from '../../2_3DSimulation/wasm/engine.mjs';

// Keep each test's simulated clock and timer queue, and bind the same Rust
// expression evaluator that the normal ES module imports in the browser.
export function loadOlpRuntime(source, context) {
    context.evaluateOlpExpression = evaluateOlpExpression;
    context.olpPoseOffset = olpPoseOffset;
    const script = source.replace("import { evaluateOlpExpression, olpPoseOffset } from './wasm/engine.mjs';", '')
        .replace(/\bexport\s+(?=(?:const|class|function))/g, '')
        .replace(/^export\s*\{[^}]+\};?\s*$/mg, '');
    return vm.runInContext(script + '\nOlpRuntime', context);
}
