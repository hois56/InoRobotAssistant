import { copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The source checkout and the transferable simulator use the same layout.
const here = path.dirname(fileURLToPath(import.meta.url));
const target = 'wasm32-unknown-unknown';
const assets = path.resolve(here, '../2_3DSimulation/wasm');

function buildWasm(directory, binary) {
    const result = spawnSync('cargo', ['build', '--locked', '--release', '--target', target], {
        cwd: directory, stdio: 'inherit'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Cargo exited with code ' + result.status);
    const output = path.resolve(directory, process.env.CARGO_TARGET_DIR || 'target');
    return path.join(output, target, 'release', binary);
}

export async function buildEngine() {
    const engine = buildWasm(here, 'inorobot_simulation.wasm');
    const reader = buildWasm(path.join(here, 'solidworks'), 'inorobot_solidworks_display.wasm');
    const output = path.dirname(reader);
    const binding = spawnSync(process.env.WASM_BINDGEN || 'wasm-bindgen', [
        reader, '--target', 'web', '--no-typescript', '--out-dir', output, '--out-name', 'solidworks-display'
    ], { stdio: 'inherit' });
    if (binding.error?.code === 'ENOENT') throw new Error('Install wasm-bindgen-cli 0.2.130 to build the SolidWorks reader.');
    if (binding.error) throw binding.error;
    if (binding.status !== 0) throw new Error('wasm-bindgen exited with code ' + binding.status);
    await Promise.all([
        copyFile(engine, path.join(assets, 'simulation.wasm')),
        copyFile(path.join(output, 'solidworks-display.js'), path.join(assets, 'solidworks-display.mjs')),
        copyFile(path.join(output, 'solidworks-display_bg.wasm'), path.join(assets, 'solidworks-display.wasm'))
    ]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await buildEngine();
}
