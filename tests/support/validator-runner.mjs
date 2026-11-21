import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Every tools/validate-* script belongs to exactly one group. The group's fast
// test runs when files of its page area or any validator change (see
// tools/test-selection.mjs), so these source-level checks cannot silently rot.
export const VALIDATOR_GROUPS = {
    simulation: [
        'validate-2d-cad-import.mjs', 'validate-3d-kinematics.cjs', 'validate-3d-model-export.mjs',
        'validate-3d-simulation-cad-placement.mjs', 'validate-3d-simulation-cad-view.mjs',
        'validate-3d-simulation-cut-direction.mjs', 'validate-3d-simulation-measurement.mjs',
        'validate-3d-simulation-model-context-menu.mjs', 'validate-3d-simulation-sketch-view.mjs',
        'validate-3d-simulation-tool-load-info.mjs', 'validate-collaboration.mjs', 'validate-collision-system.mjs',
        'validate-end-monitoring.mjs', 'validate-interference-zones.mjs', 'validate-io-function-mapping.mjs',
        'validate-io-simulator.mjs', 'validate-model-part-transform.mjs', 'validate-model-visibility.mjs',
        'validate-motion-program.mjs', 'validate-olp-arm-parameters.mjs', 'validate-olp-jump-parameters.mjs',
        'validate-olp-point-context-menu.mjs', 'validate-olp-point-file-selection.mjs', 'validate-olp-shared-io.mjs',
        'validate-olp-virtual-bus.mjs', 'validate-olp-wait-in-position.mjs', 'validate-path-planning.mjs',
        'validate-primitive-shapes.mjs', 'validate-virtual-controller.mjs', 'validate-workspace-recovery.mjs'
    ],
    tool: [
        'validate-continuous-transform-rotation.mjs', 'validate-tool-mode-d-step-export.mjs',
        'validate-tool-mode-d-step-import.mjs', 'validate-tool-mode-d.mjs'
    ],
    site: ['validate-localized-site.cjs', 'validate-analytics-worker.mjs', 'validate-visitor-counter.mjs']
};

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const run = promisify(execFile);

export function listValidatorScripts() {
    return readdirSync(new URL('../../tools/', import.meta.url)).filter(name => /^validate-.*\.(?:mjs|cjs)$/.test(name)).sort();
}

export function defineValidatorTests(group) {
    describe(`tools validators (${group})`, { concurrency: 4 }, () => {
        for (const name of VALIDATOR_GROUPS[group]) {
            it(name, async () => {
                try {
                    await run(process.execPath, [`tools/${name}`], { cwd: repoRoot, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
                } catch (error) {
                    const output = `${error.stdout || ''}\n${error.stderr || ''}`.trim().split(/\r?\n/).slice(-15).join('\n');
                    assert.fail(`${name} failed (exit ${error.code ?? error.signal}):\n${output}`);
                }
            });
        }
    });
}
