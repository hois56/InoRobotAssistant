import { copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The source checkout and the transferable simulator use the same layout.
const here = path.dirname(fileURLToPath(import.meta.url));
const target = 'wasm32-unknown-unknown';

export async function buildEngine() {
    const result = spawnSync('cargo', ['build', '--locked', '--release', '--target', target], {
        cwd: here, stdio: 'inherit'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Cargo exited with code ' + result.status);
    const output = path.resolve(here, process.env.CARGO_TARGET_DIR || 'target');
    await copyFile(path.join(output, target, 'release', 'inorobot_simulation.wasm'),
        path.resolve(here, '../2_3DSimulation/wasm/simulation.wasm'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await buildEngine();
}
